import React from 'react';

import ResetPassword from './ResetPassword';
import { setSearchParamsState } from '../test/moduleMocks';
import { renderComponent } from '../test/testUtils';

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
});
