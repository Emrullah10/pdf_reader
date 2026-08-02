export const makeFakeUserRepository = (initialUsers = []) => {
  const users = [...initialUsers];
  let nextId = users.length + 1;

  return {
    async findByEmail(email) {
      return users.find((u) => u.email === email) ?? null;
    },
    async findById(id) {
      return users.find((u) => u.id === id) ?? null;
    },
    async create({ email, passwordHash, name, locale }) {
      const user = { id: `user-${nextId++}`, email, passwordHash, name, locale, createdAt: new Date() };
      users.push(user);
      return user;
    },
    _all: users,
  };
};
