import React from 'react';

import Admin from './Admin';
import { click, flushPromises, renderComponent } from '../test/testUtils';
import { apiMock, navigateMock, setAuthState } from '../test/moduleMocks';

jest.mock('framer-motion', () => require('../test/moduleMocks').motionModule);
jest.mock('@/lib/api', () => require('../test/moduleMocks').apiModule);
jest.mock('@/lib/navigation', () => require('../test/moduleMocks').routerModule);
jest.mock('@/context/AuthContext', () => require('../test/moduleMocks').authModule);
jest.mock('recharts', () => require('../test/moduleMocks').rechartsModule);

function createStats() {
  return {
    total_users: 12,
    total_expenses: 50,
    total_budgets: 8,
    recent_signups: [
      {
        id: 'user-1',
        name: 'Alice',
        email: 'alice@example.com',
        created_at: '2026-04-15T10:00:00Z',
      },
    ],
  };
}

function createActivity() {
  return {
    today: { new_users: 2, new_expenses: 4 },
    this_week: { new_users: 5, new_expenses: 12 },
    last_30_days: {
      signups_by_day: { '2026-04-15': 2 },
      expenses_by_day: { '2026-04-15': 4 },
    },
  };
}

describe('Admin page regressions', () => {
  it('shows access denied to non-admin users and navigates back to dashboard', async () => {
    setAuthState({ user: { role: 'user' } });

    const { container } = await renderComponent(<Admin />);
    await flushPromises();

    expect(container.textContent).toContain('Access Denied');

    await click(Array.from(container.querySelectorAll('button')).find((button) => button.textContent.includes('Go to Dashboard')));
    expect(navigateMock).toHaveBeenCalledWith('/');
  });

  it('loads stats and activity for admin users', async () => {
    setAuthState({ user: { role: 'admin' } });
    apiMock.getAdminStats.mockResolvedValue({ data: createStats() });
    apiMock.getAdminActivity.mockResolvedValue({ data: createActivity() });

    const { container } = await renderComponent(<Admin />);
    await flushPromises(3);

    expect(apiMock.getAdminStats).toHaveBeenCalledTimes(1);
    expect(apiMock.getAdminActivity).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Admin Dashboard');
    expect(container.textContent).toContain('12');
    expect(container.textContent).toContain('Alice');
  });

  it('falls back to access denied when the admin api returns 403', async () => {
    setAuthState({ user: { role: 'admin' } });
    apiMock.getAdminStats.mockRejectedValue({ response: { status: 403 } });
    apiMock.getAdminActivity.mockResolvedValue({ data: createActivity() });

    const { container } = await renderComponent(<Admin />);
    await flushPromises(3);

    expect(container.textContent).toContain('Access Denied');
  });
});
