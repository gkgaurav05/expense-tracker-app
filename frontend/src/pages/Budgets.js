import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { PiggyBank, Save, Trash2, ChevronLeft, ChevronRight, CalendarDays, Target, Wallet, TrendingUp, TrendingDown, Clock, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, formatINR } from '@/lib/api';
import { toast } from 'sonner';
import { format, addMonths, subMonths, getDaysInMonth, getDate } from 'date-fns';

const spring = { type: 'spring', bounce: 0.3, duration: 0.6 };

export default function Budgets() {
  const [activeTab, setActiveTab] = useState('current'); // 'current' or 'performance'
  const [categories, setCategories] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [spending, setSpending] = useState({});
  const [budgetInputs, setBudgetInputs] = useState({});
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());

  // Performance tab state
  const [performanceData, setPerformanceData] = useState(null);
  const [performanceMonths, setPerformanceMonths] = useState(6);
  const [performanceLoading, setPerformanceLoading] = useState(false);

  const monthStr = format(currentDate, 'yyyy-MM');
  const monthLabel = format(currentDate, 'MMMM yyyy');
  const isCurrentMonth = monthStr === format(new Date(), 'yyyy-MM');

  // Calculate days info for current month
  const today = new Date();
  const daysInMonth = getDaysInMonth(currentDate);
  const dayOfMonth = isCurrentMonth ? getDate(today) : daysInMonth;
  const daysRemaining = isCurrentMonth ? daysInMonth - dayOfMonth : 0;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, budRes, expRes] = await Promise.all([
        api.getCategories(),
        api.getBudgets({ month: monthStr }),
        api.getExpenses({ start_date: `${monthStr}-01`, end_date: `${monthStr}-31` }),
      ]);
      setCategories(catRes.data);
      setBudgets(budRes.data);

      const spendMap = {};
      (expRes.data || []).forEach((e) => {
        spendMap[e.category] = (spendMap[e.category] || 0) + e.amount;
      });
      setSpending(spendMap);

      const inputs = {};
      budRes.data.forEach((b) => { inputs[b.category] = String(b.amount); });
      setBudgetInputs(inputs);
    } catch (e) {
      console.error('Fetch error', e);
    } finally {
      setLoading(false);
    }
  }, [monthStr]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Fetch performance/savings data
  const fetchPerformanceData = useCallback(async () => {
    setPerformanceLoading(true);
    try {
      const { data } = await api.getSavings({ months: performanceMonths });
      setPerformanceData(data);
    } catch (e) {
      console.error('Failed to fetch performance data', e);
    } finally {
      setPerformanceLoading(false);
    }
  }, [performanceMonths]);

  useEffect(() => {
    if (activeTab === 'performance') {
      fetchPerformanceData();
    }
  }, [activeTab, fetchPerformanceData]);

  const handleSave = async (categoryName) => {
    const val = parseFloat(budgetInputs[categoryName]);
    if (!val || val <= 0) {
      toast.error('Enter a valid budget amount');
      return;
    }
    try {
      await api.createOrUpdateBudget({ category: categoryName, amount: val, month: monthStr });
      toast.success(`Budget set for ${categoryName}`);
      fetchData();
    } catch {
      toast.error('Failed to save budget');
    }
  };

  const handleDelete = async (budgetId, categoryName) => {
    try {
      await api.deleteBudget(budgetId);
      setBudgetInputs((prev) => { const n = { ...prev }; delete n[categoryName]; return n; });
      toast.success('Budget removed');
      fetchData();
    } catch {
      toast.error('Failed to remove budget');
    }
  };

  // Calculate totals
  const totalBudget = budgets.reduce((sum, b) => sum + b.amount, 0);
  const totalSpent = Object.values(spending).reduce((sum, v) => sum + v, 0);
  const totalRemaining = totalBudget - totalSpent;
  const actualPercentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
  const barPercentage = Math.min(100, actualPercentage); // Cap bar width at 100%
  const isOverBudget = actualPercentage > 100;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 rounded-full border-2 border-[#FDE047] border-t-transparent animate-spin" />
      </div>
    );
  }

  const budgetMap = {};
  budgets.forEach((b) => { budgetMap[b.category] = b; });

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight font-['General_Sans']">Budgets</h1>
        <p className="text-sm text-[#A1A1AA] mt-1">
          {activeTab === 'current' ? 'Set monthly spending limits per category' : 'Track your budget performance over time'}
        </p>
      </motion.div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white/[0.05] border border-white/[0.08] rounded-full p-1 w-fit">
          <TabsTrigger value="current" className="rounded-full px-5 data-[state=active]:bg-[#FDE047] data-[state=active]:text-[#0A0A0A] text-[#A1A1AA] font-semibold text-sm">This Month</TabsTrigger>
          <TabsTrigger value="performance" className="rounded-full px-5 data-[state=active]:bg-[#FDE047] data-[state=active]:text-[#0A0A0A] text-[#A1A1AA] font-semibold text-sm">Performance</TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === 'current' && (
        <>
          {/* Month Navigator */}
          <div className="flex items-center gap-4">
            <button onClick={() => setCurrentDate((d) => subMonths(d, 1))} className="w-10 h-10 rounded-full bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-[#A1A1AA] hover:bg-white/[0.1] transition-all">
              <ChevronLeft size={18} />
            </button>
            <span className="text-lg font-semibold font-['General_Sans'] flex items-center gap-2">
              <CalendarDays size={16} className="text-[#FDE047]" /> {monthLabel}
            </span>
            <button onClick={() => setCurrentDate((d) => addMonths(d, 1))} className="w-10 h-10 rounded-full bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-[#A1A1AA] hover:bg-white/[0.1] transition-all">
              <ChevronRight size={18} />
            </button>
            {!isCurrentMonth && (
              <button onClick={() => setCurrentDate(new Date())} className="text-xs text-[#FDE047] font-semibold hover:underline ml-2">
                Back to Current Month
              </button>
            )}
          </div>

      {/* Month Summary Card */}
      {totalBudget > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.1 }}
          className={`glass-card ${isCurrentMonth ? 'border-[#FDE047]/30' : totalRemaining >= 0 ? 'border-green-500/30' : 'border-red-500/30'}`}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CalendarDays size={18} className="text-[#FDE047]" />
              <span className="font-semibold text-lg">{monthLabel}</span>
              {isCurrentMonth ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#FDE047]/20 text-[#FDE047] font-semibold">Current Month</span>
              ) : (
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${totalRemaining >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                  {totalRemaining >= 0 ? 'Under Budget' : 'Over Budget'}
                </span>
              )}
            </div>
            {isCurrentMonth && (
              <div className="flex items-center gap-1.5 text-sm text-[#A1A1AA]">
                <Clock size={14} />
                <span>Day {dayOfMonth} of {daysInMonth}</span>
                <span className="text-[#FDE047] font-medium">• {daysRemaining} days left</span>
              </div>
            )}
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center p-3 rounded-xl bg-white/[0.03]">
              <div className="flex items-center justify-center gap-1.5 text-[#A1A1AA] text-xs mb-1">
                <Target size={12} />
                <span>Budget</span>
              </div>
              <p className="font-bold text-lg font-['General_Sans']">{formatINR(totalBudget)}</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-white/[0.03]">
              <div className="flex items-center justify-center gap-1.5 text-[#A1A1AA] text-xs mb-1">
                <Wallet size={12} />
                <span>Spent</span>
              </div>
              <p className="font-bold text-lg font-['General_Sans']">{formatINR(totalSpent)}</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-white/[0.03]">
              <div className="flex items-center justify-center gap-1.5 text-[#A1A1AA] text-xs mb-1">
                <TrendingUp size={12} />
                <span>{isCurrentMonth ? 'Remaining' : totalRemaining >= 0 ? 'Saved' : 'Overspent'}</span>
              </div>
              <p className={`font-bold text-lg font-['General_Sans'] ${totalRemaining >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {totalRemaining >= 0 ? '' : '-'}{formatINR(Math.abs(totalRemaining))}
              </p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className={isOverBudget ? 'text-red-400 font-semibold' : 'text-[#A1A1AA]'}>
                {Math.round(actualPercentage)}% used
              </span>
              {isOverBudget ? (
                <span className="text-red-400 font-semibold">Overspent by {formatINR(Math.abs(totalRemaining))}</span>
              ) : (
                <span className="text-[#A1A1AA]">{Math.round(100 - actualPercentage)}% available</span>
              )}
            </div>
            <div className="h-3 bg-white/[0.06] rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${barPercentage}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="h-full rounded-full"
                style={{
                  background: isOverBudget
                    ? '#f87171'
                    : actualPercentage > 80
                      ? '#fbbf24'
                      : '#4ade80'
                }}
              />
            </div>
          </div>
        </motion.div>
      )}

      {/* No Budget Set Message */}
      {totalBudget === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.1 }}
          className="glass-card text-center py-6"
        >
          <PiggyBank size={32} className="mx-auto text-[#A1A1AA]/50 mb-2" />
          <p className="text-[#A1A1AA] text-sm">No budgets set for {monthLabel}</p>
          <p className="text-[#A1A1AA]/70 text-xs mt-1">Set budgets below to start tracking</p>
        </motion.div>
      )}

      {/* Category Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {categories.map((cat, i) => {
          const budget = budgetMap[cat.name];
          const spent = spending[cat.name] || 0;
          const limit = budget?.amount || 0;
          const actualPct = limit > 0 ? (spent / limit) * 100 : 0;
          const barPct = Math.min(100, actualPct); // Cap bar width at 100%
          const isOver = spent > limit && limit > 0;

          return (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.15 + i * 0.05 }}
              className="glass-card-sm space-y-4"
              data-testid={`budget-card-${cat.name}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${cat.color}20` }}>
                    <span className="w-3 h-3 rounded-full" style={{ background: cat.color }} />
                  </div>
                  <span className="font-semibold text-sm">{cat.name}</span>
                </div>
                {budget && (
                  <button
                    data-testid={`delete-budget-${cat.name}`}
                    onClick={() => handleDelete(budget.id, cat.name)}
                    className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              {limit > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className={isOver ? 'text-red-400 font-semibold' : 'text-[#A1A1AA]'}>
                      {formatINR(spent)} ({Math.round(actualPct)}%)
                    </span>
                    <span className={isOver ? 'text-red-400 font-semibold' : 'text-[#A1A1AA]'}>
                      {isOver ? `Overspent by ${formatINR(spent - limit)}` : `${formatINR(limit - spent)} left`}
                    </span>
                  </div>
                  <Progress
                    value={barPct}
                    className={`h-2 rounded-full ${isOver ? '[&>div]:bg-red-500' : actualPct > 80 ? '[&>div]:bg-amber-400' : '[&>div]:bg-green-400'}`}
                    data-testid={`budget-progress-${cat.name}`}
                  />
                </div>
              )}

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A1A1AA] text-xs font-medium">Rs.</span>
                  <input
                    data-testid={`budget-amount-input-${cat.name}`}
                    type="number"
                    min="0"
                    step="100"
                    value={budgetInputs[cat.name] || ''}
                    onChange={(e) => setBudgetInputs((p) => ({ ...p, [cat.name]: e.target.value }))}
                    placeholder="Set budget"
                    className="w-full rounded-full bg-white/[0.05] border border-white/[0.1] pl-12 pr-4 h-10 text-white text-sm outline-none focus:ring-2 focus:ring-[#FDE047] focus:border-transparent transition-all placeholder:text-[#A1A1AA]/50"
                  />
                </div>
                <button
                  data-testid={`save-budget-btn-${cat.name}`}
                  onClick={() => handleSave(cat.name)}
                  className="rounded-full bg-[#FDE047] text-[#0A0A0A] font-bold w-10 h-10 flex items-center justify-center hover:bg-[#FDE047]/90 transition-all hover:scale-105 active:scale-95"
                >
                  <Save size={16} />
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {categories.length === 0 && (
        <div className="glass-card text-center py-16">
          <PiggyBank size={40} className="mx-auto text-[#A1A1AA] mb-4" />
          <p className="text-[#A1A1AA]">No categories found</p>
        </div>
      )}
        </>
      )}

      {/* Performance Tab */}
      {activeTab === 'performance' && (
        <>
          {/* Period Selector */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-[#A1A1AA]">Analyze last</span>
            <div className="flex gap-2">
              {[3, 6, 12].map((m) => (
                <button
                  key={m}
                  onClick={() => setPerformanceMonths(m)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                    performanceMonths === m
                      ? 'bg-[#FDE047] text-[#0A0A0A]'
                      : 'bg-white/[0.05] border border-white/[0.08] text-[#A1A1AA] hover:bg-white/[0.1]'
                  }`}
                >
                  {m} months
                </button>
              ))}
            </div>
          </div>

          {performanceLoading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 rounded-full border-2 border-[#FDE047] border-t-transparent animate-spin" />
            </div>
          ) : performanceData ? (
            <div className="space-y-6">
              {/* Overview Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Total Budget', value: formatINR(performanceData.total_budget), icon: Target, color: 'text-[#FDE047]' },
                  { label: 'Total Spent', value: formatINR(performanceData.total_spent), icon: Wallet, color: 'text-[#FDE047]' },
                  {
                    label: 'Total Saved',
                    value: formatINR(Math.abs(performanceData.total_saved)),
                    prefix: performanceData.total_saved >= 0 ? '+' : '-',
                    icon: performanceData.total_saved >= 0 ? ArrowUpRight : ArrowDownRight,
                    color: performanceData.total_saved >= 0 ? 'text-green-400' : 'text-red-400'
                  },
                  {
                    label: 'Savings Rate',
                    value: `${Math.abs(performanceData.savings_rate)}%`,
                    prefix: performanceData.savings_rate >= 0 ? '' : '-',
                    icon: performanceData.savings_rate >= 0 ? TrendingUp : TrendingDown,
                    color: performanceData.savings_rate >= 0 ? 'text-green-400' : 'text-red-400'
                  },
                ].map((stat, i) => (
                  <motion.div key={stat.label} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: i * 0.05 }} className="glass-card-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <stat.icon size={14} className={stat.color} />
                      <span className="text-xs uppercase tracking-[0.15em] font-semibold text-[#A1A1AA]">{stat.label}</span>
                    </div>
                    <p className={`font-bold font-['General_Sans'] text-xl ${stat.color}`}>
                      {stat.prefix || ''}{stat.value}
                    </p>
                  </motion.div>
                ))}
              </div>

              {/* Period Info */}
              <p className="text-sm text-[#A1A1AA]">
                Analyzing: <span className="text-white font-medium">{performanceData.period}</span> ({performanceData.months_analyzed} months)
              </p>

              {/* Monthly Breakdown & Category Summary */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Monthly Breakdown */}
                <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.2 }} className="glass-card">
                  <p className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA] mb-4">Monthly Performance</p>
                  <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                    {performanceData.monthly_breakdown?.map((m, idx) => (
                      <motion.div
                        key={m.month}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 + idx * 0.05 }}
                        className="border-b border-white/[0.06] pb-4 last:border-0 last:pb-0"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-white">{m.month}</span>
                          <span className={`font-bold text-lg ${m.total_saved >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {m.total_saved >= 0 ? '+' : ''}{formatINR(m.total_saved)}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-[#A1A1AA] mb-2">
                          <span>Budget: {formatINR(m.total_budget)}</span>
                          <span>•</span>
                          <span>Spent: {formatINR(m.total_spent)}</span>
                        </div>
                        <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min((m.total_spent / m.total_budget) * 100, 100)}%`,
                              background: m.total_saved >= 0 ? '#4ade80' : '#f87171'
                            }}
                          />
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {m.categories?.slice(0, 3).map((c) => (
                            <span
                              key={c.category}
                              className={`text-xs px-2 py-0.5 rounded-full ${c.saved >= 0 ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}
                            >
                              {c.category.split(' ')[0]}: {c.saved >= 0 ? '+' : ''}{formatINR(c.saved)}
                            </span>
                          ))}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>

                {/* Category Summary */}
                <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.25 }} className="glass-card">
                  <p className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA] mb-4">Category Savings ({performanceData.months_analyzed} months)</p>
                  <div className="space-y-4">
                    {performanceData.category_summary?.map((c, idx) => (
                      <motion.div
                        key={c.category}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 + idx * 0.05 }}
                      >
                        <div className="flex justify-between text-sm mb-1">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
                            <span className="text-white font-medium">{c.category}</span>
                          </div>
                          <span className={`font-bold ${c.saved >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {c.saved >= 0 ? '+' : ''}{formatINR(c.saved)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-[#A1A1AA] mb-1.5">
                          <span>Budget: {formatINR(c.budget)}</span>
                          <span>•</span>
                          <span>Spent: {formatINR(c.spent)}</span>
                          <span>•</span>
                          <span>{Math.round((c.spent / c.budget) * 100)}% used</span>
                        </div>
                        <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min((c.spent / c.budget) * 100, 100)}%`,
                              background: c.saved >= 0 ? c.color : '#f87171'
                            }}
                          />
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              </div>

              {/* Motivational Card */}
              {performanceData.total_saved > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ ...spring, delay: 0.4 }}
                  className="glass-card bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-green-500/20"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                      <PiggyBank size={24} className="text-green-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-green-400">Great job! You're under budget.</p>
                      <p className="text-sm text-[#A1A1AA]">
                        You've saved {formatINR(performanceData.total_saved)} over the last {performanceData.months_analyzed} months.
                        That's a {performanceData.savings_rate}% savings rate!
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {performanceData.total_saved < 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ ...spring, delay: 0.4 }}
                  className="glass-card bg-gradient-to-r from-red-500/10 to-orange-500/10 border-red-500/20"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                      <TrendingDown size={24} className="text-red-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-red-400">You're over budget</p>
                      <p className="text-sm text-[#A1A1AA]">
                        You've overspent by {formatINR(Math.abs(performanceData.total_saved))} over the last {performanceData.months_analyzed} months.
                        Check which categories need attention.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          ) : (
            <div className="glass-card text-center py-16">
              <PiggyBank size={48} className="mx-auto text-[#A1A1AA]/40 mb-4" />
              <p className="text-[#A1A1AA]">No savings data available. Add budgets and expenses to start tracking.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
