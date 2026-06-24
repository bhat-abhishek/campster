import {
  Injectable,
  Logger,
  OnModuleInit,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import * as nodemailer from 'nodemailer';
import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { Database } from '../database/database.types';
import { CreateSesConfigDto, SesAuthMethod } from './dto/ses-config.dto';
import { encrypt, decrypt } from '@/utils/encryption';
import { generateUlid } from '@/utils/generators';

@Injectable()
export class SesService implements OnModuleInit {
  private db: Kysely<Database>;
  private readonly logger = new Logger(SesService.name);

  constructor(
    private readonly dbService: DatabaseService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    this.db = this.dbService.getDb();
  }

  private get encryptionKey(): string {
    const key = this.configService.get<string>('SES_ENCRYPTION_KEY');
    if (!key) {
      throw new Error(
        'SES_ENCRYPTION_KEY env var is required to store SES credentials',
      );
    }
    return key;
  }

  async createOrUpdateConfig(dto: CreateSesConfigDto) {
    const existing = await this.db
      .selectFrom('ses_configs')
      .where('project_id', '=', dto.project_id)
      .select('id')
      .executeTakeFirst();

    const values = this.buildDbValues(dto);

    if (existing) {
      return this.db
        .updateTable('ses_configs')
        .where('project_id', '=', dto.project_id)
        .set({ ...values, updated_at: sql`now()` })
        .returningAll()
        .executeTakeFirst();
    }

    return this.db
      .insertInto('ses_configs')
      .values({ id: generateUlid(), ...values })
      .returningAll()
      .executeTakeFirst();
  }

  async getConfigByProject(project_id: string) {
    const config = await this.db
      .selectFrom('ses_configs')
      .where('project_id', '=', project_id)
      .select([
        'id',
        'project_id',
        'auth_method',
        'region',
        'smtp_host',
        'smtp_port',
        'created_at',
        'updated_at',
        // never return encrypted secrets; just indicate they are set
      ])
      .executeTakeFirst();

    if (!config) return null;

    const raw = await this.db
      .selectFrom('ses_configs')
      .where('project_id', '=', project_id)
      .select([
        'access_key_id_encrypted',
        'smtp_user_encrypted',
      ])
      .executeTakeFirst();

    return {
      ...config,
      has_access_key: !!raw?.access_key_id_encrypted,
      has_smtp_credentials: !!raw?.smtp_user_encrypted,
    };
  }

  async deleteConfig(project_id: string) {
    const result = await this.db
      .deleteFrom('ses_configs')
      .where('project_id', '=', project_id)
      .returning('id')
      .executeTakeFirst();

    if (!result) throw new NotFoundException('SES config not found');
    return result;
  }

  /**
   * Builds a nodemailer transporter for the given project using its SES config.
   * Returns null if no SES config exists for the project (caller should fall back to SMTP).
   */
  async buildTransporterForProject(
    project_id: string,
  ): Promise<nodemailer.Transporter | null> {
    const config = await this.db
      .selectFrom('ses_configs')
      .where('project_id', '=', project_id)
      .selectAll()
      .executeTakeFirst();

    if (!config) return null;

    const method = config.auth_method as SesAuthMethod;
    const region = config.region || this.configService.get('AWS_REGION') || 'us-east-1';

    if (method === SesAuthMethod.IAM_CREDENTIALS) {
      if (!config.access_key_id_encrypted || !config.secret_access_key_encrypted) {
        this.logger.warn(`Project ${project_id} SES config missing IAM credentials`);
        return null;
      }
      const accessKeyId = decrypt(config.access_key_id_encrypted, this.encryptionKey);
      const secretAccessKey = decrypt(config.secret_access_key_encrypted, this.encryptionKey);

      const ses = new SESClient({
        region,
        credentials: { accessKeyId, secretAccessKey },
      });

      return nodemailer.createTransport({
        SES: { ses, aws: { SendRawEmailCommand } },
      });
    }

    if (method === SesAuthMethod.ENVIRONMENT) {
      // Uses AWS default credential chain: env vars, IAM role, instance profile, etc.
      const ses = new SESClient({ region });
      return nodemailer.createTransport({
        SES: { ses, aws: { SendRawEmailCommand } },
      });
    }

    if (method === SesAuthMethod.SES_SMTP) {
      if (!config.smtp_host || !config.smtp_user_encrypted || !config.smtp_pass_encrypted) {
        this.logger.warn(`Project ${project_id} SES SMTP config incomplete`);
        return null;
      }
      const user = decrypt(config.smtp_user_encrypted, this.encryptionKey);
      const pass = decrypt(config.smtp_pass_encrypted, this.encryptionKey);

      return nodemailer.createTransport({
        host: config.smtp_host,
        port: config.smtp_port || 587,
        secure: config.smtp_port === 465,
        auth: { user, pass },
        tls: { rejectUnauthorized: false },
      });
    }

    this.logger.warn(`Unknown SES auth method: ${method}`);
    return null;
  }

  private buildDbValues(dto: CreateSesConfigDto) {
    const base = {
      project_id: dto.project_id,
      auth_method: dto.auth_method,
      region: dto.region ?? null,
      access_key_id_encrypted: null as string | null,
      secret_access_key_encrypted: null as string | null,
      smtp_host: null as string | null,
      smtp_port: null as number | null,
      smtp_user_encrypted: null as string | null,
      smtp_pass_encrypted: null as string | null,
    };

    if (dto.auth_method === SesAuthMethod.IAM_CREDENTIALS) {
      if (!dto.access_key_id || !dto.secret_access_key) {
        throw new BadRequestException(
          'access_key_id and secret_access_key are required for iam_credentials auth method',
        );
      }
      base.access_key_id_encrypted = encrypt(dto.access_key_id, this.encryptionKey);
      base.secret_access_key_encrypted = encrypt(dto.secret_access_key, this.encryptionKey);
    }

    if (dto.auth_method === SesAuthMethod.SES_SMTP) {
      if (!dto.smtp_host || !dto.smtp_user || !dto.smtp_pass) {
        throw new BadRequestException(
          'smtp_host, smtp_user, and smtp_pass are required for ses_smtp auth method',
        );
      }
      base.smtp_host = dto.smtp_host;
      base.smtp_port = dto.smtp_port ?? 587;
      base.smtp_user_encrypted = encrypt(dto.smtp_user, this.encryptionKey);
      base.smtp_pass_encrypted = encrypt(dto.smtp_pass, this.encryptionKey);
    }

    return base;
  }
}
