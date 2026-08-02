export default {
  apps: [
    {
      name: 'pdf-service-conversion',
      script: './main.js',
      instances: 1,
      exec_mode: 'fork',
    },
  ],
};
