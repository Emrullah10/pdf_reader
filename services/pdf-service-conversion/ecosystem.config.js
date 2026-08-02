export default {
  apps: [
    {
      name: 'pdf-service-conversion',
      script: './main.js',
      instances: 1,
      exec_mode: 'fork',
      // Rendering and OCR are memory-hungry in bursts; cap them so a large job cannot starve the
      // rest of the host. See the note in pdf-service-document's config.
      max_memory_restart: '400M',
    },
  ],
};
