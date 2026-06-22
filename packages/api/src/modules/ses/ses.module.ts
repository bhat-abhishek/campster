import { Module } from '@nestjs/common';
import { SesService } from './ses.service';
import { SesController } from './ses.controller';
import { DatabaseModule } from '../database/database.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [DatabaseModule, ConfigModule],
  controllers: [SesController],
  providers: [SesService],
  exports: [SesService],
})
export class SesModule {}
