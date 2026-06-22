import {
  Injectable,
  OnModuleInit,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as cheerio from 'cheerio';
import { DatabaseService } from '../database/database.service';
import { Kysely, sql } from 'kysely';
import { Database } from '../database/database.types';
import { NewCampaign } from '@/schemas/campaign.schema';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../email/email.service';
import { NewEmail } from '@/schemas/email.schema';
import { generateUlid } from '@/utils/generators';
import { EmailTemplateService } from '../email-template/emailTemplate.service';
import { JwtService } from '@nestjs/jwt';
import { SendTestEmailDto } from './dto/testCampaign.dto';
import { UpdateCampaign } from '@/schemas/campaign.schema';

interface IBatchCampaign {
  id: string;
  name: string;
  subject: string;
  mail_from: string;
  html: string;
  contact_list_id: string;
  project_id: string;
}

@Injectable()
export class CampaignService implements OnModuleInit {
  private db: Kysely<Database>;
  private readonly logger = new Logger(CampaignService.name);
  private isProcessing = false;
  private batchSize = this.configService.get<number>('BATCH_SIZE') || 1;
  private maxConcurrentBatches =
    this.configService.get<number>('CONCURRENT_BATCHES') || 5;
  constructor(
    private databaseService: DatabaseService,
    private emailService: EmailService,
    private configService: ConfigService,
    private templateService: EmailTemplateService,
    private jwtService: JwtService,
  ) {}

  async onModuleInit() {
    this.db = this.databaseService.getDb();
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async processCampaigns() {
    if (this.isProcessing) {
      this.logger.debug('Already processing campaigns, skipping...');
      return;
    }

    try {
      this.isProcessing = true;
      await this.processScheduledCampaigns();
    } catch (error) {
      this.logger.error('Error processing campaigns', error.stack);
    } finally {
      this.isProcessing = false;
    }
  }

  async getAllCampaigns(project_id: string) {
    return await this.db
      .selectFrom('campaigns as c')
      .where('c.project_id', '=', project_id)
      .leftJoin('users as u', 'u.id', 'c.created_by')
      .leftJoin('contact_lists as cl', 'cl.id', 'c.contact_list_id')
      .leftJoin('email_templates as et', 'et.id', 'c.template_id')
      .select([
        'c.name',
        'c.id',
        'c.subject',
        'c.mail_from',
        'u.first_name',
        'u.last_name',
        'c.created_by',
        'et.name as template_name',
        'c.template_id',
        'c.contact_list_id',
        'cl.name as contact_list_name',
        'c.scheduled_at',
        'c.status',
      ])
      .execute();
  }

  async createCampaign(values: NewCampaign) {
    return await this.db
      .insertInto('campaigns')
      .values(values)
      .returningAll()
      .executeTakeFirst();
  }

  async getACampaign(id: string) {
    return await this.db
      .selectFrom('campaigns')
      .where('campaigns.id', '=', id)
      .leftJoin(
        'email_templates',
        'email_templates.id',
        'campaigns.template_id',
      )
      .leftJoin('contact_lists', 'contact_lists.id', 'contact_list_id')
      .leftJoin('users', 'users.id', 'campaigns.created_by')
      .select([
        'campaigns.id',
        'campaigns.name',
        'campaigns.subject',
        'campaigns.mail_from',
        'campaigns.status',
        'email_templates.name as template_name',
        'campaigns.template_id',
        'campaigns.created_by',
        'users.first_name',
        'users.last_name',
        'campaigns.send_later',
        'campaigns.scheduled_at',
        'campaigns.total_bounces',
        'campaigns.total_delivered',
        'campaigns.total_clicks',
        'campaigns.total_opens',
        'campaigns.created_at',
        'campaigns.updated_at',
        'contact_list_id',
        'contact_lists.name as contact_list_name',
      ])
      .executeTakeFirst();
  }
  async updateCampaign(values: UpdateCampaign, campaign_id: string) {
    await this.db
      .updateTable('campaigns')
      .where('campaigns.id', '=', campaign_id)
      .set({
        ...values,
        updated_at: sql`now()`,
      })
      .executeTakeFirst();

    return await this.getACampaign(campaign_id);
  }

  private async processScheduledCampaigns() {
    const campaigns = await this.db
      .selectFrom('campaigns')
      .leftJoin(
        'email_templates',
        'email_templates.id',
        'campaigns.template_id',
      )
      .select([
        'campaigns.name',
        'campaigns.id',
        'campaigns.contact_list_id',
        'campaigns.mail_from',
        'campaigns.subject',
        'email_templates.html',
        'campaigns.project_id',
      ])
      .where('campaigns.status', '=', 'scheduled')
      .where('campaigns.scheduled_at', '<=', new Date())
      .limit(5)
      .execute();

    await Promise.all(
      campaigns.map((campaign) => this.processCampaign(campaign)),
    );
  }

  private async processCampaign(campaign: IBatchCampaign) {
    this.logger.log(`Processing campaign ${campaign.name}`);

    await this.db
      .updateTable('campaigns')
      .set({ status: 'in_progress' })
      .where('id', '=', campaign.id)
      .execute();

    try {
      let processed = 0;
      let hasMore = true;
      let delivered = 0;

      while (hasMore) {
        const batch = await this.prepareBatch(
          campaign.contact_list_id,
          processed,
        );

        if (batch.length === 0) {
          hasMore = false;
          break;
        }

        const batchDeliveries = await this.processBatch(batch, campaign);
        processed += batch.length;
        delivered += batchDeliveries;
        this.logger.debug(
          `Processed ${processed} contacts for campaign ${campaign.id}`,
        );
      }

      await this.db
        .updateTable('campaigns')
        .set({
          status: 'completed',
          total_delivered: delivered,
        })
        .where('id', '=', campaign.id)
        .execute();
    } catch (error) {
      await this.db
        .updateTable('campaigns')
        .set({
          status: 'failed',
        })
        .where('id', '=', campaign.id)
        .execute();

      this.logger.error(`Campaign ${campaign.id} failed`, error.stack);
    }
  }

  private async prepareBatch(contact_list_id: string, processed: number) {
    const contacts = await this.db
      .selectFrom('contact_list_memberships as clm')
      .where('clm.contact_list_id', '=', contact_list_id)
      .innerJoin(
        'contacts',
        (join) =>
          join
            .onRef('contacts.id', '=', 'clm.contact_id')
            .on('contacts.is_valid_email', '=', true), // Ensures only valid emails
      )
      .select(['contact_id', 'contacts.email'])
      .offset(processed)
      .limit(this.batchSize)
      .execute();

    return contacts;
  }

  private processEmailTemplate(
    template: string,
    campaign_id: string,
    project_id: string,
  ) {
    const $ = cheerio.load(template);

    // Process all links in the template
    $('a').each((_, element) => {
      const link = $(element);
      const originalUrl = link.attr('href');

      if (originalUrl && !originalUrl.startsWith('mailto:')) {
        const trackingUrl = this.createClickTrackingUrl(
          campaign_id,
          project_id,
          originalUrl,
        );
        link.attr('href', trackingUrl);
      }
    });

    const trackingPixel = this.createViewTrackingPixel(campaign_id, project_id);
    $('body').append(trackingPixel);

    return $.html();
  }

  private createClickTrackingUrl(
    campaign_id: string,
    project_id: string,
    originalURL: string,
  ) {
    const token = this.jwtService.sign(
      {
        campaign_id: campaign_id,
        project_id,
        originalURL: originalURL,
      },
      {
        secret: this.configService.get('JWT_SECRET'),
      },
    );

    return `${this.configService.get('API_HOST')}/email/click?token=${token}`;
  }

  private createViewTrackingPixel(campaign_id: string, project_id: string) {
    const token = this.jwtService.sign(
      { campaign_id, project_id },
      {
        secret: this.configService.get('JWT_SECRET'),
      },
    );
    const apiHost = this.configService.get('API_HOST');

    const trackingURL = `${apiHost}/email/open?token=${token}`;

    return `<img src="${trackingURL}" alt="" width="1" height="1" style="visibility: hidden;" />`;
  }

  private async processBatch(
    batch: Array<{ contact_id: string; email: string }>,
    campaign: IBatchCampaign,
  ): Promise<number> {
    const processedTemplate = this.processEmailTemplate(
      campaign.html,
      campaign.id,
      campaign.project_id,
    );

    const results = await Promise.allSettled(
      batch.map((contact) =>
        this.sendEmailToCampaignContact(contact, campaign, processedTemplate),
      ),
    );

    let deliverdEmails = 0;
    const updatePromises = results.map((result, index) => {
      const contact = batch[index];
      if (result.status === 'fulfilled') {
        const transaction_id = result.value.response.slice(20, 56);
        deliverdEmails += 1;
        return this.createEmailRecord({
          id: generateUlid(),
          campaign_id: campaign.id,
          email: contact.email,
          status: 'sent',
          transaction_id,
        });
      } else {
        return this.createEmailRecord({
          id: generateUlid(),
          campaign_id: campaign.id,
          email: contact.email,
          status: 'failed',
        });
      }
    });

    await Promise.all(updatePromises);
    return deliverdEmails;
  }

  private async sendEmailToCampaignContact(
    contact: { contact_id: string; email: string },
    campaign: IBatchCampaign,
    processedTemplate: string,
  ) {
    const unsubscribe_url = this.getUnsbuscribeUrl(
      contact.email,
      campaign.id,
      contact.contact_id,
    );

    return this.emailService.sendEmail(
      contact.email,
      campaign.subject,
      '',
      processedTemplate,
      campaign.mail_from,
      unsubscribe_url,
      campaign.project_id,
    );
  }

  private getUnsbuscribeUrl(
    email: string,
    campaign_id: string,
    contact_list_id: string,
  ) {
    const verificationToken = this.jwtService.sign(
      {
        email,
        campaign_id,
        contact_list_id,
      },
      {
        secret: this.configService.get('JWT_SECRET'),
      },
    );

    const api_url = this.configService.get('API_HOST');

    return `${api_url}/email/unsubscribe?token=${verificationToken}`;
  }

  async sendTestCampaignEmail(body: SendTestEmailDto) {
    const { mail_from, subject, template_id, emails } = body;

    const template = await this.templateService.getATemplateById(template_id);

    if (!template) throw new NotFoundException();
    const emailsPromise = [];

    emails.forEach((email) => {
      const info = this.emailService.sendEmail(
        email,
        subject,
        '',
        template.html,
        mail_from,
      );
      emailsPromise.push(info);
    });

    const sentEmails = await Promise.allSettled(emailsPromise);
    return sentEmails;
  }

  async getCampaignAnalytics(campaign_id: string) {
    const views = await this.db
      .selectFrom('email_views')
      .where('campaign_id', '=', campaign_id)
      .select([
        sql`EXTRACT(DOW FROM opened_at)`.as('day_of_week'),
        sql`COUNT(*)`.as('view_count'),
      ])
      .groupBy('day_of_week')
      .orderBy('day_of_week')
      .execute();
    const clicks = await this.db
      .selectFrom('email_clicks')
      .where('campaign_id', '=', campaign_id)
      .select([
        sql`EXTRACT(DOW FROM clicked_at)`.as('day_of_week'),
        sql`COUNT(*)`.as('view_count'),
      ])
      .groupBy('day_of_week')
      .orderBy('day_of_week')
      .execute();

    const dayNames = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];

    const campaignData = dayNames.map((day) => ({
      day,
      views: 0,
      clicks: 0,
    }));

    views.forEach((view) => {
      const dayIndex = Number(view.day_of_week); // Convert day_of_week to number
      campaignData[dayIndex].views = Number(view.view_count); // Set the view count
    });

    clicks.forEach((click) => {
      const dayIndex = Number(click.day_of_week); // Convert day_of_week to number
      campaignData[dayIndex].clicks = Number(click.view_count); // Set the click count
    });

    return campaignData;
  }

  private async createEmailRecord(emailRecord: NewEmail) {
    await this.db.insertInto('emails').values(emailRecord).execute();
  }

  async deleteCampaigns() {
    const deletedCampaigns = await this.db
      .deleteFrom('campaigns')
      .returningAll()
      .execute();
    return deletedCampaigns;
  }
}
