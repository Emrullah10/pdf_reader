export default {
  apps: [
    {
      name: 'pdf-web-gateway',
      script: './main.js',
      instances: 1,
      exec_mode: 'fork',
      // Proxying only; uploads stream through without being buffered here, so this should stay
      // flat. A restart at this level means something is leaking.
      max_memory_restart: '250M',
    },
  ],
};
