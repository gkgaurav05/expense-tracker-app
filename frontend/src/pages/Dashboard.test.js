import React from 'react';

import Dashboard from './Dashboard';
import { click, flushPromises, renderComponent } from '../test/testUtils';
import { apiMock, navigateMock, toastMock } from '../test/moduleMocks';

jest.mock('framer-motion', () => require('../test/moduleMocks').motionModule);
jest.mock('sonner', () => require('../test/moduleMocks').toastModule);
jest.mock('@/lib/api', () => require('../test/moduleMocks').apiModule);
jest.mock('@/lib/navigation', () => require('../test/moduleMocks').routerModule);
jest.mock('@/components/ui/tabs', () => require('../test/moduleMocks').tabsModule);
jest.mock('@/components/ui/tooltip', () => require('../test/moduleMocks').tooltipModule);
jest.mock('@/components/SpendingCharts', () => require('../test/moduleMocks').spendingChartsModule);
jest.mock('@/components/BudgetAlerts', () => require('../test/moduleMocks').budgetAlertsModule);

function createMonthlySummary() {
  return {
    total_month: 2500,
    avg_daily: 500,
    budget_remaining: 1500,
    total_budget: 4000,
    expense_count: 5,
    daily_spending: [{ date: '2026-04-01', amount: 500 }],
    category_breakdown: [{ category: 'Food & Dining', amount: 2500, color: '#FF6B6B' }],
    recent_expenses: [{ id: 'exp-1', date: '2026-04-05', category: 'Food & Dining', description: 'Lunch', amount: 500 }],
  };
}

function createWeeklySummary() {
  return {
    view: 'weekly',
    week_start: '2026-04-13',
    week_end: '2026-04-19',
    total_spent: 900,
    total_week: 900,
    avg_daily: 300,
    budget_remaining: 3100,
    total_budget: 4000,
    expense_count: 3,
    daily_spending: [{ date: '2026-04-13', amount: 300 }],
    category_breakdown: [{ category: 'Transport', amount: 900, color: '#4ECDC4' }],
    recent_expenses: [{ id: 'exp-2', date: '2026-04-14', category: 'Transport', description: 'Cab', amount: 300 }],
  };
}

describe('Dashboard page regressions', () => {
  it('loads monthly data first and refetches weekly data when the weekly tab is selected', async () => {
    apiMock.getDashboardSummary
      .mockResolvedValueOnce({ data: createMonthlySummary() })
      .mockResolvedValueOnce({ data: createWeeklySummary() });

    const { container } = await renderComponent(<Dashboard />);
    await flushPromises();

    expect(apiMock.getDashboardSummary).toHaveBeenNthCalledWith(1, { view: 'monthly' });
    expect(container.querySelector('[data-testid="budget-alerts"]')).not.toBeNull();

    await click(container.querySelector('[data-testid="dashboard-weekly-tab"]'));
    await flushPromises(3);

    expect(apiMock.getDashboardSummary).toHaveBeenNthCalledWith(2, { view: 'weekly' });
    expect(container.textContent).toContain('Apr 13 - Apr 19, 2026');
    expect(container.querySelector('[data-testid="budget-alerts"]')).toBeNull();
  });

  it('downloads weekly csv using the backend week boundaries', async () => {
    apiMock.getDashboardSummary
      .mockResolvedValueOnce({ data: createMonthlySummary() })
      .mockResolvedValueOnce({ data: createWeeklySummary() });
    apiMock.exportCSV.mockResolvedValue({ data: 'csv-data' });

    const { container } = await renderComponent(<Dashboard />);
    await flushPromises();

    await click(container.querySelector('[data-testid="dashboard-weekly-tab"]'));
    await flushPromises(3);
    await click(container.querySelector('[data-testid="download-csv-btn"]'));
    await flushPromises();

    expect(apiMock.exportCSV).toHaveBeenCalledWith({
      start_date: '2026-04-13',
      end_date: '2026-04-19',
    });
    expect(window.URL.createObjectURL).toHaveBeenCalled();
    expect(toastMock.success).toHaveBeenCalledWith('CSV downloaded');
  });

  it('loads AI insights on demand and shows the returned text', async () => {
    apiMock.getDashboardSummary.mockResolvedValue({ data: createMonthlySummary() });
    apiMock.getInsights.mockResolvedValue({ data: { insights: 'Spend less on takeout.' } });

    const { container } = await renderComponent(<Dashboard />);
    await flushPromises();

    const insightsButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('AI Insights')
    );

    await click(insightsButton);
    await flushPromises(3);

    expect(apiMock.getInsights).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Spend less on takeout.');
  });

  it('navigates to the expenses page from the recent expenses card', async () => {
    apiMock.getDashboardSummary.mockResolvedValue({ data: createMonthlySummary() });

    const { container } = await renderComponent(<Dashboard />);
    await flushPromises();

    await click(container.querySelector('[data-testid="view-all-expenses-btn"]'));

    expect(navigateMock).toHaveBeenCalledWith('/expenses');
  });

  it('handles API failure gracefully without crashing', async () => {
    apiMock.getDashboardSummary.mockRejectedValue(new Error('Server error'));

    const { container } = await renderComponent(<Dashboard />);
    await flushPromises(3);

    // Should still render the page structure without crashing
    expect(container.querySelector('[data-testid="dashboard-weekly-tab"]')).not.toBeNull();
  });

  it('renders stat cards with correct values from monthly summary', async () => {
    apiMock.getDashboardSummary.mockResolvedValue({ data: createMonthlySummary() });

    const { container } = await renderComponent(<Dashboard />);
    await flushPromises();

    expect(container.textContent).toContain('Rs.2500');
    expect(container.textContent).toContain('Rs.1500');
    expect(container.textContent).toContain('5');
  });

  it('renders charts with the correct data point counts', async () => {
    apiMock.getDashboardSummary.mockResolvedValue({ data: createMonthlySummary() });

    const { container } = await renderComponent(<Dashboard />);
    await flushPromises();

    expect(container.querySelector('[data-testid="daily-spending-chart"]').textContent).toBe('points:1');
    expect(container.querySelector('[data-testid="category-pie-chart"]').textContent).toBe('slices:1');
  });
});
