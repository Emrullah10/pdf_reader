export class EmailAlreadyRegisteredError extends Error {
  constructor(email) {
    super(`Email already registered: ${email}`);
    this.name = 'EmailAlreadyRegisteredError';
    this.email = email;
  }
}
