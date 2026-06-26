import {
  Injectable,
  Logger,
  OnModuleInit,
  NotFoundException,
} from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { Database } from '../database/database.types';
import { CreateSendgridConfigDto } from './dto/sendgrid-config.dto';
import { encrypt, decrypt } from '@/utils/encryption';
import { generateUlid } from '@/utils/generators';

const SENDGRID_SMTP_HOST = 'smtp.sendgrid.net';
const SENDGRID_SMTP_PORT = 587;
const SENDGRID_SMTP_USER = 'apikey';

@Injectable()
export class SendgridService implements OnModuleInit {
  private db: Kysely<Database>;
  private readonly logger = new Logger(SendgridService.name);

  constructor(
    private readonly dbService: DatabaseService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    this.db = this.dbService.getDb();
  }

  private get encryptionKey(): string {
    const key = this.configService.get<string>('SENDGRID_ENCRYPTION_KEY');
    if (!key) {
      throw new Error(
        'SENDGRID_ENCRYPTION_KEY env var is required to store SendGrid credentials',
      );
    }
    return key;
  }

  async createOrUpdateConfig(dto: CreateSendgridConfigDto) {
    const existing = await this.db
      .selectFrom('sendgrid_configs')
      .where('project_id', '=', dto.project_id)
      .select('id')
      .executeTakeFirst();

    const values = {
      project_id: dto.project_id,
      api_key_encrypted: encrypt(dto.api_key, this.encryptionKey),
      from_email: dto.from_email ?? null,
      from_name: dto.from_name ?? null,
    };

    if (existing) {
      return this.db
        .updateTable('sendgrid_configs')
        .where('project_id', '=', dto.project_id)
        .set({ ...values, updated_at: sql`now()` })
        .returningAll()
        .executeTakeFirst();
    }

    return this.db
      .insertInto('sendgrid_configs')
      .values({ id: generateUlid(), ...values })
      .returningAll()
      .executeTakeFirst();
  }

  async getConfigByProject(project_id: string) {
    const config = await this.db
      .selectFrom('sendgrid_configs')
      .where('project_id', '=', project_id)
      .select([
        'id',
        'project_id',
        'from_email',
        'from_name',
        'created_at',
        'updated_at',
        // api_key_encrypted is intentionally excluded from the public response
      ])
      .executeTakeFirst();

    if (!config) return null;

    return { ...config, has_api_key: true };
  }

  async deleteConfig(project_id: string) {
    const result = await this.db
      .deleteFrom('sendgrid_configs')
      .where('project_id', '=', project_id)
      .returning('id')
      .executeTakeFirst();

    if (!result) throw new NotFoundException('SendGrid config not found');
    return result;
  }

  /**
   * Builds a nodemailer transporter for the given project using its SendGrid
   * API key via the SendGrid SMTP relay. Returns null when no config exists.
   */
  async buildTransporterForProject(
    project_id: string,
  ): Promise<nodemailer.Transporter | null> {
    const config = await this.db
      .selectFrom('sendgrid_configs')
      .where('project_id', '=', project_id)
      .selectAll()
      .executeTakeFirst();

    if (!config) return null;

    let apiKey: string;
    try {
      apiKey = decrypt(config.api_key_encrypted, this.encryptionKey);
    } catch (err) {
      this.logger.warn(
        `Failed to decrypt SendGrid API key for project ${project_id}: ${err.message}`,
      );
      return null;
    }

    return nodemailer.createTransport({
      host: SENDGRID_SMTP_HOST,
      port: SENDGRID_SMTP_PORT,
      secure: false,
      auth: {
        user: SENDGRID_SMTP_USER,
        pass: apiKey,
      },
    });
  }
}
