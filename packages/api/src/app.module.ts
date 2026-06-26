import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './modules/database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { ConfigModule } from '@nestjs/config';

import configuration from './config/configuration';
import { ProjectModule } from './modules/project/project.module';
import { EmailModule } from './modules/email/email.module';
import { RoleModule } from './modules/role/role.module';
import { SeederModule } from './modules/seed/seed.module';
import { CommandRunnerModule } from 'nest-commander';
import { ProjectAccessModule } from './modules/project-access/projectAccess.module';
import { ContactListModule } from './modules/contact-list/contactList.module';
import { EmailTemplateModule } from './modules/email-template/emaliTemplate.module';
import { CampaignModule } from './modules/campaign/campaign.module';
import { ScheduleModule } from '@nestjs/schedule';
import { BounceModule } from './modules/bounce/bounce.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { TransactionalModule } from './modules/transactional/transactional.module';
import { SesModule } from './modules/ses/ses.module';
import { SendgridModule } from './modules/sendgrid/sendgrid.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    DatabaseModule,
    SeederModule,
    AuthModule,
    UserModule,
    ProjectModule,
    ProjectAccessModule,
    ContactListModule,
    CampaignModule,
    EmailModule,
    RoleModule,
    CommandRunnerModule,
    EmailTemplateModule,
    BounceModule,
    TransactionalModule,
    AnalyticsModule,
    SesModule,
    SendgridModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
