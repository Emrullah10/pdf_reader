module.exports = {
  apps: [
    {
      name: 'pdf-service-identity',
      script: './main.js',
      // dotenv reads process.cwd(); pin cwd to the repo root (where the shared .env lives)
      // so the process finds it regardless of which directory pm2 was launched from.
      cwd: require('path').resolve(__dirname, '../..'),
      instances: 1,
      exec_mode: 'fork',
      // Auth only — small, bounded workloads.
      max_memory_restart: '200M',
    },
  ],
};
