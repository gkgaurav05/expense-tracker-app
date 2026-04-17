import React from 'react';

import ForgotPassword from './ForgotPassword';
import { apiMock, toastMock } from '../test/moduleMocks';
import { changeInput, flushPromises, renderComponent, submit } from '../test/testUtils';

jest.mock('framer-motion', () => require('../test/moduleMocks').motionModule);
jest.mock('sonner', () => require('../test/moduleMocks').toastModule);
jest.mock('@/lib/api', () => require('../test/moduleMocks').apiModule);
jest.mock('@/lib/router', () => require('../test/moduleMocks').routerModule);

describe('Forgot password regressions', () => {
  it('requires an email before submitting', async () => {
    const { container } = await renderComponent(<ForgotPassword />);
    await submit(container.querySelector('form'));

    expect(apiMock.forgotPassword).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith('Please enter your email');
  });

  it('shows the confirmation state after a successful request', async () => {
    apiMock.forgotPassword.mockResolvedValue({});

    const { container } = await renderComponent(<ForgotPassword />);

    await changeInput(container.querySelector('input[type="email"]'), 'user@example.com');
    await submit(container.querySelector('form'));
    await flushPromises(3);

    expect(apiMock.forgotPassword).toHaveBeenCalledWith('user@example.com');
    expect(container.textContent).toContain('Check your email');
    expect(container.textContent).toContain('user@example.com');
  });
});
