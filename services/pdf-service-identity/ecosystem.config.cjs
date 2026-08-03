export default {
  apps: [
    {
      name: 'pdf-service-identity',
      script: './main.js',
      instances: 1,
      exec_mode: 'fork',
      // Auth only — small, bounded workloads.
      max_memory_restart: '200M',
    },
  ],
};
