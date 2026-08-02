export default {
  apps: [
    {
      name: 'pdf-service-identity',
      script: './main.js',
      instances: 1,
      exec_mode: 'fork',
    },
  ],
};
