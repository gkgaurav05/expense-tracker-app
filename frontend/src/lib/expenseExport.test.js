import { buildExpenseExportParams } from './expenseExport';

describe('buildExpenseExportParams', () => {
  it('includes the selected month range', () => {
    expect(buildExpenseExportParams('2026-04', 'all')).toEqual({
      start_date: '2026-04-01',
      end_date: '2026-04-31',
    });
  });

  it('includes the selected category when filtered', () => {
    expect(buildExpenseExportParams('2026-04', 'Food & Dining')).toEqual({
      start_date: '2026-04-01',
      end_date: '2026-04-31',
      category: 'Food & Dining',
    });
  });
});
