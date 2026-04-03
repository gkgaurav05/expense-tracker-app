import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, CalendarDays, TrendingUp, Layers, Hash } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, formatINR } from '@/lib/api';
import { DailySpendingChart } from '@/components/SpendingCharts';
import { format, addMonths, subMonths, startOfWeek, endOfWeek, addWeeks, subWeeks } from 'date-fns';

const spring = { type: 'spring', bounce: 0.3, duration: 0.6 };

export default function Summary() {
  const [tab, setTab] = useState('monthly');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const monthStr = format(currentDate, 'yyyy-MM');
  const monthLabel = format(currentDate, 'MMMM yyyy');
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const weekLabel = `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`;

  const fetchMonthly = useCallback(async () => {
    setLoading(true);
    try {
      const { data: d } = await api.getMonthlyReport(monthStr);
      setData(d);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [monthStr]);

  const fetchWeekly = useCallback(async () => {
    setLoading(true);
    try {
      const start = format(weekStart, 'yyyy-MM-dd');
      const end = format(weekEnd, 'yyyy-MM-dd');
      const { data: expenses } = await api.getExpenses({ start_date: start, end_date: end });
      const total = expenses.reduce((s, e) => s + e.amount, 0);
      const catMap = {};
      expenses.forEach((e) => { catMap[e.category] = (catMap[e.category] || 0) + e.amount; });
      const dailyMap = {};
      expenses.forEach((e) => { dailyMap[e.date] = (dailyMap[e.date] || 0) + e.amount; });
      const dailySpending = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        const ds = format(d, 'yyyy-MM-dd');
        dailySpending.push({ date: ds, label: format(d, 'EEE'), amount: dailyMap[ds] || 0 });
      }
      const catBreakdown = Object.entries(catMap)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, amt]) => ({
          category: cat, amount: amt,
          percentage: total > 0 ? Math.round((amt / total) * 100) : 0,
        }));
      setData({
        total_spent: total,
        expense_count: expenses.length,
        avg_daily: Math.round(total / 7),
        top_category: catBreakdown[0]?.category || null,
        category_breakdown: catBreakdown,
        daily_spending: dailySpending,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekEnd]);

  useEffect(() => {
    if (tab === 'monthly') fetchMonthly();
    else fetchWeekly();
  }, [tab, fetchMonthly, fetchWeekly]);

  const handlePrev = () => {
    setCurrentDate((d) => (tab === 'monthly' ? subMonths(d, 1) : subWeeks(d, 1)));
  };
  const handleNext = () => {
    setCurrentDate((d) => (tab === 'monthly' ? addMonths(d, 1) : addWeeks(d, 1)));
  };

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight font-['General_Sans']">Summary</h1>
        <p className="text-sm text-[#A1A1AA] mt-1">Analyze your spending trends</p>
      </motion.div>

      {/* Tabs + Navigator */}
      <div className="space-y-5">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-white/[0.05] border border-white/[0.08] rounded-full p-1 w-fit">
            <TabsTrigger value="monthly" data-testid="summary-monthly-tab" className="rounded-full px-6 data-[state=active]:bg-[#FDE047] data-[state=active]:text-[#0A0A0A] text-[#A1A1AA] font-semibold text-sm">Monthly</TabsTrigger>
            <TabsTrigger value="weekly" data-testid="summary-weekly-tab" className="rounded-full px-6 data-[state=active]:bg-[#FDE047] data-[state=active]:text-[#0A0A0A] text-[#A1A1AA] font-semibold text-sm">Weekly</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-4">
          <button onClick={handlePrev} data-testid="summary-prev-btn" className="w-10 h-10 rounded-full bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-[#A1A1AA] hover:bg-white/[0.1] transition-all">
            <ChevronLeft size={18} />
          </button>
          <span data-testid="summary-period-label" className="text-lg font-semibold font-['General_Sans'] flex items-center gap-2">
            <CalendarDays size={16} className="text-[#FDE047]" />
            {tab === 'monthly' ? monthLabel : weekLabel}
          </span>
          <button onClick={handleNext} data-testid="summary-next-btn" className="w-10 h-10 rounded-full bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-[#A1A1AA] hover:bg-white/[0.1] transition-all">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 rounded-full border-2 border-[#FDE047] border-t-transparent animate-spin" />
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Spent', value: formatINR(data.total_spent), icon: TrendingUp },
              { label: 'Avg Daily', value: formatINR(data.avg_daily), icon: CalendarDays },
              { label: 'Top Category', value: data.top_category || '-', icon: Layers, isText: true },
              { label: 'Transactions', value: data.expense_count, icon: Hash, isText: true },
            ].map((stat, i) => (
              <motion.div key={stat.label} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: i * 0.05 }} className="glass-card-sm">
                <div className="flex items-center gap-2 mb-2">
                  <stat.icon size={14} className="text-[#FDE047]" />
                  <span className="text-xs uppercase tracking-[0.15em] font-semibold text-[#A1A1AA]">{stat.label}</span>
                </div>
                <p className={`font-bold font-['General_Sans'] ${stat.isText ? 'text-lg' : 'text-xl'}`}>{stat.value}</p>
              </motion.div>
            ))}
          </div>

          {/* Charts + Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.2 }} className="glass-card md:col-span-7">
              <p className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA] mb-4">{tab === 'monthly' ? 'Daily Trend' : 'Daily Spending'}</p>
              {data.daily_spending?.some((d) => d.amount > 0) ? (
                <DailySpendingChart data={data.daily_spending} barSize={tab === 'monthly' ? 10 : 28} />
              ) : (
                <p className="text-[#A1A1AA] text-sm py-12 text-center">No spending data</p>
              )}
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.25 }} className="glass-card md:col-span-5">
              <p className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA] mb-4">Category Breakdown</p>
              {data.category_breakdown?.length > 0 ? (
                <div className="space-y-3">
                  {data.category_breakdown.map((c) => (
                    <div key={c.category}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-white font-medium">{c.category}</span>
                        <span className="text-[#A1A1AA]">{formatINR(c.amount)} ({c.percentage}%)</span>
                      </div>
                      <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${c.percentage}%`, background: c.color || '#FDE047' }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[#A1A1AA] text-sm py-8 text-center">No expenses</p>
              )}
            </motion.div>
          </div>
        </div>
      ) : (
        <div className="glass-card text-center py-16">
          <p className="text-[#A1A1AA]">No data for this period</p>
        </div>
      )}
    </div>
  );
}
