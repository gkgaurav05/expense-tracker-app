import { format } from 'date-fns';

import { getDashboardWeekRange } from './dashboardPeriod';

describe('getDashboardWeekRange', () => {
  it('prefers backend supplied week boundaries', () => {
    const { weekStart, weekEnd } = getDashboardWeekRange({
      week_start: '2026-04-13',
      week_end: '2026-04-19',
    });

    expect(format(weekStart, 'yyyy-MM-dd')).toBe('2026-04-13');
    expect(format(weekEnd, 'yyyy-MM-dd')).toBe('2026-04-19');
  });

  it('falls back to the local current week when no backend range is present', () => {
    const { weekStart, weekEnd } = getDashboardWeekRange(null, new Date('2026-04-16T12:00:00'));

    expect(format(weekStart, 'yyyy-MM-dd')).toBe('2026-04-13');
    expect(format(weekEnd, 'yyyy-MM-dd')).toBe('2026-04-19');
  });
});
