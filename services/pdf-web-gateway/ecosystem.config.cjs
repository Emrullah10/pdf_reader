module.exports = {
  apps: [
    {
      name: 'pdf-web-gateway',
      script: require('path').join(__dirname, 'main.js'),
      // dotenv reads process.cwd(); pin cwd to the repo root (where the shared .env lives)
      // so the process finds it regardless of which directory pm2 was launched from.
      cwd: require('path').resolve(__dirname, '../..'),
      instances: 1,
      exec_mode: 'fork',
      // Proxying only; uploads stream through without being buffered here, so this should stay
      // flat. A restart at this level means something is leaking.
      max_memory_restart: '250M',
    },
  ],
};
