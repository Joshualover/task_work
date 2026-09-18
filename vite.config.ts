import path from 'path';
import { defineConfig } from '@lark-apaas/coding-preset-vite-react';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  // 本项目使用 Vue 3 单文件组件（AGENTS.md 技术栈）。
  // preset 是 React 预设，固定挂了 @vitejs/plugin-react，必须显式追加 vue 插件，
  // 否则 `.vue` 会被当作 JSX 解析，生产构建失败（PARSE_ERROR: Unexpected JSX expression）。
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client/src'),
      '@client': path.resolve(__dirname, 'client'),
      '@server': path.resolve(__dirname, 'server'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
});
