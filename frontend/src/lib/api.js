import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const api = {
  getDashboardSummary: () => axios.get(`${API}/dashboard/summary`),
  getExpenses: (params) => axios.get(`${API}/expenses`, { params }),
  createExpense: (data) => axios.post(`${API}/expenses`, data),
  updateExpense: (id, data) => axios.put(`${API}/expenses/${id}`, data),
  deleteExpense: (id) => axios.delete(`${API}/expenses/${id}`),
  getCategories: () => axios.get(`${API}/categories`),
  createCategory: (data) => axios.post(`${API}/categories`, data),
  deleteCategory: (id) => axios.delete(`${API}/categories/${id}`),
  getBudgets: () => axios.get(`${API}/budgets`),
  createOrUpdateBudget: (data) => axios.post(`${API}/budgets`, data),
  deleteBudget: (id) => axios.delete(`${API}/budgets/${id}`),
  getInsights: () => axios.post(`${API}/insights`),
};

export const formatINR = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value || 0);
