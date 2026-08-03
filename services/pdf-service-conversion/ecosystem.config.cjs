module.exports = {
  apps: [
    {
      name: 'pdf-service-conversion',
      script: require('path').join(__dirname, 'main.js'),
      // dotenv reads process.cwd(); pin cwd to the repo root (where the shared .env lives)
      // so the process finds it regardless of which directory pm2 was launched from.
      cwd: require('path').resolve(__dirname, '../..'),
      instances: 1,
      exec_mode: 'fork',
      // Rendering and OCR are memory-hungry in bursts; cap them so a large job cannot starve the
      // rest of the host. See the note in pdf-service-document's config.
      max_memory_restart: '400M',
    },
  ],
};
