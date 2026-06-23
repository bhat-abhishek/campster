import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthServices } from './auth.service';
import { DatabaseModule } from 'src/modules/database/database.module';
import { UserModule } from '../user/user.module';
import { ProjectModule } from '../project/project.module';
import { ProjectAccessModule } from '../project-access/projectAccess.module';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    DatabaseModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        global: true,
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '7d'),
        },
      }),
    }),
    ConfigModule,
    UserModule,
    ProjectModule,
    ProjectAccessModule,
    EmailModule,
  ],
  controllers: [AuthController],
  providers: [AuthServices],
})
export class AuthModule {}
