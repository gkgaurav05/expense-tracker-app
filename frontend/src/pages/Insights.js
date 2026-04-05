import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Loader2, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { format, addMonths, subMonths } from 'date-fns';

const spring = { type: 'spring', bounce: 0.3, duration: 0.6 };

export default function Insights() {
  const [insights, setInsights] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());

  const monthStr = format(currentDate, 'yyyy-MM');
  const monthLabel = format(currentDate, 'MMMM yyyy');
  const isCurrentMonth = monthStr === format(new Date(), 'yyyy-MM');

  const generateInsights = async () => {
    setLoading(true);
    setInsights('');
    try {
      const { data } = await api.getInsights({ month: monthStr });
      setInsights(data.insights);
    } catch {
      toast.error('Failed to generate insights');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight font-['General_Sans']">AI Insights</h1>
        <p className="text-sm text-[#A1A1AA] mt-1">Get smart analysis of your spending powered by OpenAI</p>
      </motion.div>

      {/* Month Navigator */}
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.05 }} className="flex items-center gap-4">
        <button onClick={() => { setCurrentDate((d) => subMonths(d, 1)); setInsights(''); }} className="w-10 h-10 rounded-full bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-[#A1A1AA] hover:bg-white/[0.1] transition-all">
          <ChevronLeft size={18} />
        </button>
        <span className="text-lg font-semibold font-['General_Sans'] flex items-center gap-2">
          <CalendarDays size={16} className="text-[#FDE047]" /> {monthLabel}
        </span>
        <button onClick={() => { setCurrentDate((d) => addMonths(d, 1)); setInsights(''); }} className="w-10 h-10 rounded-full bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-[#A1A1AA] hover:bg-white/[0.1] transition-all">
          <ChevronRight size={18} />
        </button>
        {!isCurrentMonth && (
          <button onClick={() => { setCurrentDate(new Date()); setInsights(''); }} className="text-xs text-[#FDE047] font-semibold hover:underline ml-2">
            Back to Current Month
          </button>
        )}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.1 }}>
        <button
          data-testid="generate-insights-btn"
          onClick={generateInsights}
          disabled={loading}
          className="rounded-full bg-[#FDE047] text-[#0A0A0A] font-bold px-8 h-12 flex items-center gap-2 hover:bg-[#FDE047]/90 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 text-sm tracking-wide uppercase shadow-lg shadow-[#FDE047]/20"
        >
          {loading ? (
            <><Loader2 size={18} className="animate-spin" /> Analyzing {monthLabel}...</>
          ) : (
            <><Sparkles size={18} strokeWidth={2.5} /> Analyze {monthLabel}</>
          )}
        </button>
      </motion.div>

      {(insights || loading) && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.15 }}
          className="glass-card ai-glow"
          data-testid="insights-content"
        >
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={18} className="text-[#FDE047]" />
            <p className="text-xs uppercase tracking-[0.2em] font-semibold text-[#FDE047]">AI Analysis — {monthLabel}</p>
          </div>
          {loading ? (
            <div className="flex items-center gap-3 py-8 justify-center">
              <div className="w-6 h-6 rounded-full border-2 border-[#FDE047] border-t-transparent animate-spin" />
              <span className="text-[#A1A1AA] text-sm">Analyzing your spending patterns for {monthLabel}...</span>
            </div>
          ) : (
            <div className="text-sm leading-relaxed text-[#A1A1AA] whitespace-pre-wrap">
              {insights}
            </div>
          )}
        </motion.div>
      )}

      {!insights && !loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="glass-card text-center py-16"
        >
          <Sparkles size={48} className="mx-auto text-[#A1A1AA]/40 mb-4" />
          <p className="text-[#A1A1AA] text-sm max-w-sm mx-auto">
            Select a month and click "Analyze" to get AI-powered insights about your spending habits, patterns, and personalized savings tips.
          </p>
        </motion.div>
      )}
    </div>
  );
}
