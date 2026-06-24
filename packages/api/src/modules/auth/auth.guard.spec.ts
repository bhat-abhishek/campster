import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { AuthGuard } from './auth.guard';
import {
  Mocked,
  createConfigServiceMock,
  createJwtServiceMock,
} from './testing/auth.mocks';

/** Builds a minimal ExecutionContext exposing a request with the given cookies. */
const buildContext = (
  cookies: Record<string, string>,
): { ctx: ExecutionContext; request: any } => {
  const request: any = { cookies };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { ctx, request };
};

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let jwt: Mocked<JwtService>;
  let config: Mocked<ConfigService>;

  beforeEach(() => {
    jwt = createJwtServiceMock();
    config = createConfigServiceMock({ JWT_SECRET: 'test-secret' });
    guard = new AuthGuard(
      jwt as unknown as JwtService,
      config as unknown as ConfigService,
    );
  });

  it('throws Unauthorized when no token cookie is present', async () => {
    const { ctx } = buildContext({});

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('throws Unauthorized when the token fails verification', async () => {
    const { ctx } = buildContext({ token: 'bad-token' });
    jwt.verifyAsync.mockRejectedValue(new Error('invalid signature'));

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('attaches the decoded payload to the request and allows access', async () => {
    const { ctx, request } = buildContext({ token: 'good-token' });
    const payload = { id: 'user_123', email: 'jane@example.com' };
    jwt.verifyAsync.mockResolvedValue(payload);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);

    expect(jwt.verifyAsync).toHaveBeenCalledWith('good-token', {
      secret: 'test-secret',
    });
    expect(request.user).toEqual(payload);
  });
});
