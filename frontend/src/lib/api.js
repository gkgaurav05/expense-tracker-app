import axios from 'axios';

import { getApiBaseUrl } from '@/lib/apiBase';

const API = getApiBaseUrl();

const instance = axios.create({
  baseURL: API,
});

// Add token to requests
let authToken = localStorage.getItem('token');

instance.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

export const api = {
  // Auth
  setToken: (token) => {
    authToken = token;
  },
  login: (formData) => instance.post('/auth/login', formData, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  }),
  register: (data) => instance.post('/auth/register', data),
  getMe: () => instance.get('/auth/me'),
  forgotPassword: (email) => instance.post('/auth/forgot-password', { email }),
  resetPassword: (token, new_password) => instance.post('/auth/reset-password', { token, new_password }),

  // Dashboard & Analytics
  getDashboardSummary: (params) => instance.get('/dashboard/summary', { params }),
  getAlerts: (params) => instance.get('/alerts', { params }),
  getMonthlyReport: (month) => instance.get('/report/monthly', { params: { month } }),
  exportCSV: (params) => instance.get('/export/csv', { params, responseType: 'blob' }),

  // Expenses
  getExpenses: (params) => instance.get('/expenses', { params }),
  createExpense: (data) => instance.post('/expenses', data),
  updateExpense: (id, data) => instance.put(`/expenses/${id}`, data),
  deleteExpense: (id) => instance.delete(`/expenses/${id}`),
  uploadStatement: (file, useAI = false, password = null) => {
    const formData = new FormData();
    formData.append('file', file);
    let url = `/expenses/upload?use_ai=${useAI}`;
    if (password) {
      url += `&password=${encodeURIComponent(password)}`;
    }
    return instance.post(url, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  createBulkExpenses: (expenses) => instance.post('/expenses/bulk', expenses),
  categorizeTransactions: (transactions) => instance.post('/expenses/categorize', transactions),
  getPayeeMappings: () => instance.get('/expenses/payee-mappings'),
  applyPayeeMappings: (transactions) => instance.post('/expenses/apply-mappings', transactions),

  // Categories
  getCategories: () => instance.get('/categories'),
  createCategory: (data) => instance.post('/categories', data),
  deleteCategory: (id) => instance.delete(`/categories/${id}`),

  // Budgets
  getBudgets: (params) => instance.get('/budgets', { params }),
  createOrUpdateBudget: (data) => instance.post('/budgets', data),
  deleteBudget: (id) => instance.delete(`/budgets/${id}`),

  // AI Insights
  getInsights: (params) => instance.post('/insights', null, { params }),

  // Savings
  getSavings: (params) => instance.get('/savings', { params }),

  // Admin
  getAdminStats: () => instance.get('/admin/stats'),
  getAdminActivity: () => instance.get('/admin/activity'),

  // Split groups (Splitwise-style shared expenses)
  listSplitGroups: () => instance.get('/split/groups'),
  createSplitGroup: (data) => instance.post('/split/groups', data),
  getSplitGroup: (groupId) => instance.get(`/split/groups/${groupId}`),
  updateSplitGroup: (groupId, data) => instance.patch(`/split/groups/${groupId}`, data),
  deleteSplitGroup: (groupId) => instance.delete(`/split/groups/${groupId}`),
  addSplitGroupMember: (groupId, email) => instance.post(`/split/groups/${groupId}/members`, { email }),
  removeSplitGroupMember: (groupId, userId) => instance.delete(`/split/groups/${groupId}/members/${userId}`),
  listSplitExpenses: (groupId) => instance.get(`/split/groups/${groupId}/expenses`),
  createSplitExpense: (groupId, data) => instance.post(`/split/groups/${groupId}/expenses`, data),
  deleteSplitExpense: (groupId, expenseId) => instance.delete(`/split/groups/${groupId}/expenses/${expenseId}`),
  getSplitBalances: (groupId) => instance.get(`/split/groups/${groupId}/balances`),
  getSettlementSuggestions: (groupId) => instance.get(`/split/groups/${groupId}/settlement-suggestions`),
  listSplitSettlements: (groupId) => instance.get(`/split/groups/${groupId}/settlements`),
  createSplitSettlement: (groupId, data) => instance.post(`/split/groups/${groupId}/settlements`, data),
  deleteSplitSettlement: (groupId, settlementId) => instance.delete(`/split/groups/${groupId}/settlements/${settlementId}`),
};

export const formatINR = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value || 0);
