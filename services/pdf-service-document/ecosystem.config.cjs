module.exports = {
  apps: [
    {
      name: 'pdf-service-document',
      script: require('path').join(__dirname, 'main.js'),
      // dotenv reads process.cwd(); pin cwd to the repo root (where the shared .env lives)
      // so the process finds it regardless of which directory pm2 was launched from.
      cwd: require('path').resolve(__dirname, '../..'),
      instances: 1,
      exec_mode: 'fork',
      // The API process no longer runs PDF extraction itself (see pdf-service-document-worker) —
      // it only accepts uploads and enqueues jobs — so its own memory budget can stay modest.
      max_memory_restart: '300M',
    },
    {
      name: 'pdf-service-document-worker',
      script: require('path').join(__dirname, 'worker.js'),
      cwd: require('path').resolve(__dirname, '../..'),
      instances: 1,
      exec_mode: 'fork',
      // This host has ~2.7GB shared across 13 pm2 processes, so an unbounded service risks the
      // kernel OOM-killing an unrelated one. Restarting on our own terms keeps the blast radius
      // here. The worker gets the largest budget: it is the only process that parses PDFs, and a
      // restart is safe — claimNext() reclaims a stale 'running' job rather than losing it.
      max_memory_restart: '500M',
    },
  ],
};
