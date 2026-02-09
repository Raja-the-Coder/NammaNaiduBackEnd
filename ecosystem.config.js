/**
 * PM2 Ecosystem Configuration
 * 
 * Usage:
 *   Development: pm2 start ecosystem.config.js --env development
 *   Production:  pm2 start ecosystem.config.js --env production
 *   
 * Commands:
 *   pm2 status           - Check status
 *   pm2 logs             - View logs
 *   pm2 logs --lines 100 - View last 100 lines
 *   pm2 restart all      - Restart all apps
 *   pm2 reload all       - Zero-downtime reload
 *   pm2 stop all         - Stop all apps
 *   pm2 delete all       - Delete all apps
 *   pm2 save             - Save current config for auto-restart
 *   pm2 startup          - Generate startup script
 */

module.exports = {
  apps: [
    {
      name: 'nammanaidu-api',
      script: './src/server.js',
      instances: 'max',           // Use all CPU cores (cluster mode)
      exec_mode: 'cluster',       // Enable cluster mode for load balancing
      watch: false,               // Don't watch files in production
      max_memory_restart: '500M', // Restart if memory exceeds 500MB
      
      // Environment variables for development
      env_development: {
        NODE_ENV: 'development',
        PORT: 5000,
      },
      
      // Environment variables for production
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      
      // Logging configuration
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      
      // Auto-restart configuration
      autorestart: true,
      max_restarts: 10,
      restart_delay: 1000,
      
      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
  ],
};
