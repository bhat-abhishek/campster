import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { AuthController } from './auth.controller';
import { AuthServices } from './auth.service';
import { ProjectService } from '../project/project.service';
import { ProjectAccessService } from '../project-access/projectAccess.service';
import {
  Mocked,
  buildUser,
  createConfigServiceMock,
  createJwtServiceMock,
  createProjectAccessServiceMock,
  createProjectServiceMock,
} from './testing/auth.mocks';

/** A chainable Express Response double that records cookie/json/clear calls. */
const buildResponse = (): jest.Mocked<Response> => {
  const res: any = {};
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res as jest.Mocked<Response>;
};

const createAuthServiceMock = (): Mocked<AuthServices> =>
  ({
    signUp: jest.fn(),
    signIn: jest.fn(),
    checkLogin: jest.fn(),
    signOut: jest.fn(),
    refreshAccessToken: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
  }) as unknown as Mocked<AuthServices>;

describe('AuthController', () => {
  let controller: AuthController;
  let authService: Mocked<AuthServices>;
  let jwt: Mocked<JwtService>;

  beforeEach(async () => {
    authService = createAuthServiceMock();
    jwt = createJwtServiceMock();

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthServices, useValue: authService },
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: createConfigServiceMock({ NODE_ENV: 'test' }),
        },
        { provide: ProjectService, useValue: createProjectServiceMock() },
        {
          provide: ProjectAccessService,
          useValue: createProjectAccessServiceMock(),
        },
      ],
    }).compile();

    controller = moduleRef.get(AuthController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('signup', () => {
    it('delegates to AuthServices.signUp', async () => {
      const body: any = { email: 'jane@example.com', token: 't' };
      const created = buildUser();
      authService.signUp.mockResolvedValue(created);

      await expect(controller.signup(body)).resolves.toBe(created);
      expect(authService.signUp).toHaveBeenCalledWith(body);
    });
  });

  describe('signin', () => {
    it('sets an httpOnly token cookie and returns the user', async () => {
      const user = buildUser();
      authService.signIn.mockResolvedValue({
        user,
        accessToken: 'access-token',
      });
      const res = buildResponse();

      await controller.signin(
        { email: user.email, password: 'pw' } as any,
        res,
      );

      expect(res.cookie).toHaveBeenCalledWith(
        'token',
        'access-token',
        expect.objectContaining({ httpOnly: true, sameSite: 'strict' }),
      );
      expect(res.json).toHaveBeenCalledWith({
        message: 'LogIn successfull',
        user,
      });
    });
  });

  describe('checkLogin', () => {
    it('delegates to AuthServices.checkLogin with the authenticated user id', async () => {
      const payload = { user: buildUser(), defaultProject: {} };
      authService.checkLogin.mockResolvedValue(payload);
      const req = { user: { id: 'user_123' } } as unknown as Request;

      await expect(controller.checkLogin(req)).resolves.toBe(payload);
      expect(authService.checkLogin).toHaveBeenCalledWith('user_123');
    });
  });

  describe('refreshAccessToken', () => {
    it('throws Unauthorized when the request has no token cookie', async () => {
      const req = { cookies: {} } as unknown as Request;
      const res = buildResponse();

      await expect(
        controller.refreshAccessToken(req, res),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('refreshes the cookie when the token verifies', async () => {
      const req = { cookies: { token: 'old-token' } } as unknown as Request;
      const res = buildResponse();
      jwt.verifyAsync.mockResolvedValue({ id: 'user_123' });
      authService.refreshAccessToken.mockResolvedValue('new-access-token');

      await controller.refreshAccessToken(req, res);

      expect(authService.refreshAccessToken).toHaveBeenCalledWith('user_123');
      expect(res.cookie).toHaveBeenCalledWith(
        'token',
        'new-access-token',
        expect.objectContaining({ httpOnly: true }),
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });

    it('falls back to decoding an expired token instead of rejecting', async () => {
      const req = { cookies: { token: 'expired-token' } } as unknown as Request;
      const res = buildResponse();
      const expired = Object.assign(new Error('expired'), {
        name: 'TokenExpiredError',
      });
      jwt.verifyAsync.mockRejectedValue(expired);
      jwt.decode.mockReturnValue({ id: 'user_123' });
      authService.refreshAccessToken.mockResolvedValue('new-access-token');

      await controller.refreshAccessToken(req, res);

      expect(jwt.decode).toHaveBeenCalledWith('expired-token');
      expect(authService.refreshAccessToken).toHaveBeenCalledWith('user_123');
    });

    it('rethrows Unauthorized for non-expiry verification errors', async () => {
      const req = { cookies: { token: 'bad-token' } } as unknown as Request;
      const res = buildResponse();
      jwt.verifyAsync.mockRejectedValue(new Error('invalid signature'));

      await expect(
        controller.refreshAccessToken(req, res),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('signout', () => {
    it('clears the token cookie and confirms logout', async () => {
      const req = { user: { id: 'user_123' } } as unknown as Request;
      const res = buildResponse();
      authService.signOut.mockResolvedValue(undefined);

      await controller.signout(req, res);

      expect(authService.signOut).toHaveBeenCalledWith('user_123');
      expect(res.clearCookie).toHaveBeenCalledWith('token');
      expect(res.send).toHaveBeenCalledWith({
        message: 'Logged out successfully',
      });
    });
  });

  describe('forgotPassword / resetPassword', () => {
    it('delegates forgotPassword to the service', async () => {
      await controller.forgotPassword({ email: 'jane@example.com' });
      expect(authService.forgotPassword).toHaveBeenCalledWith({
        email: 'jane@example.com',
      });
    });

    it('delegates resetPassword to the service', async () => {
      const body = {
        token: 't',
        password: 'p',
        confirm_password: 'p',
        email: 'e',
      };
      await controller.resetPassword(body);
      expect(authService.resetPassword).toHaveBeenCalledWith(body);
    });
  });
});
