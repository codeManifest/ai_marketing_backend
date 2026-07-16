module.exports = {
  apps: [
    {
      name: 'postlyai-api',
      script: 'src/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      },
      env_development: {
        NODE_ENV: 'development'
      }
    },
    {
      name: 'postlyai-worker',
      script: 'src/worker.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        IS_WORKER: 'true'
      },
      env_development: {
        NODE_ENV: 'development',
        IS_WORKER: 'true'
      }
    }
  ]
};
