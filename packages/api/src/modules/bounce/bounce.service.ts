import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Kysely, sql } from 'kysely';
import { Database } from '../database/database.types';

@Injectable()
export class BounceService implements OnModuleInit {
  private db: Kysely<Database>;
  constructor(private databaseService: DatabaseService) {}
  private logger = new Logger(BounceService.name);
  onModuleInit() {
    this.db = this.databaseService.getDb();
  }

  async apiKeyCheck() {
    return 'API Key Check';
  }

  async handleBounce(body: any) {
    const { transaction_id } = body;
    console.log('transaction id', transaction_id.slice(0, -4));

    const mail = await this.db
      .updateTable('emails')
      .where('transaction_id', '=', transaction_id.slice(0, -4))
      .set({
        status: 'bounced',
      })
      .returningAll()
      .executeTakeFirst();

    await this.db
      .updateTable('contacts')
      .where('email', '=', mail.email)
      .set({
        is_valid_email: false,
      })
      .executeTakeFirst();

    this.increaseBounceCount(mail.campaign_id);
    return;
  }

  async increaseBounceCount(_campaign_id: string) {
    try {
      await this.db
        .updateTable('campaigns')
        .set({
          total_bounces: sql`total_bounces + 1`,
        })
        .executeTakeFirst();
    } catch (error) {
      this.logger.error(error);
    }
  }
}
