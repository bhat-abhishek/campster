import { Test, TestingModule } from '@nestjs/testing';
import { ProjectController } from './project.controller';
import { ProjectService } from './project.service';
import { ProjectAccessService } from '../project-access/projectAccess.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

type Mocked<T> = { [K in keyof T]: jest.Mock };

const createProjectServiceMock = (): Mocked<ProjectService> =>
  ({
    getProjects: jest.fn(),
    createProject: jest.fn(),
    getProjectById: jest.fn(),
    inviteToProject: jest.fn(),
    updateProject: jest.fn(),
  }) as unknown as Mocked<ProjectService>;

const createProjectAccessServiceMock = (): Mocked<ProjectAccessService> =>
  ({
    getAllProjectAccess: jest.fn(),
    createProjectAccess: jest.fn(),
    getDefaultProjectAcccess: jest.fn(),
    getProjectAccess: jest.fn(),
  }) as unknown as Mocked<ProjectAccessService>;

const createJwtServiceMock = (): Mocked<JwtService> =>
  ({
    sign: jest.fn(),
    verify: jest.fn(),
    verifyAsync: jest.fn(),
    signAsync: jest.fn(),
    decode: jest.fn(),
  }) as unknown as Mocked<JwtService>;

const createConfigServiceMock = (
  values: Record<string, unknown> = { JWT_SECRET: 'test-secret' },
): Mocked<ConfigService> =>
  ({
    get: jest.fn((key: string) => values[key]),
  }) as unknown as Mocked<ConfigService>;

const buildProject = (overrides: Record<string, unknown> = {}) => ({
  id: 'proj_abc',
  name: 'Logwiz',
  description: 'A logging library',
  created_by: 'user_123',
  status: 'active',
  ...overrides,
});

describe('ProjectController', () => {
  let controller: ProjectController;
  let projects: Mocked<ProjectService>;
  let projectAccess: Mocked<ProjectAccessService>;

  beforeEach(async () => {
    projects = createProjectServiceMock();
    projectAccess = createProjectAccessServiceMock();

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ProjectController],
      providers: [
        { provide: ProjectService, useValue: projects },
        { provide: ProjectAccessService, useValue: projectAccess },
        { provide: JwtService, useValue: createJwtServiceMock() },
        { provide: ConfigService, useValue: createConfigServiceMock() },
      ],
    }).compile();

    controller = moduleRef.get(ProjectController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getProjects', () => {
    it('returns all projects belonging to the authenticated user', async () => {
      const list = [buildProject()];
      projects.getProjects.mockResolvedValue(list);
      const req: any = { user: { id: 'user_123' } };

      await expect(controller.getProjects(req)).resolves.toBe(list);
      expect(projects.getProjects).toHaveBeenCalledWith('user_123');
    });
  });

  describe('createAProject', () => {
    it('delegates to ProjectService.createProject with the body and authenticated user id', async () => {
      const body: any = { name: 'Logwiz', description: 'A logging library' };
      const req: any = { user: { id: 'user_123' } };
      const created = buildProject();
      projects.createProject.mockResolvedValue(created);

      await expect(controller.createAProject(body, req)).resolves.toBe(created);
      expect(projects.createProject).toHaveBeenCalledWith(body, 'user_123');
    });
  });

  describe('getAllProjectAccess', () => {
    it('delegates to ProjectAccessService.getAllProjectAccess with the project id', async () => {
      const access = [{ user_id: 'user_123', role_id: 1 }];
      projectAccess.getAllProjectAccess.mockResolvedValue(access);

      await expect(controller.getAllProjectAccess('proj_abc')).resolves.toBe(access);
      expect(projectAccess.getAllProjectAccess).toHaveBeenCalledWith('proj_abc');
    });
  });

  describe('getAProject', () => {
    it('returns the project found by id', async () => {
      const project = buildProject();
      projects.getProjectById.mockResolvedValue(project);

      await expect(controller.getAProject('proj_abc')).resolves.toBe(project);
      expect(projects.getProjectById).toHaveBeenCalledWith('proj_abc');
    });
  });

  describe('inviteUserThroughEmail', () => {
    it('delegates to ProjectService.inviteToProject with the full body', async () => {
      const body: any = {
        email: 'john@example.com',
        project_id: 'proj_abc',
        role_id: 3,
      };
      const result = { message: 'Invite sent' };
      projects.inviteToProject.mockResolvedValue(result);

      await expect(controller.inviteUserThroughEmail(body)).resolves.toBe(result);
      expect(projects.inviteToProject).toHaveBeenCalledWith(body);
    });
  });

  describe('updateAProject', () => {
    it('passes only the mutable fields to the service, keyed by project_id', async () => {
      const body: any = {
        project_id: 'proj_abc',
        name: 'Renamed Project',
        description: 'New description',
        default_mail_from: 'noreply@example.com',
      };
      const updated = buildProject({ name: 'Renamed Project' });
      projects.updateProject.mockResolvedValue(updated);

      await expect(controller.updateAProject(body)).resolves.toBe(updated);

      expect(projects.updateProject).toHaveBeenCalledWith('proj_abc', {
        name: 'Renamed Project',
        description: 'New description',
        default_mail_from: 'noreply@example.com',
      });
    });
  });
});
