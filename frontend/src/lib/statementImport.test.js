import {
  buildImportExpenses,
  getAutoExcludedIndices,
  splitTransactionsByType,
  sumIncludedAmounts,
} from './statementImport';

describe('statement import helpers', () => {
  it('auto-excludes income, reversal, and duplicate transactions', () => {
    const excluded = getAutoExcludedIndices([
      { type: 'expense' },
      { type: 'income' },
      { type: 'expense', is_reversal: true },
      { type: 'expense', is_duplicate: true },
    ]);

    expect(Array.from(excluded)).toEqual([1, 2, 3]);
  });

  it('splits transactions by type while preserving original indices', () => {
    const { expenseTransactions, incomeTransactions } = splitTransactionsByType([
      { type: 'expense', amount: 100 },
      { type: 'income', amount: 500 },
      { amount: 200 },
    ]);

    expect(expenseTransactions.map((transaction) => transaction.originalIdx)).toEqual([0, 2]);
    expect(incomeTransactions.map((transaction) => transaction.originalIdx)).toEqual([1]);
  });

  it('builds the import payload from only included transactions', () => {
    const payload = buildImportExpenses(
      [
        { amount: 100, category: 'Food', description: 'Lunch', date: '2026-04-01', type: 'expense' },
        { amount: 500, category: 'Income', description: 'Refund', date: '2026-04-02', type: 'income' },
      ],
      new Set([1])
    );

    expect(payload).toEqual([
      { amount: 100, category: 'Food', description: 'Lunch', date: '2026-04-01', type: 'expense' },
    ]);
  });

  it('sums only included amounts from a transaction section', () => {
    const total = sumIncludedAmounts(
      [
        { originalIdx: 0, amount: 100 },
        { originalIdx: 1, amount: 200 },
      ],
      new Set([1])
    );

    expect(total).toBe(100);
  });
});
