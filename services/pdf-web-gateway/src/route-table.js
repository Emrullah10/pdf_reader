export const buildRouteTable = (config) => [
  { prefix: '/api/documents', target: config.documentServiceUrl },
];
