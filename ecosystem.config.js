/**
 * PM2 配置（独立部署：NAS / 自有服务器）
 *
 *   npm i -g pm2
 *   pm2 start ecosystem.config.js
 *   pm2 save && pm2 startup
 *
 * 说明：应用自身会从工作目录加载 .env（见 server/app.module.ts），
 *       因此数据库、STANDALONE_USER_ID、ENABLE_CSRF 等配置写在 .env 即可。
 */
module.exports = {
  apps: [
    {
      name: 'task-work',
      script: 'dist/server/main.js',
      // 必须是项目根目录：服务端从 <cwd>/dist/client 渲染页面，并从 <cwd>/.env 读取配置
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
