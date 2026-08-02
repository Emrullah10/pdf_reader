import { assertPasswordIsValid } from './password-policy.js';

describe('assertPasswordIsValid', () => {
  it('accepts a password with 8+ chars, one letter and one digit', () => {
    expect(() => assertPasswordIsValid('abcd1234')).not.toThrow();
  });

  it('rejects a password shorter than 8 characters', () => {
    expect(() => assertPasswordIsValid('ab1')).toThrow('Password must be at least 8 characters');
  });

  it('rejects a password with no digit', () => {
    expect(() => assertPasswordIsValid('abcdefgh')).toThrow('Password must contain at least one digit');
  });

  it('rejects a password with no letter', () => {
    expect(() => assertPasswordIsValid('12345678')).toThrow('Password must contain at least one letter');
  });

  it('accepts a password containing only Turkish letters plus a digit', () => {
    expect(() => assertPasswordIsValid('şifreyim1')).not.toThrow();
  });

  it('accepts a password that is exactly 8 characters, using Turkish letters', () => {
    expect(() => assertPasswordIsValid('şifre123')).not.toThrow();
  });
});
