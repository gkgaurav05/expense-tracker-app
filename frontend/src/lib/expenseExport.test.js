import { buildExpenseExportParams } from './expenseExport';

describe('buildExpenseExportParams', () => {
  it('uses the actual last day for 30-day months', () => {
    expect(buildExpenseExportParams('2026-04', 'all')).toEqual({
      start_date: '2026-04-01',
      end_date: '2026-04-30',
    });
  });

  it('uses the actual last day for February', () => {
    expect(buildExpenseExportParams('2026-02', 'all')).toEqual({
      start_date: '2026-02-01',
      end_date: '2026-02-28',
    });
  });

  it('includes the selected category when filtered', () => {
    expect(buildExpenseExportParams('2026-04', 'Food & Dining')).toEqual({
      start_date: '2026-04-01',
      end_date: '2026-04-30',
      category: 'Food & Dining',
    });
  });
});
