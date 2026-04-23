export function getLoginValidationError(email, password) {
  if (!email || !password) {
    return 'Please fill in all fields';
  }

  return null;
}

export function getRegisterValidationError(name, email, password) {
  if (!name || !email || !password) {
    return 'Please fill in all fields';
  }

  if (password.length < 6) {
    return 'Password must be at least 6 characters';
  }

  return null;
}

export function getResetPasswordValidationError(password, confirmPassword) {
  if (!password || !confirmPassword) {
    return 'Please fill in all fields';
  }

  if (password.length < 6) {
    return 'Password must be at least 6 characters';
  }

  if (password !== confirmPassword) {
    return 'Passwords do not match';
  }

  return null;
}
