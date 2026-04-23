import React from 'react';

import Sidebar from './Sidebar';
import { renderComponent, click } from '../test/testUtils';
import { setAuthState, navigateMock } from '../test/moduleMocks';

jest.mock('@/components/ui/tooltip', () => require('../test/moduleMocks').tooltipModule);
jest.mock('@/context/AuthContext', () => require('../test/moduleMocks').authModule);
jest.mock('@/lib/router', () => require('../test/moduleMocks').routerModule);

describe('Sidebar regressions', () => {
  it('renders Dashboard, Expenses, and Budgets nav items for regular users', async () => {
    setAuthState({ user: { name: 'Alice', role: 'user' }, logout: jest.fn() });

    const { container } = await renderComponent(<Sidebar />);

    expect(container.querySelector('[data-testid="nav-dashboard"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="nav-expenses"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="nav-budgets"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="nav-admin"]')).toBeNull();
  });

  it('renders Admin nav item for admin users', async () => {
    setAuthState({ user: { name: 'Admin', role: 'admin' }, logout: jest.fn() });

    const { container } = await renderComponent(<Sidebar />);

    expect(container.querySelector('[data-testid="nav-admin"]')).not.toBeNull();
  });

  it('shows user initial in avatar', async () => {
    setAuthState({ user: { name: 'Gaurav', role: 'user' }, logout: jest.fn() });

    const { container } = await renderComponent(<Sidebar />);

    expect(container.textContent).toContain('G');
  });

  it('calls logout and navigates to /login on logout click', async () => {
    const logoutMock = jest.fn();
    setAuthState({ user: { name: 'Alice', role: 'user' }, logout: logoutMock });

    const { container } = await renderComponent(<Sidebar />);

    await click(container.querySelector('[data-testid="nav-logout"]'));

    expect(logoutMock).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith('/login');
  });

  it('renders app logo', async () => {
    setAuthState({ user: { name: 'Alice', role: 'user' }, logout: jest.fn() });

    const { container } = await renderComponent(<Sidebar />);

    const logo = container.querySelector('[data-testid="app-logo"]');
    expect(logo).not.toBeNull();
    expect(logo.textContent).toBe('S');
  });

  it('renders mobile navigation bar', async () => {
    setAuthState({ user: { name: 'Alice', role: 'user' }, logout: jest.fn() });

    const { container } = await renderComponent(<Sidebar />);

    const mobileNav = container.querySelector('[data-testid="mobile-nav"]');
    expect(mobileNav).not.toBeNull();
    expect(mobileNav.textContent).toContain('Dashboard');
    expect(mobileNav.textContent).toContain('Expenses');
    expect(mobileNav.textContent).toContain('Budgets');
  });
});
