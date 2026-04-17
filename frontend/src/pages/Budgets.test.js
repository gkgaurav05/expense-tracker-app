import React from 'react';

import Budgets from './Budgets';
import { changeInput, click, flushPromises, renderComponent } from '../test/testUtils';
import { apiMock, toastMock } from '../test/moduleMocks';

jest.mock('framer-motion', () => require('../test/moduleMocks').motionModule);
jest.mock('sonner', () => require('../test/moduleMocks').toastModule);
jest.mock('@/lib/api', () => require('../test/moduleMocks').apiModule);
jest.mock('@/components/ui/tabs', () => require('../test/moduleMocks').tabsModule);
jest.mock('@/components/ui/progress', () => require('../test/moduleMocks').progressModule);

function createCategories() {
  return [{ id: 'cat-1', name: 'Food & Dining', color: '#FF6B6B' }];
}

function createBudgets() {
  return [{ id: 'budget-1', category: 'Food & Dining', amount: 1200 }];
}

function createExpenses() {
  return [{ id: 'exp-1', category: 'Food & Dining', amount: 300 }];
}

function createSavings() {
  return {
    total_budget: 2000,
    total_spent: 1500,
    total_saved: 500,
    savings_rate: 25,
    months_analyzed: 6,
    period: '2025-11 to 2026-04',
    monthly_breakdown: [
      {
        month: '2026-04',
        total_budget: 1000,
        total_spent: 800,
        total_saved: 200,
        categories: [{ category: 'Food & Dining', saved: 200 }],
      },
    ],
    category_summary: [
      {
        category: 'Food & Dining',
        budget: 2000,
        spent: 1500,
        saved: 500,
        color: '#FF6B6B',
      },
    ],
  };
}

describe('Budgets page regressions', () => {
  it('loads categories, month budgets, and month expenses on mount', async () => {
    apiMock.getCategories.mockResolvedValue({ data: createCategories() });
    apiMock.getBudgets.mockResolvedValue({ data: createBudgets() });
    apiMock.getExpenses.mockResolvedValue({ data: createExpenses() });

    const { container } = await renderComponent(<Budgets />);
    await flushPromises();

    const monthStr = new Date().toISOString().slice(0, 7);
    expect(apiMock.getBudgets).toHaveBeenCalledWith({ month: monthStr });
    expect(apiMock.getExpenses).toHaveBeenCalledWith({
      start_date: `${monthStr}-01`,
      end_date: `${monthStr}-31`,
    });
    expect(container.querySelector('[data-testid="budget-card-Food & Dining"]')).not.toBeNull();
  });

  it('blocks invalid budget saves before calling the api', async () => {
    apiMock.getCategories.mockResolvedValue({ data: createCategories() });
    apiMock.getBudgets.mockResolvedValue({ data: [] });
    apiMock.getExpenses.mockResolvedValue({ data: [] });

    const { container } = await renderComponent(<Budgets />);
    await flushPromises();

    await changeInput(container.querySelector('[data-testid="budget-amount-input-Food & Dining"]'), '0');
    await click(container.querySelector('[data-testid="save-budget-btn-Food & Dining"]'));

    expect(apiMock.createOrUpdateBudget).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith('Enter a valid budget amount');
  });

  it('saves valid budgets with the active month and refetches data', async () => {
    apiMock.getCategories.mockResolvedValue({ data: createCategories() });
    apiMock.getBudgets.mockResolvedValue({ data: [] });
    apiMock.getExpenses.mockResolvedValue({ data: [] });
    apiMock.createOrUpdateBudget.mockResolvedValue({});

    const { container } = await renderComponent(<Budgets />);
    await flushPromises();

    await changeInput(container.querySelector('[data-testid="budget-amount-input-Food & Dining"]'), '1500');
    await click(container.querySelector('[data-testid="save-budget-btn-Food & Dining"]'));
    await flushPromises(3);

    const monthStr = new Date().toISOString().slice(0, 7);
    expect(apiMock.createOrUpdateBudget).toHaveBeenCalledWith({
      category: 'Food & Dining',
      amount: 1500,
      month: monthStr,
    });
    expect(toastMock.success).toHaveBeenCalledWith('Budget set for Food & Dining');
  });

  it('loads performance data when switching to the performance tab', async () => {
    apiMock.getCategories.mockResolvedValue({ data: createCategories() });
    apiMock.getBudgets.mockResolvedValue({ data: createBudgets() });
    apiMock.getExpenses.mockResolvedValue({ data: createExpenses() });
    apiMock.getSavings.mockResolvedValue({ data: createSavings() });

    const { container } = await renderComponent(<Budgets />);
    await flushPromises();

    await click(Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Performance'));
    await flushPromises(3);

    expect(apiMock.getSavings).toHaveBeenCalledWith({ months: 6 });
    expect(container.textContent).toContain('Analyzing:');
    expect(container.textContent).toContain('Category Savings');
  });

  it('deletes an existing budget from the category card', async () => {
    apiMock.getCategories.mockResolvedValue({ data: createCategories() });
    apiMock.getBudgets.mockResolvedValue({ data: createBudgets() });
    apiMock.getExpenses.mockResolvedValue({ data: createExpenses() });
    apiMock.deleteBudget.mockResolvedValue({});

    const { container } = await renderComponent(<Budgets />);
    await flushPromises();

    await click(container.querySelector('[data-testid="delete-budget-Food & Dining"]'));
    await flushPromises(3);

    expect(apiMock.deleteBudget).toHaveBeenCalledWith('budget-1');
    expect(toastMock.success).toHaveBeenCalledWith('Budget removed');
  });
});
