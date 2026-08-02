export const makeListDocuments = ({ documentRepo }) => {
  return async ({ userId }) => documentRepo.listByUser(userId);
};
