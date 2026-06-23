import { Test, TestingModule } from '@nestjs/testing';
import {
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import Handlebars from 'handlebars';
import { promises as fs } from 'fs';

import { AuthServices } from './auth.service';
import { UserService } from '../user/user.service';
import { ProjectService } from '../project/project.service';
import { ProjectAccessService } from '../project-access/projectAccess.service';
import { EmailService } from '../email/email.service';
import {
  Mocked,
  buildUser,
  createConfigServiceMock,
  createEmailServiceMock,
  createJwtServiceMock,
  createProjectAccessServiceMock,
  createProjectServiceMock,
  createUserServiceMock,
} from './testing/auth.mocks';

// Provide an explicit factory so jest never loads bcrypt's native binding
// (auto-mocking would require the real module, which fails without the build).
jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  genSalt: jest.fn(),
  compare: jest.fn(),
}));
jest.mock('handlebars');
jest.mock('fs', () => ({
  promises: { readFile: jest.fn() },
}));

const bcryptMock = bcrypt as jest.Mocked<typeof bcrypt>;
const handlebarsMock = Handlebars as jest.Mocked<typeof Handlebars>;
const readFileMock = fs.readFile as jest.Mock;

describe('AuthServices', () => {
  let service: AuthServices;
  let users: Mocked<UserService>;
  let projects: Mocked<ProjectService>;
  let projectAccess: Mocked<ProjectAccessService>;
  let email: Mocked<EmailService>;
  let jwt: Mocked<JwtService>;

  beforeEach(async () => {
    users = createUserServiceMock();
    projects = createProjectServiceMock();
    projectAccess = createProjectAccessServiceMock();
    email = createEmailServiceMock();
    jwt = createJwtServiceMock();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AuthServices,
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: createConfigServiceMock() },
        { provide: UserService, useValue: users },
        { provide: ProjectService, useValue: projects },
        { provide: ProjectAccessService, useValue: projectAccess },
        { provide: EmailService, useValue: email },
      ],
    }).compile();

    service = moduleRef.get(AuthServices);

    // Sensible default bcrypt behaviour; individual tests override as needed.
    (bcryptMock.genSalt as jest.Mock).mockResolvedValue('salt');
    (bcryptMock.hash as jest.Mock).mockResolvedValue('hashed-password');
    (bcryptMock.compare as jest.Mock).mockResolvedValue(true);
  });

  afterEach(() => jest.clearAllMocks());

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  describe('signUp', () => {
    const signUpBody = {
      email: 'jane@example.com',
      password: 'supersecret',
      first_name: 'Jane',
      last_name: 'Doe',
      token: 'invite-token',
    };

    it('rejects when the invite token email does not match the body email', async () => {
      jwt.verify.mockReturnValue({ email: 'someone-else@example.com' });

      await expect(service.signUp(signUpBody)).rejects.toMatchObject({
        message: 'Invalid email',
        status: HttpStatus.BAD_REQUEST,
      });
      expect(users.createUser).not.toHaveBeenCalled();
    });

    it('rejects with CONFLICT when an account already exists', async () => {
      jwt.verify.mockReturnValue({ email: signUpBody.email, project_id: 'p1' });
      users.findByEmail.mockResolvedValue(buildUser());

      await expect(service.signUp(signUpBody)).rejects.toMatchObject({
        message: 'Account already exist with this email',
        status: HttpStatus.CONFLICT,
      });
    });

    it('rejects with NOT_FOUND when the project is missing', async () => {
      jwt.verify.mockReturnValue({ email: signUpBody.email, project_id: 'p1' });
      users.findByEmail.mockResolvedValue(undefined);
      projects.getProjectById.mockResolvedValue(undefined);

      await expect(service.signUp(signUpBody)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });

    it('rejects with NOT_FOUND when the project is not active', async () => {
      jwt.verify.mockReturnValue({ email: signUpBody.email, project_id: 'p1' });
      users.findByEmail.mockResolvedValue(undefined);
      projects.getProjectById.mockResolvedValue({
        id: 'p1',
        status: 'inactive',
      });

      await expect(service.signUp(signUpBody)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });

    it('hashes the password, creates the user and grants project access', async () => {
      const created = buildUser({ id: 'new_user' });
      jwt.verify.mockReturnValue({
        email: signUpBody.email,
        project_id: 'p1',
        role_id: '2',
      });
      users.findByEmail.mockResolvedValue(undefined);
      projects.getProjectById.mockResolvedValue({ id: 'p1', status: 'active' });
      users.createUser.mockResolvedValue(created);
      projectAccess.createProjectAccess.mockResolvedValue(undefined);

      const result = await service.signUp(signUpBody);

      expect(bcryptMock.hash).toHaveBeenCalledWith(signUpBody.password, 'salt');
      expect(users.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: signUpBody.email,
          password: 'hashed-password',
          first_name: 'Jane',
          last_name: 'Doe',
          role_id: 4,
        }),
      );
      expect(projectAccess.createProjectAccess).toHaveBeenCalledWith({
        project_id: 'p1',
        role_id: 2, // parsed from the token's string role_id
        user_id: 'new_user',
      });
      expect(result).toBe(created);
    });
  });

  describe('signIn', () => {
    const loginBody = { email: 'jane@example.com', password: 'supersecret' };

    it('rejects with UNAUTHORIZED when the user does not exist', async () => {
      users.findByEmail.mockResolvedValue(undefined);

      await expect(service.signIn(loginBody)).rejects.toMatchObject({
        message: 'Invalid email or password',
        status: HttpStatus.UNAUTHORIZED,
      });
    });

    it('rejects when the password does not match', async () => {
      users.findByEmail.mockResolvedValue(buildUser());
      (bcryptMock.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.signIn(loginBody)).rejects.toBeInstanceOf(
        HttpException,
      );
      expect(users.updateRefreshToken).not.toHaveBeenCalled();
    });

    it('issues tokens and persists the refresh token on success', async () => {
      const user = buildUser();
      users.findByEmail.mockResolvedValue(user);
      jwt.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      const result = await service.signIn(loginBody);

      expect(bcryptMock.compare).toHaveBeenCalledWith(
        loginBody.password,
        user.password,
      );
      expect(users.updateRefreshToken).toHaveBeenCalledWith(
        user.id,
        'refresh-token',
      );
      expect(result).toEqual({ user, accessToken: 'access-token' });
    });
  });

  describe('checkLogin', () => {
    it('returns the user joined with their default project', async () => {
      const user = buildUser();
      const defaultProject = { project_id: 'p1', is_default: true };
      users.findByIdAndJoinRole.mockResolvedValue(user);
      projectAccess.getDefaultProjectAcccess.mockResolvedValue(defaultProject);

      const result = await service.checkLogin(user.id);

      expect(users.findByIdAndJoinRole).toHaveBeenCalledWith(user.id);
      expect(projectAccess.getDefaultProjectAcccess).toHaveBeenCalledWith(
        user.id,
      );
      expect(result).toEqual({ user, defaultProject });
    });
  });

  describe('signOut', () => {
    it('deletes the stored refresh token', async () => {
      users.deleteRefreshToken.mockResolvedValue({ id: 'user_123' });

      const result = await service.signOut('user_123');

      expect(users.deleteRefreshToken).toHaveBeenCalledWith('user_123');
      expect(result).toEqual({ id: 'user_123' });
    });
  });

  describe('refreshAccessToken', () => {
    it('mints a fresh access token when a refresh token is present', async () => {
      users.findById.mockResolvedValue(buildUser({ refresh_token: 'rt' }));
      jwt.signAsync.mockResolvedValue('new-access-token');

      const result = await service.refreshAccessToken('user_123');

      expect(result).toBe('new-access-token');
    });

    it('throws Unauthorized when no refresh token is stored', async () => {
      users.findById.mockResolvedValue(buildUser({ refresh_token: null }));

      await expect(
        service.refreshAccessToken('user_123'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('forgotPassword', () => {
    it('emails a reset link to a known user', async () => {
      const user = buildUser();
      users.findByEmail.mockResolvedValue(user);
      projectAccess.getDefaultProjectAcccess.mockResolvedValue({
        default_mail_from: 'noreply@example.com',
      });
      jwt.sign.mockReturnValue('reset-token');
      readFileMock.mockResolvedValue('<html>{{name}} {{reset_link}}</html>');
      const compiled = jest.fn().mockReturnValue('<html>rendered</html>');
      (handlebarsMock.compile as jest.Mock).mockReturnValue(compiled);

      await service.forgotPassword({ email: user.email });

      expect(jwt.sign).toHaveBeenCalledWith(
        { email: user.email, id: user.id },
        { expiresIn: '1h' },
      );
      expect(compiled).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Jane Doe' }),
      );
      expect(email.sendEmail).toHaveBeenCalledWith(
        user.email,
        'Reset Your Password',
        '',
        '<html>rendered</html>',
        'noreply@example.com',
      );
    });
  });

  describe('resetPassword', () => {
    const baseBody = {
      token: 'reset-token',
      password: 'newpass123',
      confirm_password: 'newpass123',
      email: 'jane@example.com',
    };

    it('rejects when password and confirm_password differ', async () => {
      await expect(
        service.resetPassword({ ...baseBody, confirm_password: 'mismatch' }),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      expect(jwt.verify).not.toHaveBeenCalled();
    });

    it('rejects when the token email does not match the supplied email', async () => {
      jwt.verify.mockReturnValue({
        email: 'other@example.com',
        id: 'user_123',
      });

      await expect(service.resetPassword(baseBody)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
      expect(users.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('hashes and persists the new password on success', async () => {
      jwt.verify.mockReturnValue({ email: baseBody.email, id: 'user_123' });
      users.findByIdAndUpdate.mockResolvedValue(buildUser());

      await service.resetPassword(baseBody);

      expect(bcryptMock.hash).toHaveBeenCalledWith(baseBody.password, 'salt');
      expect(users.findByIdAndUpdate).toHaveBeenCalledWith('user_123', {
        password: 'hashed-password',
      });
    });
  });
});
