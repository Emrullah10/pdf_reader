export const ROUTE_PATHS = {
  login: '/giris',
  register: '/kayit',
  library: '/',
  reader: '/belge/:documentId',
};

export const buildReaderPath = (documentId) => `/belge/${documentId}`;
