export function buildMonthDateRange(monthStr) {
  const [year, month] = monthStr.split('-').map(Number);
  const lastDayOfMonth = new Date(year, month, 0).getDate();

  return {
    start_date: `${monthStr}-01`,
    end_date: `${monthStr}-${String(lastDayOfMonth).padStart(2, '0')}`,
  };
}

export function buildExpenseExportParams(monthStr, filter) {
  const params = buildMonthDateRange(monthStr);

  if (filter && filter !== 'all') {
    params.category = filter;
  }

  return params;
}
