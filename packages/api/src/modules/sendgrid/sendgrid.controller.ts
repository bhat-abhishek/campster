import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SendgridService } from './sendgrid.service';
import { AuthGuard } from '../auth/auth.guard';
import { CreateSendgridConfigDto } from './dto/sendgrid-config.dto';

@Controller('sendgrid')
@UseGuards(AuthGuard)
export class SendgridController {
  constructor(private readonly sendgridService: SendgridService) {}

  @Post('config')
  async upsertConfig(@Body() body: CreateSendgridConfigDto) {
    return this.sendgridService.createOrUpdateConfig(body);
  }

  @Get('config/:project_id')
  async getConfig(@Param('project_id') project_id: string) {
    return this.sendgridService.getConfigByProject(project_id);
  }

  @Delete('config/:project_id')
  async deleteConfig(@Param('project_id') project_id: string) {
    return this.sendgridService.deleteConfig(project_id);
  }
}
