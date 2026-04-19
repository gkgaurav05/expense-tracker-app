import React from 'react';

import App from './App';
import { flushPromises, renderComponent } from './test/testUtils';

let mockAuthState = {
  loading: false,
  isAuthenticated: false,
  user: null,
  logout: jest.fn(),
};

function setAppAuthState(nextState) {
  mockAuthState = {
    loading: false,
    isAuthenticated: false,
    user: null,
    logout: jest.fn(),
    ...nextState,
  };
}

async function renderAppAt(pathname, nextState) {
  window.history.pushState({}, '', pathname);
  setAppAuthState(nextState);

  const rendered = await renderComponent(<App />);
  await flushPromises(3);
  return rendered;
}

jest.mock('react-router-dom', () => {
  const React = require('react');

  function matchRoute(routePath, pathname) {
    if (routePath === '/*') {
      return true;
    }

    if (routePath && routePath.endsWith('/*')) {
      return pathname === routePath.slice(0, -2) || pathname.startsWith(routePath.slice(0, -1));
    }

    return routePath === pathname;
  }

  function resolveElement(element, routes) {
    if (!React.isValidElement(element)) {
      return element;
    }

    if (element.type === Navigate) {
      globalThis.window.history[element.props.replace ? 'replaceState' : 'pushState']({}, '', element.props.to);
      const redirected = routes.find((route) => matchRoute(route.props.path, globalThis.window.location.pathname));
      return redirected ? resolveElement(redirected.props.element, routes) : null;
    }

    if (typeof element.type === 'function') {
      return resolveElement(element.type(element.props), routes);
    }

    return element;
  }

  function BrowserRouter({ children }) {
    return React.createElement(React.Fragment, null, children);
  }

  function Routes({ children }) {
    const routes = React.Children.toArray(children).filter(Boolean);
    const matched = routes.find((route) => matchRoute(route.props.path, globalThis.window.location.pathname));
    return matched ? resolveElement(matched.props.element, routes) : null;
  }

  function Route() {
    return null;
  }

  function Navigate() {
    return null;
  }

  return { BrowserRouter, Routes, Route, Navigate };
}, { virtual: true });

jest.mock('@/context/AuthContext', () => {
  const React = require('react');

  return {
    AuthProvider: ({ children }) => React.createElement(React.Fragment, null, children),
    useAuth: () => mockAuthState,
  };
});

jest.mock('@/components/ui/sonner', () => ({
  Toaster: () => <div data-testid="toaster" />,
}));

jest.mock('@/components/ProtectedRoute', () => ({
  __esModule: true,
  default: ({ children }) => {
    const React = require('react');
    const { Navigate } = require('react-router-dom');
    return mockAuthState.isAuthenticated
      ? React.createElement(React.Fragment, null, children)
      : React.createElement(Navigate, { to: '/login', replace: true });
  },
}));

jest.mock('@/components/Sidebar', () => () => <div data-testid="sidebar">Sidebar</div>);
jest.mock('@/pages/Dashboard', () => () => <div data-testid="page-dashboard">Dashboard Page</div>);
jest.mock('@/pages/Expenses', () => () => <div data-testid="page-expenses">Expenses Page</div>);
jest.mock('@/pages/Budgets', () => () => <div data-testid="page-budgets">Budgets Page</div>);
jest.mock('@/pages/Admin', () => () => <div data-testid="page-admin">Admin Page</div>);
jest.mock('@/pages/Login', () => () => <div data-testid="page-login">Login Page</div>);
jest.mock('@/pages/Register', () => () => <div data-testid="page-register">Register Page</div>);
jest.mock('@/pages/ForgotPassword', () => () => <div data-testid="page-forgot-password">Forgot Password Page</div>);
jest.mock('@/pages/ResetPassword', () => () => <div data-testid="page-reset-password">Reset Password Page</div>);

describe('App routing regressions', () => {
  it('shows the auth loader before choosing a route', async () => {
    const { container } = await renderAppAt('/login', { loading: true });

    expect(container.querySelector('.animate-spin')).not.toBeNull();
    expect(container.querySelector('[data-testid="page-login"]')).toBeNull();
  });

  it('renders the login route for signed-out users', async () => {
    const { container } = await renderAppAt('/login', { isAuthenticated: false });

    expect(container.querySelector('[data-testid="page-login"]')).not.toBeNull();
    expect(window.location.pathname).toBe('/login');
  });

  it('redirects authenticated users away from login to the dashboard', async () => {
    const { container } = await renderAppAt('/login', {
      isAuthenticated: true,
      user: { id: 'user-1', role: 'user' },
    });

    expect(container.querySelector('[data-testid="page-dashboard"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sidebar"]')).not.toBeNull();
    expect(window.location.pathname).toBe('/');
  });

  it('redirects signed-out users from protected routes to login', async () => {
    const { container } = await renderAppAt('/expenses', { isAuthenticated: false });

    expect(container.querySelector('[data-testid="page-login"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="page-expenses"]')).toBeNull();
    expect(window.location.pathname).toBe('/login');
  });

  it('renders protected routes for authenticated users', async () => {
    const { container } = await renderAppAt('/expenses', {
      isAuthenticated: true,
      user: { id: 'user-1', role: 'user' },
    });

    expect(container.querySelector('[data-testid="page-expenses"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sidebar"]')).not.toBeNull();
    expect(window.location.pathname).toBe('/expenses');
  });

  it('keeps forgot and reset password routes public for signed-out users', async () => {
    const forgot = await renderAppAt('/forgot-password', { isAuthenticated: false });
    expect(forgot.container.querySelector('[data-testid="page-forgot-password"]')).not.toBeNull();

    const reset = await renderAppAt('/reset-password?token=reset-token', { isAuthenticated: false });
    expect(reset.container.querySelector('[data-testid="page-reset-password"]')).not.toBeNull();
    expect(window.location.pathname).toBe('/reset-password');
  });

  it('routes authenticated users to the admin screen', async () => {
    const { container } = await renderAppAt('/admin', {
      isAuthenticated: true,
      user: { id: 'admin-1', role: 'admin' },
    });

    expect(container.querySelector('[data-testid="page-admin"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sidebar"]')).not.toBeNull();
  });
});
