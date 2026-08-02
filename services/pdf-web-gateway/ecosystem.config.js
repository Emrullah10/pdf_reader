export default {
  apps: [
    {
      name: 'pdf-web-gateway',
      script: './main.js',
      instances: 1,
      exec_mode: 'fork',
    },
  ],
};
