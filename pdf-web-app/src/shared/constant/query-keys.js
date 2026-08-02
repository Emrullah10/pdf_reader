export const queryKeys = {
  me: ['auth', 'me'],
  documents: ['documents', 'list'],
  document: (id) => ['documents', 'detail', id],
};
