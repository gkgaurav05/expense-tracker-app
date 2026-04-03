import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { formatINR } from '@/lib/api';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0A0A0A]/95 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-3 shadow-2xl">
      <p className="text-xs text-[#A1A1AA] mb-1">{label}</p>
      <p className="text-sm font-bold text-[#FDE047]">{formatINR(payload[0].value)}</p>
    </div>
  );
};

export function DailySpendingChart({ data, barSize = 28 }) {
  if (!data?.length) return null;
  return (
    <div data-testid="daily-spending-chart" className="w-full h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barSize={barSize}>
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#A1A1AA', fontSize: 12 }}
          />
          <YAxis hide />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Bar dataKey="amount" fill="#FDE047" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryPieChart({ data }) {
  if (!data?.length) return null;
  const COLORS = data.map((d) => d.color || '#FDE047');
  return (
    <div data-testid="category-breakdown-chart" className="w-full h-[220px] flex items-center">
      <ResponsiveContainer width="50%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="amount"
            nameKey="category"
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            strokeWidth={0}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-2 pl-4">
        {data.slice(0, 5).map((item) => (
          <div key={item.category} className="flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
            <span className="text-[#A1A1AA] truncate flex-1">{item.category}</span>
            <span className="text-white font-medium">{formatINR(item.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
