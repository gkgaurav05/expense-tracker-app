import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Share2, Copy, Download, ChevronLeft, ChevronRight, CalendarDays, TrendingUp, PiggyBank, Receipt, Trophy } from 'lucide-react';
import { api, formatINR } from '@/lib/api';
import { DailySpendingChart, CategoryPieChart } from '@/components/SpendingCharts';
import { toast } from 'sonner';
import { format, addMonths, subMonths } from 'date-fns';

const spring = { type: 'spring', bounce: 0.3, duration: 0.6 };

export default function Reports() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const monthStr = format(currentDate, 'yyyy-MM');
  const monthLabel = format(currentDate, 'MMMM yyyy');

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.getMonthlyReport(monthStr);
      setReport(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [monthStr]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const handleShare = async () => {
    const text = `My spending report for ${monthLabel}: ${formatINR(report?.total_spent || 0)} across ${report?.expense_count || 0} transactions`;
    if (navigator.share) {
      try { await navigator.share({ title: `Expense Report - ${monthLabel}`, text, url: window.location.href }); } catch {}
    } else {
      handleCopyLink();
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/reports?month=${monthStr}`);
    toast.success('Link copied to clipboard');
  };

  const handleExportCSV = async () => {
    try {
      const m = currentDate.getMonth() + 1;
      const y = currentDate.getFullYear();
      const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
      const endM = m === 12 ? 1 : m + 1;
      const endY = m === 12 ? y + 1 : y;
      const endDate = `${endY}-${String(endM).padStart(2, '0')}-01`;
      const { data } = await api.exportCSV({ start_date: startDate, end_date: endDate });
      const url = window.URL.createObjectURL(new Blob([data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `expenses-${monthStr}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('CSV downloaded');
    } catch {
      toast.error('Export failed');
    }
  };

  const r = report || {};

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight font-['General_Sans']">Monthly Report</h1>
        <p className="text-sm text-[#A1A1AA] mt-1">Share your spending summary</p>
      </motion.div>

      {/* Month Nav + Share */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => setCurrentDate((d) => subMonths(d, 1))} data-testid="report-prev-month" className="w-10 h-10 rounded-full bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-[#A1A1AA] hover:bg-white/[0.1] transition-all">
            <ChevronLeft size={18} />
          </button>
          <span data-testid="report-month-label" className="text-lg font-semibold font-['General_Sans'] flex items-center gap-2">
            <CalendarDays size={16} className="text-[#FDE047]" /> {monthLabel}
          </span>
          <button onClick={() => setCurrentDate((d) => addMonths(d, 1))} data-testid="report-next-month" className="w-10 h-10 rounded-full bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-[#A1A1AA] hover:bg-white/[0.1] transition-all">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button data-testid="report-copy-link-btn" onClick={handleCopyLink} className="rounded-full bg-white/[0.05] border border-white/[0.08] px-4 h-10 flex items-center gap-2 text-sm text-[#A1A1AA] hover:bg-white/[0.1] transition-all">
            <Copy size={14} /> Copy Link
          </button>
          <button data-testid="report-download-csv-btn" onClick={handleExportCSV} className="rounded-full bg-white/[0.05] border border-white/[0.08] px-4 h-10 flex items-center gap-2 text-sm text-[#A1A1AA] hover:bg-white/[0.1] transition-all">
            <Download size={14} /> CSV
          </button>
          <button data-testid="report-share-btn" onClick={handleShare} className="rounded-full bg-[#FDE047] text-[#0A0A0A] font-bold px-5 h-10 flex items-center gap-2 text-sm hover:bg-[#FDE047]/90 transition-all hover:scale-105 active:scale-95">
            <Share2 size={14} /> Share
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 rounded-full border-2 border-[#FDE047] border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Report Card */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.1 }} className="glass-card">
            <div className="text-center mb-8">
              <p className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA] mb-2">Total Spending</p>
              <h2 data-testid="report-total-spent" className="text-5xl sm:text-6xl font-black tracking-tighter font-['General_Sans'] text-white">
                {formatINR(r.total_spent)}
              </h2>
              <p className="text-[#A1A1AA] text-sm mt-2">{r.expense_count || 0} transactions in {r.days_tracked || 0} days</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[
                { label: 'Avg/Day', value: formatINR(r.avg_daily), icon: TrendingUp },
                { label: 'Budget', value: formatINR(r.total_budget), icon: PiggyBank },
                { label: 'Top Category', value: r.top_category || '-', icon: Trophy, isText: true },
                { label: 'Expenses', value: r.expense_count || 0, icon: Receipt, isText: true },
              ].map((s) => (
                <div key={s.label} className="bg-white/[0.03] rounded-2xl p-4 text-center">
                  <s.icon size={16} className="mx-auto text-[#FDE047] mb-2" />
                  <p className="text-xs text-[#A1A1AA] uppercase tracking-wider">{s.label}</p>
                  <p className={`font-bold mt-1 ${s.isText ? 'text-sm' : 'text-lg'}`}>{s.value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {r.daily_spending?.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA] mb-4">Daily Trend</p>
                  <DailySpendingChart data={r.daily_spending} barSize={10} />
                </div>
              )}
              {r.category_breakdown?.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA] mb-4">Categories</p>
                  <CategoryPieChart data={r.category_breakdown} />
                </div>
              )}
            </div>
          </motion.div>

          {/* Top Expenses */}
          {r.top_expenses?.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.2 }} className="glass-card">
              <p className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA] mb-4">Top Expenses</p>
              <div className="space-y-3">
                {r.top_expenses.map((exp, i) => (
                  <div key={exp.id || i} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-3">
                      <span className="w-7 h-7 rounded-lg bg-[#FDE047]/10 flex items-center justify-center text-xs font-bold text-[#FDE047]">{i + 1}</span>
                      <div>
                        <p className="text-sm font-medium">{exp.category}</p>
                        <p className="text-xs text-[#A1A1AA]">{exp.description || exp.date}</p>
                      </div>
                    </div>
                    <p className="text-sm font-bold">{formatINR(exp.amount)}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
