export function buildExpenseExportParams(monthStr, filter) {
  const params = {
    start_date: `${monthStr}-01`,
    end_date: `${monthStr}-31`,
  };

  if (filter && filter !== 'all') {
    params.category = filter;
  }

  return params;
}
