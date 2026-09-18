import { defineStore } from 'pinia';
import { ref } from 'vue';
import { authApi } from '@/api';
import type { AuthUser, Child, RegisterRequest } from '@shared/api.interface';

interface FamilyInfo {
  id: string;
  name: string;
  inviteCode: string | null;
}

export const useAuthStore = defineStore('auth', () => {
  /** 是否启用了应用级登录（后端 APP_LOGIN=true） */
  const loginEnabled = ref<boolean>(false);
  const ready = ref<boolean>(false);
  const user = ref<AuthUser | null>(null);
  const child = ref<Child | null>(null);
  const family = ref<FamilyInfo | null>(null);

  const isChild = (): boolean => user.value?.role === 'child';

  async function init(): Promise<void> {
    try {
      const cfg = await authApi.getConfig();
      loginEnabled.value = cfg.loginEnabled;
      if (cfg.loginEnabled) {
        try {
          const me = await authApi.me();
          applyMe(me);
        } catch {
          user.value = null;
        }
      } else {
        // 平台托管登录 / 未启用应用登录：视为家长
        user.value = {
          id: '',
          username: '',
          role: 'parent',
          familyId: '',
          childId: null,
          displayName: '家长',
        };
      }
    } catch {
      // 后端不可用时不阻塞启动，交由后续请求报错
      user.value = null;
    } finally {
      ready.value = true;
    }
  }

  function applyMe(me: {
    user: AuthUser;
    child?: Child;
    family?: FamilyInfo;
  }): void {
    user.value = me.user;
    child.value = me.child ?? null;
    family.value = me.family ?? null;
  }

  async function refresh(): Promise<void> {
    try {
      applyMe(await authApi.me());
    } catch {
      user.value = null;
      child.value = null;
      family.value = null;
    }
  }

  async function login(username: string, password: string): Promise<AuthUser> {
    const r = await authApi.login({ username, password });
    await refresh();
    return r.user;
  }

  async function register(data: RegisterRequest): Promise<AuthUser> {
    const r = await authApi.register(data);
    await refresh();
    return r.user;
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout();
    } finally {
      user.value = null;
      child.value = null;
      family.value = null;
    }
  }

  return {
    loginEnabled,
    ready,
    user,
    child,
    family,
    isChild,
    init,
    refresh,
    login,
    register,
    logout,
  };
});
