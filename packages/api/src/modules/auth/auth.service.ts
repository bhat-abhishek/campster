import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { LoginDto } from './dto/login.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { Kysely } from 'kysely';
import { Database } from '../database/database.types';
import { UserService } from '../user/user.service';

import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ulid } from 'ulid';
import { ProjectAccessService } from '../project-access/projectAccess.service';
import { ProjectService } from '../project/project.service';
import { promises as fs } from 'fs';
import { EmailService } from '../email/email.service';
import Handlebars from 'handlebars';

@Injectable()
export class AuthServices {
  db: Kysely<Database>;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly userService: UserService,
    private readonly projectService: ProjectService,
    private readonly projectAccessService: ProjectAccessService,
    private readonly emailService: EmailService,
  ) {}

  signUp = async (body: CreateUserDto) => {
    const { email, password, first_name, last_name, token } = body;

    const verifiedToken = await this.jwtService.verify(token, {
      secret: this.configService.get<string>('JWT_SECRET'),
    });

    if (email != verifiedToken.email) {
      throw new HttpException('Invalid email', HttpStatus.BAD_REQUEST);
    }

    // check account already exists or not
    const userExists = await this.userService.findByEmail(email);

    if (userExists)
      throw new HttpException(
        'Account already exist with this email',
        HttpStatus.CONFLICT,
      );

    // check project and role are active
    const project = await this.projectService.getProjectById(
      verifiedToken.project_id,
    );

    if (!project || (project && project.status !== 'active')) {
      throw new HttpException('Not found', HttpStatus.NOT_FOUND);
    }

    const hashedPassword = await bcrypt.hash(
      password,
      await bcrypt.genSalt(10),
    );

    // create the user
    const user = await this.userService.createUser({
      email,
      password: hashedPassword,
      first_name,
      last_name,
      id: ulid(),
      role_id: 4,
    });

    // create project access;
    await this.projectAccessService.createProjectAccess({
      project_id: verifiedToken.project_id,
      role_id: parseInt(verifiedToken.role_id, 10),
      user_id: user.id,
    });

    return user;
  };

  signIn = async (body: LoginDto) => {
    // check wether the user exists or not
    const { email, password } = body;

    // if user exists thorw an exception
    const user = await this.userService.findByEmail(email);

    if (!user)
      throw new HttpException(
        'Invalid email or password',
        HttpStatus.UNAUTHORIZED,
      );

    // compare the password
    const correctPassword = await bcrypt.compare(password, user.password);

    if (!correctPassword)
      throw new HttpException('Invalid email or password', 400);

    // generate the refresh token and upate that in db
    const [accessToken, refreshToken] = await Promise.all([
      this.generateJwt({ email: email, id: user.id }),
      this.generateJwt({ id: user.id }),
    ]);

    // update the refresh token in the db
    await this.userService.updateRefreshToken(user.id, refreshToken);

    return { user, accessToken: accessToken };
  };

  checkLogin = async (id: string) => {
    const user = await this.userService.findByIdAndJoinRole(id);

    const defaultProject =
      await this.projectAccessService.getDefaultProjectAcccess(user.id);
    return { user, defaultProject };
  };

  signOut = async (id: string) => {
    return await this.userService.deleteRefreshToken(id);
  };

  refreshAccessToken = async (id: string) => {
    const user = await this.userService.findById(id);

    if (user.refresh_token) {
      const newToken = await this.generateJwt({
        id: user.id,
        role: user.role_id,
        email: user.email,
      });
      return newToken;
    } else {
      throw new UnauthorizedException();
    }
  };

  async forgotPassword(body: { email: string }) {
    const { email } = body;

    const user = await this.userService.findByEmail(email);

    // check wether he has project access
    const project = await this.projectAccessService.getDefaultProjectAcccess(
      user.id,
    );

    if (!user) {
      return;
    }

    // generate the link and send the email
    const token = this.jwtService.sign(
      { email, id: user.id },
      {
        expiresIn: '1h',
      },
    );

    const cwd = process.cwd();
    const templateContent = await fs.readFile(
      `${cwd}/src/templates/forgot-password.html`,
      'utf-8',
    );

    const reset_link =
      this.configService.get('CLIENT_HOST') +
      '/reset-password' +
      `?token=${token}`;

    console.log('Reset Link', reset_link);

    const compiledTemplate = Handlebars.compile(templateContent);

    const htmlContent = compiledTemplate({
      name: user.first_name + ' ' + user.last_name,
      reset_link: reset_link,
    });

    await this.emailService.sendEmail(
      user.email,
      'Reset Your Password',
      '',
      htmlContent,
      project.default_mail_from,
    );
    return;
  }

  async resetPassword(body: any) {
    const { token, password, confirm_password, email } = body;

    // check password and confirm password matches
    if (password !== confirm_password) {
      throw new HttpException(
        'Password and confirm password should match',
        HttpStatus.BAD_REQUEST,
      );
    }

    // verify the link
    const verified = await this.jwtService.verify(token, {
      secret: this.configService.get('JWT_SECRET'),
    });

    console.log('Verified Link', verified);
    if (verified.email != email) {
      throw new HttpException(
        'Password and confirm password should match',
        HttpStatus.BAD_REQUEST,
      );
    }
    // hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    //update the password

    return await this.userService.findByIdAndUpdate(verified.id, {
      password: hashedPassword,
    });
  }

  private generateJwt = async (payload: object, expiry: string = '15min') => {
    return await this.jwtService.signAsync(payload, {
      expiresIn: expiry,
    });
  };
}
