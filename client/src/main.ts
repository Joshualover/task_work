import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import './index.css';
import { useAuthStore } from './stores/auth';
import { useChildStore } from './stores/child';

// 浏览器标签页标题（构建时会被平台的 ogMeta 插件替换为 {{appName}}，
// 平台外或未配置时为空，这里做运行时兜底）。
const APP_TITLE = '小学生任务积分系统';
document.title = APP_TITLE;

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

const authStore = useAuthStore();
const childStore = useChildStore();

async function bootstrap(): Promise<void> {
  // 先初始化登录态，再挂载路由（路由守卫依赖 auth）
  await authStore.init();
  if (authStore.user?.role === 'child' && authStore.child) {
    childStore.setChildren([authStore.child], authStore.child.id);
  }
  app.use(router);
  await router.isReady();
  app.mount('#app');
}

void bootstrap();
