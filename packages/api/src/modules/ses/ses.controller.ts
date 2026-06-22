import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SesService } from './ses.service';
import { AuthGuard } from '../auth/auth.guard';
import { CreateSesConfigDto } from './dto/ses-config.dto';

@Controller('ses')
@UseGuards(AuthGuard)
export class SesController {
  constructor(private readonly sesService: SesService) {}

  @Post('config')
  async upsertConfig(@Body() body: CreateSesConfigDto) {
    return this.sesService.createOrUpdateConfig(body);
  }

  @Get('config/:project_id')
  async getConfig(@Param('project_id') project_id: string) {
    return this.sesService.getConfigByProject(project_id);
  }

  @Delete('config/:project_id')
  async deleteConfig(@Param('project_id') project_id: string) {
    return this.sesService.deleteConfig(project_id);
  }
}
