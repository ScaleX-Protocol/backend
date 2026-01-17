module.exports = {
  apps: [
    {
      name: 'scalex-websocket',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env_file: '.env',
      
      // Development environment
      env: {
        NODE_ENV: 'development',
        PORT: process.env.WEBSOCKET_PORT || 8080,
        DEFAULT_CHAIN_ID: '84532',
        REDIS_URL: 'redis://localhost:6380',
        DB_HOST: 'localhost',
        DB_PORT: 5432,
        DB_NAME: 'ponder_core',
        DB_USER: 'postgres',
        DB_PASSWORD: 'password'
      },
      
      // Production environment
      env_production: {
        NODE_ENV: 'production',
        PORT: process.env.WEBSOCKET_PORT || process.env.PORT || 8080,
        DEFAULT_CHAIN_ID: process.env.DEFAULT_CHAIN_ID || '84532',
        REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6380',
        DB_HOST: process.env.DB_HOST || 'localhost',
        DB_PORT: process.env.DB_PORT || 5432,
        DB_NAME: process.env.DB_NAME || 'ponder_core',
        DB_USER: process.env.DB_USER || 'postgres',
        DB_PASSWORD: process.env.DB_PASSWORD || 'password'
      },
      
      // PM2 options
      watch: false,
      ignore_watch: ['node_modules', 'logs'],
      max_memory_restart: '512M',
      
      // Logging
      log_file: 'logs/combined.log',
      out_file: 'logs/out.log',
      error_file: 'logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Process management
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      
      // Advanced PM2 features
      merge_logs: true,
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 8000
    },
    
    // Side chain websocket service
    {
      name: 'scalex-websocket-side',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env_file: '.env',
      
      // Development environment for side chain
      env: {
        NODE_ENV: 'development',
        PORT: process.env.WEBSOCKET_SIDE_PORT || 8081,
        DEFAULT_CHAIN_ID: '84532',
        REDIS_URL: 'redis://localhost:6380',
        DB_HOST: 'localhost',
        DB_PORT: 5432,
        DB_NAME: 'ponder_side',
        DB_USER: 'postgres',
        DB_PASSWORD: 'password'
      },
      
      // Production environment for side chain
      env_production: {
        NODE_ENV: 'production',
        PORT: process.env.WEBSOCKET_SIDE_PORT || 8081,
        DEFAULT_CHAIN_ID: '84532',
        REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6380',
        DB_HOST: process.env.DB_HOST || 'localhost',
        DB_PORT: process.env.DB_PORT || 5432,
        DB_NAME: process.env.DB_NAME || 'ponder_side',
        DB_USER: process.env.DB_USER || 'postgres',
        DB_PASSWORD: process.env.DB_PASSWORD || 'password'
      },
      
      // PM2 options
      watch: false,
      ignore_watch: ['node_modules', 'logs'],
      max_memory_restart: '512M',
      
      // Logging
      log_file: 'logs/side-combined.log',
      out_file: 'logs/side-out.log',
      error_file: 'logs/side-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Process management
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      
      // Advanced PM2 features
      merge_logs: true,
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 8000
    }
  ],
  
  deploy: {
    production: {
      user: 'ubuntu',
      host: ['your-production-server.com'],
      ref: 'origin/main',
      repo: 'your-git-repo-url',
      path: '/var/www/scalex-websocket',
      'post-deploy': 'npm install && npm run build && pm2 startOrRestart ecosystem.config.js --env production'
    }
  }
};