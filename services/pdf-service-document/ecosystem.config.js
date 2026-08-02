export default {
  apps: [
    {
      name: 'pdf-service-document',
      script: './main.js',
      instances: 1,
      exec_mode: 'fork',
      // This host has ~2.7GB shared across 13 pm2 processes, so an unbounded service risks the
      // kernel OOM-killing an unrelated one. Restarting on our own terms keeps the blast radius
      // here. Document gets the largest budget: it is the only service that parses PDFs.
      max_memory_restart: '500M',
    },
  ],
};
