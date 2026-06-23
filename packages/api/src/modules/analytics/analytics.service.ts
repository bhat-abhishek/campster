import { Injectable, OnModuleInit } from '@nestjs/common';
import { Kysely, sql } from 'kysely';

import { Database } from '../database/database.types';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AnalyticsService implements OnModuleInit {
  private db: Kysely<Database>;

  constructor(private readonly databaseService: DatabaseService) {}

  onModuleInit() {
    this.db = this.databaseService.getDb();
  }

  async getDashBoardCounts() {
    const result = await this.db
      .selectFrom('campaigns')
      .select(({ fn }) => [
        fn.count('id').as('total_campaigns'),
        fn.sum('total_delivered').as('totalDelivered'), // Sum of total delivered emails
        fn.sum('total_bounces').as('totalBounces'), // Sum of total bounces
        fn.sum('total_opens').as('totalOpens'), // Sum of total email opens
        fn.sum('total_clicks').as('totalClicks'), // Sum of total clicks
      ])
      .execute();
    return result;
  }

  async getEventsGraph() {
    const views = await this.db
      .selectFrom('email_views')
      .where((_eb) => sql`opened_at >= NOW() - INTERVAL '30 days'`)
      .select([
        sql`DATE(opened_at)`.as('day'), // Extract the date (day)
        sql`COUNT(*)`.as('view_count'), // Count the number of views
      ])
      .groupBy('day')
      .orderBy('day', 'desc')
      .execute();

    const clicks = await this.db
      .selectFrom('email_clicks')
      .where(() => sql`clicked_at >= NOW() - INTERVAL '30 days'`)
      .select([
        sql`DATE(clicked_at)`.as('day'),
        sql`COUNT(*)`.as('click_count'),
      ])
      .groupBy('day') // Group by date
      .orderBy('day', 'desc') // Optionally order by date
      .execute();

    // Get the last 30 days
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - 30 + i);
      return date.toISOString().split('T')[0]; // Get the date in 'YYYY-MM-DD' format
    });

    // Initialize campaignData with the last 30 days
    const campaignData = last30Days.map((day) => ({
      day,
      views: 0,
      clicks: 0,
    }));

    const formatDate = (date: Date) => date.toISOString().split('T')[0];

    // Map views to the respective day
    views.forEach((view) => {
      const formattedDay = formatDate(new Date(view.day as string)); // Convert view.day to 'YYYY-MM-DD'
      const dayIndex = campaignData.findIndex(
        (data) => data.day === formattedDay,
      );
      if (dayIndex !== -1) {
        campaignData[dayIndex].views = Number(view.view_count); // Set the view count
      }
    });

    // Map clicks to the respective day in campaignData
    clicks.forEach((click) => {
      const formattedDay = formatDate(new Date(click.day as string)); // Convert click.day to 'YYYY-MM-DD'
      const dayIndex = campaignData.findIndex(
        (data) => data.day === formattedDay,
      );
      if (dayIndex !== -1) {
        campaignData[dayIndex].clicks = Number(click.click_count); // Set the click count
      }
    });

    return campaignData;
  }
}
