// PM2 конфигурация для автопостинг бота
module.exports = {
  apps: [{
    name: 'autoposting-bot',
    script: 'index.js',
    cwd: './',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    interpreter: 'node',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    time: true
  }]
};



