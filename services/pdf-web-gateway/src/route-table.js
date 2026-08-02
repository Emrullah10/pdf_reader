export const buildRouteTable = (config) => [
  { prefix: '/api/documents', target: config.documentServiceUrl },
  { prefix: '/api/conversion', target: config.conversionServiceUrl },
];
