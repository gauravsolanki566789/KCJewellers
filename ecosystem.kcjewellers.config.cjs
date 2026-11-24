/**
 * PM2 on VPS: /var/www/kcjewellers
 *   pm2 start ecosystem.kcjewellers.config.cjs
 *   pm2 save
 *
 * Nginx should proxy_to http://127.0.0.1:3001 (Next) and API to backend PORT.
 */
module.exports = {
  apps: [
    {
      name: 'kc-backend',
      script: 'server.js',
      cwd: '/var/www/kcjewellers',
      node_args: '--max-old-space-size=768',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
      autorestart: true,
      max_memory_restart: '900M',
    },
    {
      name: 'kc-frontend',
      script: 'npm',
      args: 'run start',
      cwd: '/var/www/kcjewellers/client',
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
      },
      autorestart: true,
      max_memory_restart: '700M',
    },
  ],
};