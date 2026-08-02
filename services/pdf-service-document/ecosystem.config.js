export default {
  apps: [
    {
      name: 'pdf-service-document',
      script: './main.js',
      instances: 1,
      exec_mode: 'fork',
    },
  ],
};
