import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { appUser, child, family } from '@server/database/schema';
import { hashPassword, verifyPassword } from '@server/common/utils/password';
import { signSession, type SessionPayload } from '@server/common/utils/session';

export type UserRole = 'parent' | 'child';

export interface PublicUser {
  id: string;
  username: string;
  role: UserRole;
  familyId: string;
  childId: string | null;
  displayName: string;
}

export interface PublicChild {
  id: string;
  familyId: string;
  name: string;
  avatarUrl: string | null;
  points: number;
  isActive: boolean;
  createdAt: string;
}

export interface AuthResult {
  token: string;
  user: PublicUser;
}

interface RegisterInput {
  username?: string;
  password?: string;
  displayName?: string;
  role?: string;
  inviteCode?: string;
  familyName?: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  private genInviteCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i += 1) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  private normalizeUsername(username?: string): string {
    return (username ?? '').trim().toLowerCase();
  }

  private validateCredentials(username: string, password?: string): void {
    if (!username) throw new BadRequestException('用户名不能为空');
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      throw new BadRequestException('用户名需为 3-20 位字母、数字或下划线');
    }
    if (!password || password.length < 6) {
      throw new BadRequestException('密码至少 6 位');
    }
  }

  private async assertUsernameFree(username: string): Promise<void> {
    const rows = await this.db
      .select({ id: appUser.id })
      .from(appUser)
      .where(eq(appUser.username, username))
      .limit(1);
    if (rows.length > 0) throw new ConflictException('用户名已存在');
  }

  async register(input: RegisterInput): Promise<AuthResult> {
    const role: UserRole = input.role === 'child' ? 'child' : 'parent';
    const username = this.normalizeUsername(input.username);
    this.validateCredentials(username, input.password);
    await this.assertUsernameFree(username);

    if (role === 'parent') {
      return this.registerParent(username, input);
    }
    return this.registerChild(username, input);
  }

  private async registerParent(
    username: string,
    input: RegisterInput,
  ): Promise<AuthResult> {
    const userId = randomUUID();
    const displayName = input.displayName?.trim() || username;

    // 生成唯一邀请码
    let inviteCode = this.genInviteCode();
    for (let i = 0; i < 5; i += 1) {
      const dup = await this.db
        .select({ id: family.id })
        .from(family)
        .where(eq(family.inviteCode, inviteCode))
        .limit(1);
      if (dup.length === 0) break;
      inviteCode = this.genInviteCode();
    }

    const [fam] = await this.db
      .insert(family)
      .values({
        name: input.familyName?.trim() || '我的家庭',
        inviteCode,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    const [user] = await this.db
      .insert(appUser)
      .values({
        id: userId,
        familyId: fam.id,
        username,
        passwordHash: hashPassword(input.password!),
        role: 'parent',
        displayName,
      })
      .returning();

    return this.buildSession(user, fam.createdBy ?? userId);
  }

  private async registerChild(
    username: string,
    input: RegisterInput,
  ): Promise<AuthResult> {
    const code = (input.inviteCode ?? '').trim().toUpperCase();
    if (!code) throw new BadRequestException('请填写家庭邀请码');

    const [fam] = await this.db
      .select()
      .from(family)
      .where(eq(family.inviteCode, code))
      .limit(1);
    if (!fam) throw new BadRequestException('家庭邀请码无效');

    const name = input.displayName?.trim() || username;

    // 复用同名的孩子，否则新建
    let childRow = (
      await this.db
        .select()
        .from(child)
        .where(and(eq(child.familyId, fam.id), eq(child.name, name)))
        .limit(1)
    )[0];
    if (!childRow) {
      [childRow] = await this.db
        .insert(child)
        .values({ familyId: fam.id, name })
        .returning();
    }

    const [user] = await this.db
      .insert(appUser)
      .values({
        id: randomUUID(),
        familyId: fam.id,
        username,
        passwordHash: hashPassword(input.password!),
        role: 'child',
        childId: childRow.id,
        displayName: name,
      })
      .returning();

    return this.buildSession(user, fam.createdBy ?? user.id);
  }

  async login(username?: string, password?: string): Promise<AuthResult> {
    const uname = this.normalizeUsername(username);
    if (!uname || !password) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    const [user] = await this.db
      .select()
      .from(appUser)
      .where(eq(appUser.username, uname))
      .limit(1);
    if (!user || !user.isActive || !verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    const [fam] = await this.db
      .select()
      .from(family)
      .where(eq(family.id, user.familyId))
      .limit(1);
    return this.buildSession(user, fam?.createdBy ?? user.id);
  }

  async me(session: SessionPayload): Promise<{
    user: PublicUser;
    child?: PublicChild;
    family?: { id: string; name: string; inviteCode: string | null };
  }> {
    const [user] = await this.db
      .select()
      .from(appUser)
      .where(eq(appUser.id, session.uid))
      .limit(1);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('未登录或账号已停用');
    }

    let childInfo: PublicChild | undefined;
    if (user.role === 'child' && user.childId) {
      const [row] = await this.db
        .select()
        .from(child)
        .where(eq(child.id, user.childId))
        .limit(1);
      if (row) childInfo = this.publicChild(row);
    }

    let familyInfo:
      | { id: string; name: string; inviteCode: string | null }
      | undefined;
    if (user.role === 'parent') {
      const [fam] = await this.db
        .select()
        .from(family)
        .where(eq(family.id, user.familyId))
        .limit(1);
      if (fam) {
        familyInfo = {
          id: fam.id,
          name: fam.name,
          inviteCode: fam.inviteCode ?? null,
        };
      }
    }

    return {
      user: this.publicUser(user),
      child: childInfo,
      family: familyInfo,
    };
  }

  private buildSession(
    user: typeof appUser.$inferSelect,
    ownerId: string,
  ): AuthResult {
    const payload: SessionPayload = {
      uid: user.id,
      role: user.role === 'child' ? 'child' : 'parent',
      familyId: user.familyId,
      childId: user.childId ?? null,
      ownerId,
      displayName: user.displayName ?? user.username,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    };
    return { token: signSession(payload), user: this.publicUser(user) };
  }

  private publicUser(user: typeof appUser.$inferSelect): PublicUser {
    return {
      id: user.id,
      username: user.username,
      role: user.role === 'child' ? 'child' : 'parent',
      familyId: user.familyId,
      childId: user.childId ?? null,
      displayName: user.displayName ?? user.username,
    };
  }

  private publicChild(row: typeof child.$inferSelect): PublicChild {
    return {
      id: row.id,
      familyId: row.familyId,
      name: row.name,
      avatarUrl: row.avatarUrl ?? null,
      points: row.points,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
