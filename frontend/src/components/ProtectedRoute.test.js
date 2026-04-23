import React from 'react';

import ProtectedRoute from './ProtectedRoute';
import { setAuthState } from '../test/moduleMocks';
import { renderComponent } from '../test/testUtils';

jest.mock('@/context/AuthContext', () => require('../test/moduleMocks').authModule);
jest.mock('@/lib/router', () => require('../test/moduleMocks').routerModule);

describe('ProtectedRoute regressions', () => {
  it('shows a loader while auth state is loading', async () => {
    setAuthState({ loading: true, isAuthenticated: false });

    const { container } = await renderComponent(
      <ProtectedRoute>
        <div>Secret</div>
      </ProtectedRoute>
    );

    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.textContent).not.toContain('Secret');
  });

  it('redirects unauthenticated users to login', async () => {
    setAuthState({ loading: false, isAuthenticated: false });

    const { container } = await renderComponent(
      <ProtectedRoute>
        <div>Secret</div>
      </ProtectedRoute>
    );

    const navigateNode = container.querySelector('[data-testid="navigate"]');
    expect(navigateNode).not.toBeNull();
    expect(navigateNode.getAttribute('data-to')).toBe('/login');
  });

  it('renders children for authenticated users', async () => {
    setAuthState({ loading: false, isAuthenticated: true });

    const { container } = await renderComponent(
      <ProtectedRoute>
        <div>Secret</div>
      </ProtectedRoute>
    );

    expect(container.textContent).toContain('Secret');
  });
});
