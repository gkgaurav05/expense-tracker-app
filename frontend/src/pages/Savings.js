import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { PiggyBank, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Target, Wallet } from 'lucide-react';
import { api, formatINR } from '@/lib/api';

const spring = { type: 'spring', bounce: 0.3, duration: 0.6 };

export default function Savings() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState(6);

  useEffect(() => {
    const fetchSavings = async () => {
      setLoading(true);
      try {
        const { data: d } = await api.getSavings({ months });
        setData(d);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchSavings();
  }, [months]);

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight font-['General_Sans']">Savings Tracker</h1>
        <p className="text-sm text-[#A1A1AA] mt-1">Track your budget performance over time</p>
      </motion.div>

      {/* Period Selector */}
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.05 }} className="flex items-center gap-3">
        <span className="text-sm text-[#A1A1AA]">Analyze last</span>
        <div className="flex gap-2">
          {[3, 6, 12].map((m) => (
            <button
              key={m}
              onClick={() => setMonths(m)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                months === m
                  ? 'bg-[#FDE047] text-[#0A0A0A]'
                  : 'bg-white/[0.05] border border-white/[0.08] text-[#A1A1AA] hover:bg-white/[0.1]'
              }`}
            >
              {m} months
            </button>
          ))}
        </div>
      </motion.div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 rounded-full border-2 border-[#FDE047] border-t-transparent animate-spin" />
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Overview Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Budget', value: formatINR(data.total_budget), icon: Target, color: 'text-[#FDE047]' },
              { label: 'Total Spent', value: formatINR(data.total_spent), icon: Wallet, color: 'text-[#FDE047]' },
              {
                label: 'Total Saved',
                value: formatINR(Math.abs(data.total_saved)),
                prefix: data.total_saved >= 0 ? '+' : '-',
                icon: data.total_saved >= 0 ? ArrowUpRight : ArrowDownRight,
                color: data.total_saved >= 0 ? 'text-green-400' : 'text-red-400'
              },
              {
                label: 'Savings Rate',
                value: `${Math.abs(data.savings_rate)}%`,
                prefix: data.savings_rate >= 0 ? '' : '-',
                icon: data.savings_rate >= 0 ? TrendingUp : TrendingDown,
                color: data.savings_rate >= 0 ? 'text-green-400' : 'text-red-400'
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
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-[#A1A1AA]">
            Analyzing: <span className="text-white font-medium">{data.period}</span> ({data.months_analyzed} months)
          </motion.p>

          {/* Monthly Breakdown & Category Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Monthly Breakdown */}
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.2 }} className="glass-card">
              <p className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA] mb-4">Monthly Performance</p>
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                {data.monthly_breakdown?.map((m, idx) => (
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
                    {/* Progress bar */}
                    <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min((m.total_spent / m.total_budget) * 100, 100)}%`,
                          background: m.total_saved >= 0 ? '#4ade80' : '#f87171'
                        }}
                      />
                    </div>
                    {/* Top categories for this month */}
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
              <p className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA] mb-4">Category Savings ({data.months_analyzed} months)</p>
              <div className="space-y-4">
                {data.category_summary?.map((c, idx) => (
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
          {data.total_saved > 0 && (
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
                    You've saved {formatINR(data.total_saved)} over the last {data.months_analyzed} months.
                    That's a {data.savings_rate}% savings rate!
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {data.total_saved < 0 && (
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
                    You've overspent by {formatINR(Math.abs(data.total_saved))} over the last {data.months_analyzed} months.
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
    </div>
  );
}
