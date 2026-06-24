import {
  Injectable,
  UnauthorizedException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { Database } from '../database/database.types';
import { DatabaseService } from '../database/database.service';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { SesService } from '../ses/ses.service';

type MailOptions = {
  from: string;
  to: string;
  replyTo?: string;
  headers?: Record<string, string>;
  subject: string;
  text: string;
  html: string;
  list?: Record<string, string>;
};

@Injectable()
export class EmailService implements OnModuleInit {
  private db: Kysely<Database>;
  private smtpTransporter: nodemailer.Transporter;
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly dbService: DatabaseService,
    private readonly configService: ConfigService,
    private jwtService: JwtService,
    private readonly sesService: SesService,
  ) {}

  onModuleInit() {
    this.db = this.dbService.getDb();
    this.smtpTransporter = nodemailer.createTransport({
      host: this.configService.get('MAIL_HOST'),
      port: this.configService.get('MAIL_PORT'),
      secure: false,
      auth: {
        user: this.configService.get('MAIL_USER'),
        pass: this.configService.get('MAIL_PASS'),
      },
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  /**
   * Returns the SES transporter for a project if one is configured,
   * falling back to the global SMTP transporter.
   */
  private async resolveTransporter(
    project_id?: string,
  ): Promise<nodemailer.Transporter> {
    if (project_id) {
      try {
        const sesTransporter =
          await this.sesService.buildTransporterForProject(project_id);
        if (sesTransporter) return sesTransporter;
      } catch (err) {
        this.logger.warn(
          `Failed to build SES transporter for project ${project_id}: ${err.message}`,
        );
      }
    }
    return this.smtpTransporter;
  }

  async getCampaignEmails(
    campaign_id: string,
    limit: number = 10,
    offset: number = 0,
  ) {
    return await this.db
      .selectFrom('emails')
      .where('campaign_id', '=', campaign_id)
      .selectAll()
      .offset(offset)
      .limit(limit)
      .execute();
  }

  sendEmail = async (
    to: string,
    subject: string,
    text: string,
    html: string,
    mail_from: string,
    unsubscribeUrl?: string,
    project_id?: string,
  ) => {
    let mailOptions: MailOptions = {
      from: mail_from,
      to,
      subject,
      text,
      html,
    };

    if (unsubscribeUrl) {
      mailOptions = {
        ...mailOptions,
        list: {
          url: unsubscribeUrl,
          comment: 'Are you sure about unsubscribe to the list',
        },
      };
    }

    const transporter = await this.resolveTransporter(project_id);
    const info = await transporter.sendMail(mailOptions);
    return info;
  };

  sendTransactionalEmails = async (
    mailOptions: MailOptions,
    project_id?: string,
  ) => {
    const transporter = await this.resolveTransporter(project_id);
    const info = await transporter.sendMail(mailOptions);
    return info;
  };

  async emailOpened(token: string) {
    const verifiedToken = this.jwtService.verify(token, {
      secret: this.configService.get('JWT_SECRET'),
    });

    const { campaign_id, project_id } = verifiedToken;

    console.log('Verified Token', verifiedToken);

    await this.db
      .insertInto('email_views')
      .values({
        campaign_id: campaign_id,
        project_id: project_id,
        opened_at: new Date().toISOString(),
      })
      .executeTakeFirst();

    this.updateEmailView(campaign_id);
    return;
  }

  async trackEmailClick(token: string) {
    let verifiedToken;
    try {
      verifiedToken = await this.jwtService.verify(token, {
        secret: this.configService.get('JWT_SECRET'),
      });
    } catch (error) {
      throw new UnauthorizedException();
    }

    await this.db
      .insertInto('email_clicks')
      .values({
        campaign_id: verifiedToken.campaign_id,
        project_id: verifiedToken.project_id,
      })
      .execute();

    this.updateEmailClick(verifiedToken.campaign_id);

    return verifiedToken.originalURL;
  }

  private async updateEmailClick(campaign_id: string) {
    try {
      await this.db
        .updateTable('campaigns')
        .where('campaigns.id', '=', campaign_id)
        .set({
          total_clicks: sql`total_clicks + 1`,
        })
        .executeTakeFirst();
    } catch (error) {
      this.logger.error(error);
    }
  }

  private async updateEmailView(campaign_id: string) {
    try {
      await this.db
        .updateTable('campaigns')
        .where('campaigns.id', '=', campaign_id)
        .set({
          total_opens: sql`total_opens + 1`,
        })
        .executeTakeFirst();
    } catch (error) {
      this.logger.error(error);
    }
  }

  async deleteEmails() {
    return this.db.deleteFrom('emails').returning('id').execute();
  }
}
