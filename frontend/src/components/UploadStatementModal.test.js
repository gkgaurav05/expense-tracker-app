import React from 'react';
import { act } from 'react-dom/test-utils';

import UploadStatementModal from './UploadStatementModal';
import { apiMock, toastMock } from '../test/moduleMocks';
import { changeFileInput, click, flushPromises, renderComponent } from '../test/testUtils';

jest.mock('framer-motion', () => require('../test/moduleMocks').motionModule);
jest.mock('sonner', () => require('../test/moduleMocks').toastModule);
jest.mock('@/lib/api', () => require('../test/moduleMocks').apiModule);
jest.mock('@/components/ui/dialog', () => require('../test/moduleMocks').dialogModule);
jest.mock('@/components/ui/select', () => require('../test/moduleMocks').selectModule);
jest.mock('@/components/ui/checkbox', () => require('../test/moduleMocks').checkboxModule);

function createTransactions() {
  return [
    { date: '2026-04-05', amount: 500, description: 'Lunch', category: 'Food & Dining', type: 'expense' },
    { date: '2026-04-06', amount: 2000, description: 'Refund', category: 'Income', type: 'income' },
  ];
}

async function advanceProcessingTimers() {
  await act(async () => {
    jest.advanceTimersByTime(500);
    await Promise.resolve();
  });
  await act(async () => {
    jest.advanceTimersByTime(500);
    await Promise.resolve();
  });
  await act(async () => {
    jest.advanceTimersByTime(500);
    await Promise.resolve();
  });
}

describe('UploadStatementModal regressions', () => {
  it('imports only the non-excluded transactions after upload preview', async () => {
    jest.useFakeTimers();
    apiMock.uploadStatement.mockResolvedValue({
      data: {
        transactions: createTransactions(),
        used_ai: false,
      },
    });
    apiMock.applyPayeeMappings.mockResolvedValue({
      data: {
        transactions: createTransactions(),
        applied_count: 0,
      },
    });
    apiMock.createBulkExpenses.mockResolvedValue({
      data: {
        created: 1,
        skipped_duplicates: 0,
        learned_mappings: 0,
      },
    });
    const onSuccess = jest.fn();
    const onOpenChange = jest.fn();

    const { container } = await renderComponent(
      <UploadStatementModal
        open
        onOpenChange={onOpenChange}
        categories={[{ name: 'Food & Dining' }, { name: 'Income' }]}
        onSuccess={onSuccess}
      />
    );

    await changeFileInput(
      container.querySelector('input[type="file"]'),
      new File(['date,amount'], 'statement.csv', { type: 'text/csv' })
    );
    await advanceProcessingTimers();
    await flushPromises(6);

    expect(container.textContent).toContain('Found 2 transactions');
    expect(container.textContent).toContain('Import 1 Expense');

    await click(Array.from(container.querySelectorAll('button')).find((button) => button.textContent.includes('Import 1 Expense')));
    await flushPromises(3);

    expect(apiMock.createBulkExpenses).toHaveBeenCalledWith([
      { amount: 500, category: 'Food & Dining', description: 'Lunch', date: '2026-04-05', type: 'expense' },
    ]);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(toastMock.success).toHaveBeenCalledWith('Imported 1 transactions');
  });

  it('shows the AI fallback step when local PDF parsing fails', async () => {
    jest.useFakeTimers();
    apiMock.uploadStatement.mockRejectedValue({
      response: {
        data: {
          detail: 'Could not extract transactions from PDF using local parsing. The PDF format may not be supported. Try enabling AI extraction for better results.',
        },
      },
    });

    const { container } = await renderComponent(
      <UploadStatementModal
        open
        onOpenChange={jest.fn()}
        categories={[{ name: 'Food & Dining' }]}
        onSuccess={jest.fn()}
      />
    );

    await changeFileInput(
      container.querySelector('input[type="file"]'),
      new File(['fake-pdf'], 'statement.pdf', { type: 'application/pdf' })
    );
    await advanceProcessingTimers();
    await flushPromises(6);

    expect(container.textContent).toContain("Try AI Extraction");
    expect(container.textContent).toContain("Local parsing couldn't extract transactions");
  });

  it('shows the password-required step for encrypted PDFs', async () => {
    jest.useFakeTimers();
    apiMock.uploadStatement.mockRejectedValue({
      response: {
        data: {
          detail: 'This PDF is password-protected. Please provide the password to decrypt it.',
        },
      },
    });

    const { container } = await renderComponent(
      <UploadStatementModal
        open
        onOpenChange={jest.fn()}
        categories={[{ name: 'Food & Dining' }]}
        onSuccess={jest.fn()}
      />
    );

    await changeFileInput(
      container.querySelector('input[type="file"]'),
      new File(['fake-pdf'], 'statement.pdf', { type: 'application/pdf' })
    );
    await advanceProcessingTimers();
    await flushPromises(6);

    expect(container.textContent).toContain('Password Protected PDF');
    expect(container.querySelector('#pdf-password')).not.toBeNull();
  });
});
