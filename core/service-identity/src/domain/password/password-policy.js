export const assertPasswordIsValid = (password) => {
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  if (!/\d/.test(password)) {
    throw new Error('Password must contain at least one digit');
  }
  if (!/[a-zA-Z]/.test(password)) {
    throw new Error('Password must contain at least one letter');
  }
};
