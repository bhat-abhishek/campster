import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CampaignService } from './campaign.service';
import { CreateCampaignDto } from './dto/newCampaign.dto';
import { Request } from 'express';
import { generateUlid } from '@/utils/generators';
import { AuthGuard } from '../auth/auth.guard';
import { queryDto } from '@/utils/queryDto';
import { EmailService } from '../email/email.service';
import { SendTestEmailDto } from './dto/testCampaign.dto';
import { UpdateCampaignDto } from './dto/updateCampaign.dto';

@Controller('campaign')
@UseGuards(AuthGuard)
export class CampaignController {
  constructor(
    private campaignService: CampaignService,
    private emailService: EmailService,
  ) {}

  @Get()
  async getAllCampaign(@Query() query: queryDto) {
    const { project_id } = query;
    return await this.campaignService.getAllCampaigns(project_id);
  }

  @Get(':id')
  async getACampaign(@Param('id') id: string) {
    return await this.campaignService.getACampaign(id);
  }

  @Get('/analytics/:id')
  async getCampaignAnalytics(@Param('id') id: string) {
    return await this.campaignService.getCampaignAnalytics(id);
  }

  @Post()
  async createCampaign(@Body() body: CreateCampaignDto, @Req() req: Request) {
    return await this.campaignService.createCampaign({
      id: generateUlid(),
      ...body,
      created_by: req.user.id,
      scheduled_at: new Date(),
    });
  }

  @Put()
  async updateCampaign(@Body() body: UpdateCampaignDto) {
    const {
      campaign_id,
      project_id,
      mail_from,
      subject,
      scheduled_at,
      send_later,
      template_id,
      contact_list_id,
      name,
      status,
    } = body;
    return await this.campaignService.updateCampaign(
      {
        project_id,
        mail_from,
        subject,
        scheduled_at,
        send_later,
        name,
        template_id,
        contact_list_id,
        status,
      },
      campaign_id,
    );
  }

  @Post('test')
  async sendTestCampaignEmail(@Body() body: SendTestEmailDto) {
    return await this.campaignService.sendTestCampaignEmail(body);
  }
}
