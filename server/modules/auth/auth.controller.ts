import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { AuthService } from './auth.service';
import { SESSION_COOKIE, type SessionPayload } from '@server/common/utils/session';

class RegisterDto {
  username?: string;
  password?: string;
  displayName?: string;
  role?: string;
  inviteCode?: string;
  familyName?: string;
}

class LoginDto {
  username?: string;
  password?: string;
}

class ChangePasswordDto {
  oldPassword?: string;
  newPassword?: string;
}

class ChildAccountDto {
  childId?: string;
  username?: string;
  password?: string;
}

function sessionCookieOptions(): {
  httpOnly: boolean;
  sameSite: 'lax';
  secure: boolean;
  maxAge: number;
  path: string;
} {
  return {
    httpOnly: true,
    sameSite: 'lax',
    // 纯 HTTP（内网 IP 访问）下必须为 false；走 HTTPS 时设 COOKIE_SECURE=true
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** 前端用于判断是否需要登录页 */
  @Get('config')
  config(): { loginEnabled: boolean } {
    return { loginEnabled: process.env.APP_LOGIN === 'true' };
  }

  @Post('register')
  async register(
    @Body() body: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: unknown }> {
    const { token, user } = await this.authService.register(body);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
    return { user };
  }

  @HttpCode(200)
  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: unknown }> {
    const { token, user } = await this.authService.login(
      body.username,
      body.password,
    );
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
    return { user };
  }

  @HttpCode(200)
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response): { ok: boolean } {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  async me(@Req() req: Request) {
    const session = this.requireUser(req);
    return this.authService.me(session);
  }

  /** 修改自己的密码 */
  @HttpCode(200)
  @Post('password')
  async changePassword(
    @Req() req: Request,
    @Body() body: ChangePasswordDto,
  ): Promise<{ ok: boolean }> {
    const session = this.requireUser(req);
    await this.authService.changePassword(
      session.uid,
      body.oldPassword,
      body.newPassword,
    );
    return { ok: true };
  }

  /** 家长：本家庭孩子账号列表 */
  @Get('child-accounts')
  async childAccounts(@Req() req: Request) {
    const session = this.requireParent(req);
    const items = await this.authService.listChildAccounts(session.familyId);
    return { items };
  }

  /** 家长：为孩子创建 / 重置登录账号 */
  @Post('child-account')
  async saveChildAccount(
    @Req() req: Request,
    @Body() body: ChildAccountDto,
  ): Promise<{ childId: string; username: string }> {
    const session = this.requireParent(req);
    if (!body.childId) throw new UnauthorizedException('缺少 childId');
    return this.authService.upsertChildAccount(
      session.familyId,
      body.childId,
      body.username,
      body.password,
    );
  }

  private requireUser(req: Request): SessionPayload {
    const session = (req as Request & { appUser?: SessionPayload }).appUser;
    if (!session) throw new UnauthorizedException('未登录');
    return session;
  }

  private requireParent(req: Request): SessionPayload {
    const session = this.requireUser(req);
    if (session.role !== 'parent') {
      throw new ForbiddenException('仅家长可操作');
    }
    return session;
  }
}
