/**
 * Shared test doubles for the auth module unit tests.
 *
 * Every collaborator of the auth module (UserService, ProjectService, …) is
 * replaced with a fully jest-mocked object so the suites stay fast, hermetic,
 * and free of a real database / JWT secret. Factories return a fresh set of
 * mocks per test to avoid state bleeding between cases.
 */
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../../user/user.service';
import { ProjectService } from '../../project/project.service';
import { ProjectAccessService } from '../../project-access/projectAccess.service';
import { EmailService } from '../../email/email.service';

export type Mocked<T> = { [K in keyof T]: jest.Mock };

export const createUserServiceMock = (): Mocked<UserService> =>
  ({
    findByEmail: jest.fn(),
    createUser: jest.fn(),
    updateRefreshToken: jest.fn(),
    findByIdAndJoinRole: jest.fn(),
    deleteRefreshToken: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  }) as unknown as Mocked<UserService>;

export const createProjectServiceMock = (): Mocked<ProjectService> =>
  ({
    getProjectById: jest.fn(),
  }) as unknown as Mocked<ProjectService>;

export const createProjectAccessServiceMock =
  (): Mocked<ProjectAccessService> =>
    ({
      createProjectAccess: jest.fn(),
      getDefaultProjectAcccess: jest.fn(),
    }) as unknown as Mocked<ProjectAccessService>;

export const createEmailServiceMock = (): Mocked<EmailService> =>
  ({
    sendEmail: jest.fn(),
  }) as unknown as Mocked<EmailService>;

export const createJwtServiceMock = (): Mocked<JwtService> =>
  ({
    verify: jest.fn(),
    verifyAsync: jest.fn(),
    sign: jest.fn(),
    signAsync: jest.fn(),
    decode: jest.fn(),
  }) as unknown as Mocked<JwtService>;

/**
 * ConfigService stub backed by a plain map. Defaults to a deterministic test
 * secret so JWT-related branches behave predictably.
 */
export const createConfigServiceMock = (
  values: Record<string, unknown> = { JWT_SECRET: 'test-secret' },
): Mocked<ConfigService> =>
  ({
    get: jest.fn((key: string) => values[key]),
  }) as unknown as Mocked<ConfigService>;

/** A representative user row as returned by the data layer. */
export const buildUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'user_123',
  email: 'jane@example.com',
  password: 'hashed-password',
  first_name: 'Jane',
  last_name: 'Doe',
  role_id: 4,
  refresh_token: 'existing-refresh-token',
  ...overrides,
});
