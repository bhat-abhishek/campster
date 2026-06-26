import { Module } from '@nestjs/common';
import { SendgridService } from './sendgrid.service';
import { SendgridController } from './sendgrid.controller';
import { DatabaseModule } from '../database/database.module';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [DatabaseModule, ConfigModule, JwtModule],
  controllers: [SendgridController],
  providers: [SendgridService],
  exports: [SendgridService],
})
export class SendgridModule {}
