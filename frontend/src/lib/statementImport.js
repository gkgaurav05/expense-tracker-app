export function getAutoExcludedIndices(transactions) {
  const excludedIndices = new Set();

  transactions.forEach((transaction, index) => {
    if (transaction.type === 'income' || transaction.is_reversal || transaction.is_duplicate) {
      excludedIndices.add(index);
    }
  });

  return excludedIndices;
}

export function splitTransactionsByType(transactions) {
  const withIndices = transactions.map((transaction, originalIdx) => ({ ...transaction, originalIdx }));

  return {
    expenseTransactions: withIndices.filter((transaction) => transaction.type !== 'income'),
    incomeTransactions: withIndices.filter((transaction) => transaction.type === 'income'),
  };
}

export function buildImportExpenses(transactions, excludedIndices) {
  return transactions
    .filter((_, index) => !excludedIndices.has(index))
    .map((transaction) => ({
      amount: transaction.amount,
      category: transaction.category,
      description: transaction.description,
      date: transaction.date,
      type: transaction.type || 'expense',
    }));
}

export function sumIncludedAmounts(transactions, excludedIndices) {
  return transactions
    .filter((transaction) => !excludedIndices.has(transaction.originalIdx))
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}
