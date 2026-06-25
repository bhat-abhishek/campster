import { Test, TestingModule } from '@nestjs/testing';
import { CampaignController } from './campaign.controller';
import { CampaignService } from './campaign.service';
import { EmailService } from '../email/email.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

jest.mock('@/utils/generators', () => ({
  generateUlid: jest.fn().mockReturnValue('test-ulid-01234567890'),
}));

type Mocked<T> = { [K in keyof T]: jest.Mock };

const createCampaignServiceMock = (): Mocked<CampaignService> =>
  ({
    getAllCampaigns: jest.fn(),
    getACampaign: jest.fn(),
    getCampaignAnalytics: jest.fn(),
    createCampaign: jest.fn(),
    updateCampaign: jest.fn(),
    sendTestCampaignEmail: jest.fn(),
  }) as unknown as Mocked<CampaignService>;

const createEmailServiceMock = (): Mocked<EmailService> =>
  ({
    sendEmail: jest.fn(),
  }) as unknown as Mocked<EmailService>;

const createJwtServiceMock = (): Mocked<JwtService> =>
  ({
    verify: jest.fn(),
    verifyAsync: jest.fn(),
    sign: jest.fn(),
    signAsync: jest.fn(),
    decode: jest.fn(),
  }) as unknown as Mocked<JwtService>;

const createConfigServiceMock = (
  values: Record<string, unknown> = { JWT_SECRET: 'test-secret' },
): Mocked<ConfigService> =>
  ({
    get: jest.fn((key: string) => values[key]),
  }) as unknown as Mocked<ConfigService>;

const buildCampaign = (overrides: Record<string, unknown> = {}) => ({
  id: 'test-ulid-01234567890',
  name: 'Summer Sale',
  subject: 'Check out our deals',
  mail_from: 'hello@example.com',
  project_id: 'proj_abc123456789',
  template_id: 'tmpl_xyz1234567',
  contact_list_id: 'list_xyz1234567',
  status: 'draft',
  scheduled_at: new Date(),
  created_by: 'user_123',
  ...overrides,
});

describe('CampaignController', () => {
  let controller: CampaignController;
  let campaigns: Mocked<CampaignService>;

  beforeEach(async () => {
    campaigns = createCampaignServiceMock();

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [CampaignController],
      providers: [
        { provide: CampaignService, useValue: campaigns },
        { provide: EmailService, useValue: createEmailServiceMock() },
        { provide: JwtService, useValue: createJwtServiceMock() },
        { provide: ConfigService, useValue: createConfigServiceMock() },
      ],
    }).compile();

    controller = moduleRef.get(CampaignController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getAllCampaign', () => {
    it('delegates to CampaignService.getAllCampaigns with the project_id from the query', async () => {
      const list = [buildCampaign()];
      campaigns.getAllCampaigns.mockResolvedValue(list);

      await expect(
        controller.getAllCampaign({ project_id: 'proj_abc123456789' } as any),
      ).resolves.toBe(list);

      expect(campaigns.getAllCampaigns).toHaveBeenCalledWith('proj_abc123456789');
    });
  });

  describe('getACampaign', () => {
    it('delegates to CampaignService.getACampaign with the id param', async () => {
      const campaign = buildCampaign();
      campaigns.getACampaign.mockResolvedValue(campaign);

      await expect(
        controller.getACampaign('test-ulid-01234567890'),
      ).resolves.toBe(campaign);

      expect(campaigns.getACampaign).toHaveBeenCalledWith('test-ulid-01234567890');
    });
  });

  describe('getCampaignAnalytics', () => {
    it('delegates to CampaignService.getCampaignAnalytics with the id param', async () => {
      const analytics = { total_opens: 10, total_clicks: 5, total_bounces: 1 };
      campaigns.getCampaignAnalytics.mockResolvedValue(analytics);

      await expect(
        controller.getCampaignAnalytics('test-ulid-01234567890'),
      ).resolves.toBe(analytics);

      expect(campaigns.getCampaignAnalytics).toHaveBeenCalledWith(
        'test-ulid-01234567890',
      );
    });
  });

  describe('createCampaign', () => {
    it('generates a ulid, attaches the authenticated user id, and creates the campaign', async () => {
      const body: any = {
        name: 'Summer Sale',
        subject: 'Check out our deals',
        mail_from: 'hello@example.com',
        template_id: 'tmpl_xyz1234567',
        contact_list_id: 'list_xyz1234567',
        project_id: 'proj_abc123456789',
        send_later: false,
      };
      const req: any = { user: { id: 'user_123' } };
      const created = buildCampaign();
      campaigns.createCampaign.mockResolvedValue(created);

      await expect(controller.createCampaign(body, req)).resolves.toBe(created);

      expect(campaigns.createCampaign).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-ulid-01234567890',
          name: 'Summer Sale',
          created_by: 'user_123',
        }),
      );
    });
  });

  describe('updateCampaign', () => {
    it('forwards campaign fields and campaign_id separately to the service', async () => {
      const body: any = {
        campaign_id: 'camp_abc',
        project_id: 'proj_abc123456789',
        mail_from: 'hello@example.com',
        subject: 'Updated deals',
        name: 'Updated Sale',
        template_id: 'tmpl_xyz1234567',
        contact_list_id: 'list_xyz1234567',
        status: 'scheduled',
        scheduled_at: new Date(),
        send_later: false,
      };
      const updated = buildCampaign({ id: 'camp_abc', name: 'Updated Sale' });
      campaigns.updateCampaign.mockResolvedValue(updated);

      await expect(controller.updateCampaign(body)).resolves.toBe(updated);

      expect(campaigns.updateCampaign).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Updated Sale',
          project_id: 'proj_abc123456789',
        }),
        'camp_abc',
      );
    });
  });

  describe('sendTestCampaignEmail', () => {
    it('delegates to CampaignService.sendTestCampaignEmail', async () => {
      const body: any = {
        mail_from: 'hello@example.com',
        subject: 'Test subject',
        template_id: 'tmpl_xyz1234567',
        emails: ['tester@example.com'],
      };
      const result = [{ status: 'fulfilled', value: {} }];
      campaigns.sendTestCampaignEmail.mockResolvedValue(result);

      await expect(controller.sendTestCampaignEmail(body)).resolves.toBe(result);
      expect(campaigns.sendTestCampaignEmail).toHaveBeenCalledWith(body);
    });
  });
});
