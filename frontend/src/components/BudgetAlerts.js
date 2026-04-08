import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { api, formatINR } from '@/lib/api';

export default function BudgetAlerts({ month }) {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const params = month ? { month } : {};
    api.getAlerts(params).then(({ data }) => setAlerts(data)).catch(() => {});
  }, [month]);

  if (alerts.length === 0) return null;

  const exceeded = alerts.filter(a => a.status === 'exceeded');
  const nearLimit = alerts.filter(a => a.status !== 'exceeded');

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', bounce: 0.3, duration: 0.6, delay: 0.1 }}
      data-testid="budget-alerts"
      className="glass-card-sm"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
          <AlertTriangle size={16} className="text-amber-400" />
        </div>
        <p className="text-sm font-semibold text-white">Budget Alerts</p>
        <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.08] text-[#A1A1AA]">
          {alerts.length} {alerts.length === 1 ? 'category' : 'categories'}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {/* Exceeded alerts - red */}
        {exceeded.map((a) => (
          <div
            key={a.category}
            data-testid={`budget-alert-${a.category}`}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20"
          >
            <span className="w-2 h-2 rounded-full bg-red-400" />
            <span className="text-xs font-medium text-white">{a.category}</span>
            <span className="text-[10px] text-red-400 font-bold">{a.percentage}%</span>
          </div>
        ))}

        {/* Near limit alerts - yellow */}
        {nearLimit.map((a) => (
          <div
            key={a.category}
            data-testid={`budget-alert-${a.category}`}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#FDE047]/10 border border-[#FDE047]/20"
          >
            <span className="w-2 h-2 rounded-full bg-[#FDE047]" />
            <span className="text-xs font-medium text-white">{a.category}</span>
            <span className="text-[10px] text-[#FDE047] font-bold">{a.percentage}%</span>
          </div>
        ))}
      </div>

      {/* Compact summary */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/[0.06] text-[10px] text-[#A1A1AA]">
        {exceeded.length > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
            {exceeded.length} over budget
          </span>
        )}
        {nearLimit.length > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FDE047]" />
            {nearLimit.length} near limit
          </span>
        )}
      </div>
    </motion.div>
  );
}
