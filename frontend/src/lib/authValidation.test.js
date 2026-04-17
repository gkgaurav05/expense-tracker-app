import {
  getLoginValidationError,
  getRegisterValidationError,
  getResetPasswordValidationError,
} from './authValidation';

describe('auth validation helpers', () => {
  it('validates login fields', () => {
    expect(getLoginValidationError('', '')).toBe('Please fill in all fields');
    expect(getLoginValidationError('user@example.com', 'secret123')).toBeNull();
  });

  it('validates register fields and password length', () => {
    expect(getRegisterValidationError('', '', '')).toBe('Please fill in all fields');
    expect(getRegisterValidationError('Alice', 'alice@example.com', '123')).toBe('Password must be at least 6 characters');
    expect(getRegisterValidationError('Alice', 'alice@example.com', 'secret123')).toBeNull();
  });

  it('validates reset password fields, password length, and password match', () => {
    expect(getResetPasswordValidationError('', '')).toBe('Please fill in all fields');
    expect(getResetPasswordValidationError('123', '123')).toBe('Password must be at least 6 characters');
    expect(getResetPasswordValidationError('secret123', 'different123')).toBe('Passwords do not match');
    expect(getResetPasswordValidationError('secret123', 'secret123')).toBeNull();
  });
});
