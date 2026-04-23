import React from 'react';

import Register from './Register';
import { renderComponent, submit, changeInput, flushPromises } from '../test/testUtils';
import { setAuthState, toastMock, navigateMock } from '../test/moduleMocks';

jest.mock('framer-motion', () => require('../test/moduleMocks').motionModule);
jest.mock('sonner', () => require('../test/moduleMocks').toastModule);
jest.mock('@/context/AuthContext', () => require('../test/moduleMocks').authModule);
jest.mock('@/lib/router', () => require('../test/moduleMocks').routerModule);

describe('Register page regressions', () => {
  it('renders the account creation copy and sign in link', async () => {
    setAuthState({ register: jest.fn() });

    const { container } = await renderComponent(<Register />);

    expect(container.textContent).toContain('Create your account');
    expect(container.textContent).toContain('Already have an account?');
    expect(container.querySelector('a[href="/login"]')).not.toBeNull();
  });

  it('requires all fields before submitting', async () => {
    const registerMock = jest.fn();
    setAuthState({ register: registerMock });

    const { container } = await renderComponent(<Register />);
    await submit(container.querySelector('form'));

    expect(registerMock).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith('Please fill in all fields');
  });

  it('rejects short passwords', async () => {
    const registerMock = jest.fn();
    setAuthState({ register: registerMock });

    const { container } = await renderComponent(<Register />);

    await changeInput(container.querySelector('input[type="text"]'), 'Alice');
    await changeInput(container.querySelector('input[type="email"]'), 'alice@example.com');
    await changeInput(container.querySelector('input[type="password"]'), '123');
    await submit(container.querySelector('form'));

    expect(registerMock).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith('Password must be at least 6 characters');
  });

  it('calls register and navigates on success', async () => {
    const registerMock = jest.fn().mockResolvedValue({});
    setAuthState({ register: registerMock });

    const { container } = await renderComponent(<Register />);

    await changeInput(container.querySelector('input[type="text"]'), 'Alice');
    await changeInput(container.querySelector('input[type="email"]'), 'alice@example.com');
    await changeInput(container.querySelector('input[type="password"]'), 'secret123');
    await submit(container.querySelector('form'));
    await flushPromises(3);

    expect(registerMock).toHaveBeenCalledWith('Alice', 'alice@example.com', 'secret123');
    expect(toastMock.success).toHaveBeenCalledWith('Account created successfully!');
    expect(navigateMock).toHaveBeenCalledWith('/');
  });

  it('shows error toast when registration fails with detail', async () => {
    const registerMock = jest.fn().mockRejectedValue({
      response: { data: { detail: 'Email already registered' } },
    });
    setAuthState({ register: registerMock });

    const { container } = await renderComponent(<Register />);

    await changeInput(container.querySelector('input[type="text"]'), 'Alice');
    await changeInput(container.querySelector('input[type="email"]'), 'alice@example.com');
    await changeInput(container.querySelector('input[type="password"]'), 'secret123');
    await submit(container.querySelector('form'));
    await flushPromises(3);

    expect(toastMock.error).toHaveBeenCalledWith('Email already registered');
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('shows generic error when registration fails without detail', async () => {
    const registerMock = jest.fn().mockRejectedValue(new Error('Network error'));
    setAuthState({ register: registerMock });

    const { container } = await renderComponent(<Register />);

    await changeInput(container.querySelector('input[type="text"]'), 'Alice');
    await changeInput(container.querySelector('input[type="email"]'), 'alice@example.com');
    await changeInput(container.querySelector('input[type="password"]'), 'secret123');
    await submit(container.querySelector('form'));
    await flushPromises(3);

    expect(toastMock.error).toHaveBeenCalledWith('Registration failed');
  });

  it('disables submit button while loading', async () => {
    let resolveRegister;
    const registerMock = jest.fn(() => new Promise((resolve) => { resolveRegister = resolve; }));
    setAuthState({ register: registerMock });

    const { container } = await renderComponent(<Register />);

    await changeInput(container.querySelector('input[type="text"]'), 'Alice');
    await changeInput(container.querySelector('input[type="email"]'), 'alice@example.com');
    await changeInput(container.querySelector('input[type="password"]'), 'secret123');
    await submit(container.querySelector('form'));

    const btn = container.querySelector('button[type="submit"]');
    expect(btn.disabled).toBe(true);
    expect(container.textContent).toContain('Creating account...');

    resolveRegister({});
    await flushPromises(3);
  });
});
