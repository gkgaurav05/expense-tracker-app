import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Wallet, PiggyBank, Receipt, ArrowRight, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, formatINR } from '@/lib/api';
import { DailySpendingChart, CategoryPieChart } from '@/components/SpendingCharts';
import BudgetAlerts from '@/components/BudgetAlerts';
import { format, addMonths, subMonths } from 'date-fns';

const spring = { type: 'spring', bounce: 0.3, duration: 0.6 };

const StatCard = ({ icon: Icon, label, value, accent, delay, testId }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ ...spring, delay }}
    className="glass-card-sm flex items-center gap-4"
    data-testid={testId}
  >
    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${accent ? 'bg-[#FDE047]/15 text-[#FDE047]' : 'bg-white/[0.06] text-[#A1A1AA]'}`}>
      <Icon size={20} strokeWidth={2.2} />
    </div>
    <div>
      <p className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA]">{label}</p>
      <p className="text-xl font-bold tracking-tight font-['General_Sans']">{value}</p>
    </div>
  </motion.div>
);

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const navigate = useNavigate();

  const monthStr = format(currentDate, 'yyyy-MM');
  const monthLabel = format(currentDate, 'MMMM yyyy');
  const isCurrentMonth = monthStr === format(new Date(), 'yyyy-MM');

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const params = isCurrentMonth ? {} : { month: monthStr };
      const { data } = await api.getDashboardSummary(params);
      setSummary(data);
    } catch (e) {
      console.error('Failed to fetch summary', e);
    } finally {
      setLoading(false);
    }
  }, [monthStr, isCurrentMonth]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 rounded-full border-2 border-[#FDE047] border-t-transparent animate-spin" />
      </div>
    );
  }

  const s = summary || {};

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      {/* Month Navigator */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
      >
        <div className="flex items-center gap-4 mb-4">
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
        <h1 data-testid="total-spent-display" className="text-5xl sm:text-6xl font-black tracking-tighter font-['General_Sans'] text-white">
          {formatINR(s.total_month)}
        </h1>
        <p className="text-[#A1A1AA] mt-1 text-sm">
          {s.expense_count || 0} expenses recorded
        </p>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {isCurrentMonth ? (
          <StatCard icon={TrendingUp} label="This Week" value={formatINR(s.total_week)} delay={0.1} testId="weekly-spent-card" accent />
        ) : (
          <StatCard icon={TrendingUp} label="Avg / Day" value={formatINR(s.expense_count > 0 ? Math.round(s.total_month / Math.max(1, new Set(s.recent_expenses?.map(e => e.date)).size || 1)) : 0)} delay={0.1} testId="avg-daily-card" accent />
        )}
        <StatCard icon={PiggyBank} label="Budget Left" value={formatINR(s.budget_remaining)} delay={0.15} testId="budget-remaining-card" />
        <StatCard icon={Wallet} label="Total Budget" value={formatINR(s.total_budget)} delay={0.2} testId="total-budget-card" />
      </div>

      {/* Budget Alerts */}
      <BudgetAlerts month={monthStr} />

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Daily Spending */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.25 }}
          className="glass-card md:col-span-7"
        >
          <p className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA] mb-6">Daily Spending</p>
          {s.daily_spending?.some((d) => d.amount > 0) ? (
            <DailySpendingChart data={s.daily_spending} />
          ) : (
            <p className="text-[#A1A1AA] text-sm py-12 text-center">No spending data this week</p>
          )}
        </motion.div>

        {/* Category Breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.3 }}
          className="glass-card md:col-span-5"
        >
          <p className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA] mb-6">By Category</p>
          {s.category_breakdown?.length > 0 ? (
            <CategoryPieChart data={s.category_breakdown} />
          ) : (
            <p className="text-[#A1A1AA] text-sm py-12 text-center">No expenses yet</p>
          )}
        </motion.div>
      </div>

      {/* Recent Expenses */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.35 }}
        className="glass-card"
      >
        <div className="flex items-center justify-between mb-6">
          <p className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA]">Recent Expenses</p>
          <button
            data-testid="view-all-expenses-btn"
            onClick={() => navigate('/expenses')}
            className="text-xs text-[#FDE047] font-semibold flex items-center gap-1 hover:underline"
          >
            View All <ArrowRight size={14} />
          </button>
        </div>
        {s.recent_expenses?.length > 0 ? (
          <div className="space-y-3">
            {s.recent_expenses.map((exp) => (
              <div key={exp.id} data-testid={`recent-expense-${exp.id}`} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex flex-col items-center justify-center leading-none">
                    <span className="text-xs font-bold text-white">{exp.date?.slice(8)}</span>
                    <span className="text-[10px] text-[#A1A1AA] uppercase">{new Date(exp.date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short' })}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{exp.category}</p>
                    <p className="text-xs text-[#A1A1AA]">{exp.description || '-'}</p>
                  </div>
                </div>
                <p className="text-sm font-bold text-white">{formatINR(exp.amount)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[#A1A1AA] text-sm py-8 text-center">
            No expenses yet. Start tracking your spending!
          </p>
        )}
      </motion.div>
    </div>
  );
}
