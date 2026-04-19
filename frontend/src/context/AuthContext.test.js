import React from 'react';

import { AuthProvider, useAuth } from './AuthContext';
import { apiMock } from '../test/moduleMocks';
import { click, flushPromises, renderComponent } from '../test/testUtils';

jest.mock('@/lib/api', () => require('../test/moduleMocks').apiModule);

function AuthConsumer() {
  const { user, loading, isAuthenticated, login, register, logout } = useAuth();

  return (
    <div>
      <div data-testid="auth-loading">{String(loading)}</div>
      <div data-testid="auth-user">{user?.email || 'none'}</div>
      <div data-testid="auth-authenticated">{String(isAuthenticated)}</div>
      <button type="button" data-testid="auth-login" onClick={() => login('user@example.com', 'secret123')}>
        Login
      </button>
      <button type="button" data-testid="auth-register" onClick={() => register('Alice', 'alice@example.com', 'secret123')}>
        Register
      </button>
      <button type="button" data-testid="auth-logout" onClick={logout}>
        Logout
      </button>
    </div>
  );
}

describe('AuthContext regressions', () => {
  it('hydrates the current user from localStorage token on mount', async () => {
    localStorage.setItem('token', 'persisted-token');
    apiMock.getMe.mockResolvedValue({ data: { id: 'user-1', email: 'persisted@example.com' } });

    const { container } = await renderComponent(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );
    await flushPromises(3);

    expect(apiMock.setToken).toHaveBeenCalledWith('persisted-token');
    expect(apiMock.getMe).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="auth-user"]').textContent).toBe('persisted@example.com');
    expect(container.querySelector('[data-testid="auth-authenticated"]').textContent).toBe('true');
  });

  it('login stores the token and user in context', async () => {
    apiMock.login.mockResolvedValue({
      data: {
        access_token: 'login-token',
        user: { id: 'user-1', email: 'user@example.com' },
      },
    });

    const { container } = await renderComponent(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );
    await flushPromises();

    await click(container.querySelector('[data-testid="auth-login"]'));
    await flushPromises(3);

    expect(apiMock.login).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('token')).toBe('login-token');
    expect(container.querySelector('[data-testid="auth-user"]').textContent).toBe('user@example.com');
  });

  it('register stores the token and logout clears it', async () => {
    apiMock.register.mockResolvedValue({
      data: {
        access_token: 'register-token',
        user: { id: 'user-2', email: 'alice@example.com' },
      },
    });

    const { container } = await renderComponent(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );
    await flushPromises();

    await click(container.querySelector('[data-testid="auth-register"]'));
    await flushPromises(3);

    expect(localStorage.getItem('token')).toBe('register-token');
    expect(container.querySelector('[data-testid="auth-user"]').textContent).toBe('alice@example.com');

    await click(container.querySelector('[data-testid="auth-logout"]'));
    await flushPromises();

    expect(localStorage.getItem('token')).toBeNull();
    expect(container.querySelector('[data-testid="auth-user"]').textContent).toBe('none');
    expect(apiMock.setToken).toHaveBeenLastCalledWith(null);
  });
});
