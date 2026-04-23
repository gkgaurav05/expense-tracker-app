import React from 'react';

import Login from './Login';
import { renderComponent, submit, changeInput, flushPromises } from '../test/testUtils';
import { setAuthState, toastMock, navigateMock } from '../test/moduleMocks';

jest.mock('framer-motion', () => require('../test/moduleMocks').motionModule);
jest.mock('sonner', () => require('../test/moduleMocks').toastModule);
jest.mock('@/context/AuthContext', () => require('../test/moduleMocks').authModule);
jest.mock('@/lib/router', () => require('../test/moduleMocks').routerModule);

describe('Login page regressions', () => {
  it('requires all fields before submitting', async () => {
    const loginMock = jest.fn();
    setAuthState({ login: loginMock });

    const { container } = await renderComponent(<Login />);
    await submit(container.querySelector('form'));

    expect(loginMock).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith('Please fill in all fields');
  });

  it('calls login and navigates to dashboard on success', async () => {
    const loginMock = jest.fn().mockResolvedValue({});
    setAuthState({ login: loginMock });

    const { container } = await renderComponent(<Login />);

    await changeInput(container.querySelector('input[type="email"]'), 'alice@example.com');
    await changeInput(container.querySelector('input[type="password"]'), 'secret123');
    await submit(container.querySelector('form'));
    await flushPromises(3);

    expect(loginMock).toHaveBeenCalledWith('alice@example.com', 'secret123');
    expect(toastMock.success).toHaveBeenCalledWith('Welcome back!');
    expect(navigateMock).toHaveBeenCalledWith('/');
  });

  it('shows error toast when login fails', async () => {
    const loginMock = jest.fn().mockRejectedValue({
      response: { data: { detail: 'Invalid credentials' } },
    });
    setAuthState({ login: loginMock });

    const { container } = await renderComponent(<Login />);

    await changeInput(container.querySelector('input[type="email"]'), 'alice@example.com');
    await changeInput(container.querySelector('input[type="password"]'), 'wrong');
    await submit(container.querySelector('form'));
    await flushPromises(3);

    expect(toastMock.error).toHaveBeenCalledWith('Invalid credentials');
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('shows generic error when login fails without detail', async () => {
    const loginMock = jest.fn().mockRejectedValue(new Error('Network error'));
    setAuthState({ login: loginMock });

    const { container } = await renderComponent(<Login />);

    await changeInput(container.querySelector('input[type="email"]'), 'alice@example.com');
    await changeInput(container.querySelector('input[type="password"]'), 'secret123');
    await submit(container.querySelector('form'));
    await flushPromises(3);

    expect(toastMock.error).toHaveBeenCalledWith('Login failed');
  });

  it('renders forgot password and sign up links', async () => {
    setAuthState({ login: jest.fn() });

    const { container } = await renderComponent(<Login />);

    expect(container.querySelector('a[href="/forgot-password"]')).not.toBeNull();
    expect(container.querySelector('a[href="/register"]')).not.toBeNull();
    expect(container.textContent).toContain('Forgot password?');
    expect(container.textContent).toContain('Sign up');
  });

  it('disables submit button while loading', async () => {
    let resolveLogin;
    const loginMock = jest.fn(() => new Promise((resolve) => { resolveLogin = resolve; }));
    setAuthState({ login: loginMock });

    const { container } = await renderComponent(<Login />);

    await changeInput(container.querySelector('input[type="email"]'), 'alice@example.com');
    await changeInput(container.querySelector('input[type="password"]'), 'secret123');
    await submit(container.querySelector('form'));

    const btn = container.querySelector('button[type="submit"]');
    expect(btn.disabled).toBe(true);
    expect(container.textContent).toContain('Signing in...');

    resolveLogin({});
    await flushPromises(3);
  });
});
