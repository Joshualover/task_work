import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import './index.css';

// 浏览器标签页标题（构建时会被平台的 ogMeta 插件替换为 {{appName}}，
// 平台外或未配置时为空，这里做运行时兜底）。
const APP_TITLE = '小学生任务积分系统';
document.title = APP_TITLE;

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.mount('#app');
