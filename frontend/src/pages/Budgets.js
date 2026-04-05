import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { PiggyBank, Save, Trash2, ChevronLeft, ChevronRight, CalendarDays, Target, Wallet, TrendingUp, Clock } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { api, formatINR } from '@/lib/api';
import { toast } from 'sonner';
import { format, addMonths, subMonths, getDaysInMonth, getDate } from 'date-fns';

const spring = { type: 'spring', bounce: 0.3, duration: 0.6 };

export default function Budgets() {
  const [categories, setCategories] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [spending, setSpending] = useState({});
  const [budgetInputs, setBudgetInputs] = useState({});
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());

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
  const usedPercentage = totalBudget > 0 ? Math.min(100, (totalSpent / totalBudget) * 100) : 0;

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
        <p className="text-sm text-[#A1A1AA] mt-1">Set monthly spending limits per category</p>
      </motion.div>

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
            <div className="flex justify-between text-xs text-[#A1A1AA]">
              <span>{Math.round(usedPercentage)}% used</span>
              <span>{Math.round(100 - usedPercentage)}% available</span>
            </div>
            <div className="h-3 bg-white/[0.06] rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${usedPercentage}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="h-full rounded-full"
                style={{
                  background: usedPercentage > 100
                    ? '#f87171'
                    : usedPercentage > 80
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
          const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
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
                    <span className="text-[#A1A1AA]">Spent: {formatINR(spent)}</span>
                    <span className={isOver ? 'text-red-400 font-semibold' : 'text-[#A1A1AA]'}>
                      {isOver ? 'Over budget!' : `${formatINR(limit - spent)} left`}
                    </span>
                  </div>
                  <Progress
                    value={pct}
                    className="h-2 bg-white/[0.06] rounded-full"
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
    </div>
  );
}
