import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, Wallet, PiggyBank, ArrowRight, ChevronLeft, ChevronRight, CalendarDays, Hash, Download, Share2, Sparkles, ChevronDown, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, formatINR } from '@/lib/api';
import { DailySpendingChart, CategoryPieChart } from '@/components/SpendingCharts';
import BudgetAlerts from '@/components/BudgetAlerts';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { format, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns';

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
  const [viewMode, setViewMode] = useState('monthly'); // 'weekly' or 'monthly'
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [insights, setInsights] = useState('');
  const [insightsLoading, setInsightsLoading] = useState(false);
  const navigate = useNavigate();

  const monthStr = format(currentDate, 'yyyy-MM');
  const monthLabel = format(currentDate, 'MMMM yyyy');
  const isCurrentMonth = monthStr === format(new Date(), 'yyyy-MM');

  // Weekly date range labels
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
  const weekLabel = `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`;

  // Auto-switch to monthly view when navigating to past months
  useEffect(() => {
    if (!isCurrentMonth && viewMode === 'weekly') {
      setViewMode('monthly');
    }
  }, [isCurrentMonth, viewMode]);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const params = { view: viewMode };
      if (viewMode === 'monthly' && !isCurrentMonth) {
        params.month = monthStr;
      }
      const { data } = await api.getDashboardSummary(params);
      setSummary(data);
    } catch (e) {
      console.error('Failed to fetch summary', e);
    } finally {
      setLoading(false);
    }
  }, [monthStr, isCurrentMonth, viewMode]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  // Share functionality
  const handleShare = async () => {
    const periodLabel = viewMode === 'weekly' ? `week of ${format(weekStart, 'MMM d, yyyy')}` : monthLabel;
    const amount = viewMode === 'weekly' ? summary?.total_spent || summary?.total_week : summary?.total_month;
    const text = `My spending for ${periodLabel}: ${formatINR(amount || 0)} across ${summary?.expense_count || 0} transactions`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Spendrax - ${periodLabel}`,
          text,
          url: window.location.href
        });
      } catch (err) {
        if (err.name !== 'AbortError') {
          toast.error('Share failed');
        }
      }
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(text);
      toast.success('Summary copied to clipboard');
    }
  };

  // Download CSV functionality
  const handleDownloadCSV = async () => {
    try {
      const startDate = viewMode === 'weekly'
        ? format(weekStart, 'yyyy-MM-dd')
        : `${monthStr}-01`;
      const endDate = viewMode === 'weekly'
        ? format(weekEnd, 'yyyy-MM-dd')
        : format(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0), 'yyyy-MM-dd');

      const { data } = await api.exportCSV({ start_date: startDate, end_date: endDate });
      const url = window.URL.createObjectURL(new Blob([data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = viewMode === 'weekly'
        ? `expenses-week-${format(weekStart, 'yyyy-MM-dd')}.csv`
        : `expenses-${monthStr}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('CSV downloaded');
    } catch {
      toast.error('Download failed');
    }
  };

  // AI Insights functionality
  const handleGetInsights = async () => {
    if (insights && insightsOpen) {
      // Already have insights, just toggle
      return;
    }
    setInsightsLoading(true);
    try {
      const { data } = await api.getInsights({ month: monthStr });
      setInsights(data.insights);
    } catch {
      toast.error('Failed to generate insights');
    } finally {
      setInsightsLoading(false);
    }
  };

  const toggleInsights = () => {
    const newState = !insightsOpen;
    setInsightsOpen(newState);
    if (newState && !insights) {
      handleGetInsights();
    }
  };

  // Reset insights when month changes
  useEffect(() => {
    setInsights('');
    setInsightsOpen(false);
  }, [monthStr]);

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
      {/* View Toggle + Navigator */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
      >
        {/* Weekly/Monthly Toggle + Navigator */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          {/* Toggle only shown for current month */}
          {isCurrentMonth ? (
            <Tabs value={viewMode} onValueChange={setViewMode}>
              <TabsList className="bg-white/[0.05] border border-white/[0.08] rounded-full p-1 w-fit">
                <TabsTrigger value="weekly" data-testid="dashboard-weekly-tab" className="rounded-full px-5 data-[state=active]:bg-[#FDE047] data-[state=active]:text-[#0A0A0A] text-[#A1A1AA] font-semibold text-sm">Weekly</TabsTrigger>
                <TabsTrigger value="monthly" data-testid="dashboard-monthly-tab" className="rounded-full px-5 data-[state=active]:bg-[#FDE047] data-[state=active]:text-[#0A0A0A] text-[#A1A1AA] font-semibold text-sm">Monthly</TabsTrigger>
              </TabsList>
            </Tabs>
          ) : (
            <span className="text-xs uppercase tracking-[0.15em] font-semibold text-[#A1A1AA]">Monthly View</span>
          )}

          {/* Month Navigator (always shown for monthly, hidden for weekly) */}
          {viewMode === 'monthly' && (
            <div className="flex items-center gap-3">
              <button onClick={() => setCurrentDate((d) => subMonths(d, 1))} className="w-9 h-9 rounded-full bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-[#A1A1AA] hover:bg-white/[0.1] transition-all">
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-semibold font-['General_Sans'] flex items-center gap-2 min-w-[140px] justify-center">
                <CalendarDays size={14} className="text-[#FDE047]" /> {monthLabel}
              </span>
              <button onClick={() => setCurrentDate((d) => addMonths(d, 1))} className="w-9 h-9 rounded-full bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-[#A1A1AA] hover:bg-white/[0.1] transition-all">
                <ChevronRight size={16} />
              </button>
              {!isCurrentMonth && (
                <button onClick={() => setCurrentDate(new Date())} className="text-xs text-[#FDE047] font-semibold hover:underline">
                  Today
                </button>
              )}
            </div>
          )}
        </div>

        {/* Period Label for Weekly View */}
        {viewMode === 'weekly' && (
          <p className="text-sm text-[#A1A1AA] mb-2 flex items-center gap-2">
            <CalendarDays size={14} className="text-[#FDE047]" /> {weekLabel}
          </p>
        )}

        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 data-testid="total-spent-display" className="text-5xl sm:text-6xl font-black tracking-tighter font-['General_Sans'] text-white">
              {formatINR(viewMode === 'weekly' ? s.total_spent || s.total_week : s.total_month)}
            </h1>
            <p className="text-[#A1A1AA] mt-1 text-sm">
              {s.expense_count || 0} expenses {viewMode === 'weekly' ? 'this week' : 'this month'}
            </p>
          </div>

          {/* Share & Download Actions */}
          <TooltipProvider delayDuration={0}>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleDownloadCSV}
                    data-testid="download-csv-btn"
                    className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-[#A1A1AA] hover:bg-white/[0.1] hover:text-white transition-all"
                  >
                    <Download size={18} />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="bg-[#171717] border-white/10 text-white">
                  Download CSV
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleShare}
                    data-testid="share-btn"
                    className="w-10 h-10 rounded-xl bg-[#FDE047] flex items-center justify-center text-[#0A0A0A] hover:bg-[#FDE047]/90 transition-all hover:scale-105 active:scale-95"
                  >
                    <Share2 size={18} />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="bg-[#171717] border-white/10 text-white">
                  Share Summary
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp} label="Avg / Day" value={formatINR(s.avg_daily || 0)} delay={0.1} testId="avg-daily-card" accent />
        <StatCard icon={Hash} label="Transactions" value={s.expense_count || 0} delay={0.12} testId="transaction-count-card" />
        <StatCard icon={PiggyBank} label="Budget Left" value={formatINR(s.budget_remaining)} delay={0.15} testId="budget-remaining-card" />
        <StatCard icon={Wallet} label="Total Budget" value={formatINR(s.total_budget)} delay={0.18} testId="total-budget-card" />
      </div>

      {/* Budget Alerts (only for monthly view) */}
      {viewMode === 'monthly' && <BudgetAlerts month={monthStr} />}

      {/* AI Insights Card */}
      {viewMode === 'monthly' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.22 }}
          className="glass-card overflow-hidden"
        >
          <button
            onClick={toggleInsights}
            className="w-full flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FDE047]/20 to-[#F59E0B]/20 flex items-center justify-center">
                <Sparkles size={20} className="text-[#FDE047]" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-white flex items-center gap-2">
                  AI Insights
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FDE047]/20 text-[#FDE047] font-bold uppercase tracking-wider">
                    AI
                  </span>
                </p>
                <p className="text-xs text-[#A1A1AA]">Get smart analysis of your {monthLabel} spending</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {insightsLoading && <Loader2 size={16} className="animate-spin text-[#FDE047]" />}
              <ChevronDown
                size={20}
                className={`text-[#A1A1AA] transition-transform duration-300 ${insightsOpen ? 'rotate-180' : ''}`}
              />
            </div>
          </button>

          <AnimatePresence>
            {insightsOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div className="pt-4 mt-4 border-t border-white/[0.08]">
                  {insightsLoading ? (
                    <div className="flex items-center gap-3 py-6 justify-center">
                      <Loader2 size={20} className="animate-spin text-[#FDE047]" />
                      <span className="text-[#A1A1AA] text-sm">Analyzing your spending patterns...</span>
                    </div>
                  ) : insights ? (
                    <div className="text-sm leading-relaxed text-[#A1A1AA] whitespace-pre-wrap">
                      {insights}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-[#A1A1AA] text-sm">Click to generate AI insights for {monthLabel}</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Daily Spending */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.25 }}
          className="glass-card md:col-span-7"
        >
          <p className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA] mb-6">
            {viewMode === 'weekly' ? 'Daily Spending (This Week)' : 'Daily Spending'}
          </p>
          {s.daily_spending?.some((d) => d.amount > 0) ? (
            <DailySpendingChart data={s.daily_spending} barSize={viewMode === 'weekly' ? 32 : 10} />
          ) : (
            <p className="text-[#A1A1AA] text-sm py-12 text-center">
              No spending data {viewMode === 'weekly' ? 'this week' : 'this month'}
            </p>
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
            <>
              <CategoryPieChart data={s.category_breakdown} />
              {/* Category list with percentages */}
              <div className="mt-4 space-y-2">
                {s.category_breakdown.slice(0, 4).map((cat) => {
                  const total = s.category_breakdown.reduce((sum, c) => sum + c.amount, 0);
                  const pct = total > 0 ? Math.round((cat.amount / total) * 100) : 0;
                  return (
                    <div key={cat.category} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: cat.color }} />
                        <span className="text-[#A1A1AA]">{cat.category}</span>
                      </div>
                      <span className="text-white font-medium">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </>
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
