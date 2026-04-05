import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, TrendingDown } from 'lucide-react';
import { api, formatINR } from '@/lib/api';

export default function BudgetAlerts({ month }) {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const params = month ? { month } : {};
    api.getAlerts(params).then(({ data }) => setAlerts(data)).catch(() => {});
  }, [month]);

  if (alerts.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', bounce: 0.3, duration: 0.6, delay: 0.1 }}
      data-testid="budget-alerts"
      className="space-y-3"
    >
      <p className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA]">Budget Alerts</p>
      <AnimatePresence>
        {alerts.map((a) => (
          <motion.div
            key={a.category}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            data-testid={`budget-alert-${a.category}`}
            className={`glass-card-sm flex items-center justify-between ${
              a.status === 'exceeded'
                ? 'border-red-500/30 bg-red-500/[0.03]'
                : 'border-[#FDE047]/30 bg-[#FDE047]/[0.03]'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                a.status === 'exceeded' ? 'bg-red-500/15 text-red-400' : 'bg-[#FDE047]/15 text-[#FDE047]'
              }`}>
                {a.status === 'exceeded' ? <TrendingDown size={18} /> : <AlertTriangle size={18} />}
              </div>
              <div>
                <p className="text-sm font-semibold">{a.category}</p>
                <p className="text-xs text-[#A1A1AA]">
                  {formatINR(a.spent)} of {formatINR(a.budget)} ({a.percentage}%)
                </p>
              </div>
            </div>
            <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full ${
              a.status === 'exceeded'
                ? 'bg-red-500/15 text-red-400'
                : 'bg-[#FDE047]/15 text-[#FDE047]'
            }`}>
              {a.status === 'exceeded' ? 'Over Budget' : 'Near Limit'}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
