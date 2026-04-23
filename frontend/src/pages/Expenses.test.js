import React from 'react';

import Expenses from './Expenses';
import { changeInput, click, flushPromises, renderComponent } from '../test/testUtils';
import { apiMock, toastMock } from '../test/moduleMocks';

jest.mock('framer-motion', () => require('../test/moduleMocks').motionModule);
jest.mock('sonner', () => require('../test/moduleMocks').toastModule);
jest.mock('@/lib/api', () => require('../test/moduleMocks').apiModule);
jest.mock('@/components/ui/select', () => require('../test/moduleMocks').selectModule);
jest.mock('@/components/ui/tooltip', () => require('../test/moduleMocks').tooltipModule);
jest.mock('@/components/AddExpenseModal', () => ({
  __esModule: true,
  default: ({ open }) => <div data-testid="add-expense-modal">{open ? 'open' : 'closed'}</div>,
}));
jest.mock('@/components/UploadStatementModal', () => ({
  __esModule: true,
  default: ({ open }) => <div data-testid="upload-statement-modal">{open ? 'open' : 'closed'}</div>,
}));

function createCategories() {
  return [
    { id: 'cat-1', name: 'Food & Dining', color: '#FF6B6B' },
    { id: 'cat-2', name: 'Transport', color: '#4ECDC4' },
  ];
}

function createExpenses() {
  return [
    { id: 'exp-1', date: '2026-04-05', category: 'Food & Dining', description: 'Lunch', amount: 500 },
    { id: 'exp-2', date: '2026-04-07', category: 'Transport', description: 'Cab', amount: 200 },
  ];
}

function getMonthEnd(monthStr) {
  const [year, month] = monthStr.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${monthStr}-${String(lastDay).padStart(2, '0')}`;
}

describe('Expenses page regressions', () => {
  it('loads the selected month expenses and categories on mount', async () => {
    apiMock.getExpenses.mockResolvedValue({ data: createExpenses() });
    apiMock.getCategories.mockResolvedValue({ data: createCategories() });

    const { container } = await renderComponent(<Expenses />);
    await flushPromises();

    const monthStr = new Date().toISOString().slice(0, 7);
    expect(apiMock.getExpenses).toHaveBeenCalledWith({
      start_date: `${monthStr}-01`,
      end_date: getMonthEnd(monthStr),
    });
    expect(apiMock.getCategories).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="expense-item-exp-1"]')).not.toBeNull();
  });

  it('exports csv using the current month filters', async () => {
    apiMock.getExpenses.mockResolvedValue({ data: createExpenses() });
    apiMock.getCategories.mockResolvedValue({ data: createCategories() });
    apiMock.exportCSV.mockResolvedValue({ data: 'csv-data' });

    const { container } = await renderComponent(<Expenses />);
    await flushPromises();

    await click(container.querySelector('[data-testid="export-csv-btn"]'));
    await flushPromises();

    const monthStr = new Date().toISOString().slice(0, 7);
    expect(apiMock.exportCSV).toHaveBeenCalledWith({
      start_date: `${monthStr}-01`,
      end_date: getMonthEnd(monthStr),
    });
    expect(toastMock.success).toHaveBeenCalledWith('CSV exported successfully');
  });

  it('removes an expense from the list after successful deletion', async () => {
    apiMock.getExpenses.mockResolvedValue({ data: createExpenses() });
    apiMock.getCategories.mockResolvedValue({ data: createCategories() });
    apiMock.deleteExpense.mockResolvedValue({});

    const { container } = await renderComponent(<Expenses />);
    await flushPromises();

    expect(container.querySelector('[data-testid="expense-item-exp-1"]')).not.toBeNull();
    await click(container.querySelector('[data-testid="delete-expense-exp-1"]'));
    await flushPromises();

    expect(apiMock.deleteExpense).toHaveBeenCalledWith('exp-1');
    expect(container.querySelector('[data-testid="expense-item-exp-1"]')).toBeNull();
    expect(toastMock.success).toHaveBeenCalledWith('Expense deleted');
  });

  it('opens the add and import modals from the page actions', async () => {
    apiMock.getExpenses.mockResolvedValue({ data: createExpenses() });
    apiMock.getCategories.mockResolvedValue({ data: createCategories() });

    const { container } = await renderComponent(<Expenses />);
    await flushPromises();

    expect(container.querySelector('[data-testid="add-expense-modal"]').textContent).toBe('closed');
    expect(container.querySelector('[data-testid="upload-statement-modal"]').textContent).toBe('closed');

    await click(container.querySelector('[data-testid="add-expense-btn"]'));
    await flushPromises();
    expect(container.querySelector('[data-testid="add-expense-modal"]').textContent).toBe('open');

    await click(container.querySelector('[data-testid="upload-statement-btn"]'));
    await flushPromises();
    expect(container.querySelector('[data-testid="upload-statement-modal"]').textContent).toBe('open');
  });

  it('shows error toast when delete fails', async () => {
    apiMock.getExpenses.mockResolvedValue({ data: createExpenses() });
    apiMock.getCategories.mockResolvedValue({ data: createCategories() });
    apiMock.deleteExpense.mockRejectedValue(new Error('Server error'));

    const { container } = await renderComponent(<Expenses />);
    await flushPromises();

    await click(container.querySelector('[data-testid="delete-expense-exp-1"]'));
    await flushPromises(3);

    expect(toastMock.error).toHaveBeenCalledWith('Failed to delete');
  });

  it('shows error toast when CSV export fails', async () => {
    apiMock.getExpenses.mockResolvedValue({ data: createExpenses() });
    apiMock.getCategories.mockResolvedValue({ data: createCategories() });
    apiMock.exportCSV.mockRejectedValue(new Error('Server error'));

    const { container } = await renderComponent(<Expenses />);
    await flushPromises();

    await click(container.querySelector('[data-testid="export-csv-btn"]'));
    await flushPromises(3);

    expect(toastMock.error).toHaveBeenCalledWith('Failed to export CSV');
  });

  it('renders expense data correctly', async () => {
    apiMock.getExpenses.mockResolvedValue({ data: createExpenses() });
    apiMock.getCategories.mockResolvedValue({ data: createCategories() });

    const { container } = await renderComponent(<Expenses />);
    await flushPromises();

    expect(container.textContent).toContain('Lunch');
    expect(container.textContent).toContain('Cab');
    expect(container.textContent).toContain('Rs.500');
    expect(container.textContent).toContain('Rs.200');
  });
});
