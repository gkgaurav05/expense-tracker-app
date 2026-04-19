import { endOfWeek, startOfWeek } from 'date-fns';

export function getDashboardWeekRange(summary, referenceDate = new Date()) {
  if (summary?.week_start && summary?.week_end) {
    return {
      weekStart: new Date(`${summary.week_start}T00:00:00`),
      weekEnd: new Date(`${summary.week_end}T00:00:00`),
    };
  }

  return {
    weekStart: startOfWeek(referenceDate, { weekStartsOn: 1 }),
    weekEnd: endOfWeek(referenceDate, { weekStartsOn: 1 }),
  };
}
