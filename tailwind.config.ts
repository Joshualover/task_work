import { createTailwindPresetOfSimple } from '@lark-apaas/fullstack-presets';

export default {
  presets: [createTailwindPresetOfSimple()],
  // 必须包含 .vue：模板里的 class 是实际使用来源。
  // 只写 ts/tsx 会导致仅出现在 .vue 中的工具类（如 grid-cols-7）被意外裁剪。
  content: [
    './client/src/**/*.{vue,ts,tsx,css}',
  ],
  plugins: [],
}