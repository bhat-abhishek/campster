import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  Body,
  HttpStatus,
  UseGuards,
  Put,
  UnauthorizedException,
} from '@nestjs/common';

import { Request, Response } from 'express';
import { AuthServices } from './auth.service';
import { Kysely } from 'kysely';
import { Database } from '../database/database.types';
import { LoginDto } from './dto/login.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from './auth.guard';
import { ProjectService } from '../project/project.service';
import { ProjectAccessService } from '../project-access/projectAccess.service';
import { JwtService } from '@nestjs/jwt';

@Controller('auth')
export class AuthController {
  private db: Kysely<Database>;

  constructor(
    private readonly authService: AuthServices,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly projectService: ProjectService,
    private readonly projectAccessService: ProjectAccessService,
  ) {}

  @Post('sign-up')
  async signup(@Body() body: CreateUserDto) {
    return await this.authService.signUp(body);
  }

  @Post('sign-in')
  async signin(@Body() loginDto: LoginDto, @Res() res: Response) {
    const { user, accessToken } = await this.authService.signIn(loginDto);

    res.cookie('token', accessToken, {
      httpOnly: true,
      secure: this.configService.get('NODE_ENV') === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 30 * 1000,
    });

    return res.json({ message: 'LogIn successfull', user });
  }

  @Get('check')
  @UseGuards(AuthGuard)
  async checkLogin(@Req() req: Request) {
    return await this.authService.checkLogin(req.user.id);
  }

  @Get('refresh-token')
  async refreshAccessToken(@Req() req: Request, @Res() res: Response) {
    const { token } = req.cookies;
    if (!token) throw new UnauthorizedException();

    let payload;
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        payload = await this.jwtService.decode(token);
      } else {
        throw new UnauthorizedException(error);
      }
    }

    const { id } = payload;

    const accessToken = await this.authService.refreshAccessToken(id);

    res.cookie('token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({ message: 'Access token refreshed successfully', success: true });
  }

  @Post('sign-out')
  @UseGuards(AuthGuard)
  async signout(@Req() req: Request, @Res() res: Response) {
    await this.authService.signOut(req.user.id);

    res.clearCookie('token');

    return res
      .status(HttpStatus.OK)
      .send({ message: 'Logged out successfully' });
  }

  @Post('forgot-password')
  async forgotPassword(@Body() body: { email: string }) {
    return await this.authService.forgotPassword(body);
  }

  @Put('reset-password')
  async resetPassword(@Body() body: any) {
    return await this.authService.resetPassword(body);
  }
}
