import React from 'react';
import { act } from 'react-dom/test-utils';

import ResetPassword from './ResetPassword';
import { apiMock, navigateMock, setSearchParamsState, toastMock } from '../test/moduleMocks';
import { changeInput, flushPromises, renderComponent, submit } from '../test/testUtils';

jest.mock('framer-motion', () => require('../test/moduleMocks').motionModule);
jest.mock('sonner', () => require('../test/moduleMocks').toastModule);
jest.mock('@/lib/api', () => require('../test/moduleMocks').apiModule);
jest.mock('@/lib/router', () => require('../test/moduleMocks').routerModule);

describe('Reset password regressions', () => {
  it('shows the invalid link state when no token is present', async () => {
    setSearchParamsState('');

    const { container } = await renderComponent(<ResetPassword />);

    expect(container.textContent).toContain('Invalid Link');
    expect(container.textContent).toContain('Request New Link');
  });

  it('validates matching passwords before submitting', async () => {
    setSearchParamsState('token=reset-token');

    const { container } = await renderComponent(<ResetPassword />);

    await changeInput(container.querySelectorAll('input[type="password"]')[0], 'secret123');
    await changeInput(container.querySelectorAll('input[type="password"]')[1], 'different123');
    await submit(container.querySelector('form'));

    expect(apiMock.resetPassword).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith('Passwords do not match');
  });

  it('submits the token and redirects to login after a successful reset', async () => {
    jest.useFakeTimers();
    setSearchParamsState('token=reset-token');
    apiMock.resetPassword.mockResolvedValue({});

    const { container } = await renderComponent(<ResetPassword />);

    await changeInput(container.querySelectorAll('input[type="password"]')[0], 'secret123');
    await changeInput(container.querySelectorAll('input[type="password"]')[1], 'secret123');
    await submit(container.querySelector('form'));
    await flushPromises(3);

    expect(apiMock.resetPassword).toHaveBeenCalledWith('reset-token', 'secret123');
    expect(toastMock.success).toHaveBeenCalledWith('Password reset successfully!');
    expect(container.textContent).toContain('Password Reset!');

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    expect(navigateMock).toHaveBeenCalledWith('/login');
  });

  it('shows the backend error when reset fails', async () => {
    setSearchParamsState('token=reset-token');
    apiMock.resetPassword.mockRejectedValue({
      response: { data: { detail: 'Reset token has expired' } },
    });

    const { container } = await renderComponent(<ResetPassword />);

    await changeInput(container.querySelectorAll('input[type="password"]')[0], 'secret123');
    await changeInput(container.querySelectorAll('input[type="password"]')[1], 'secret123');
    await submit(container.querySelector('form'));
    await flushPromises(3);

    expect(container.textContent).toContain('Reset token has expired');
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
