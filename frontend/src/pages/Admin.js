import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, Receipt, PiggyBank, TrendingUp, Calendar, Activity, ShieldX } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from '@/lib/navigation';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

const spring = { type: 'spring', bounce: 0.3, duration: 0.6 };

const StatCard = ({ icon: Icon, label, value, color, delay }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ ...spring, delay }}
    className="glass-card-sm flex items-center gap-4"
  >
    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${color}`}>
      <Icon size={22} strokeWidth={2.2} />
    </div>
    <div>
      <p className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA]">{label}</p>
      <p className="text-2xl font-bold tracking-tight font-['General_Sans']">{value}</p>
    </div>
  </motion.div>
);

export default function Admin() {
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!isAdmin) {
      setAccessDenied(true);
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const [statsRes, activityRes] = await Promise.all([
          api.getAdminStats(),
          api.getAdminActivity()
        ]);
        setStats(statsRes.data);
        setActivity(activityRes.data);
      } catch (e) {
        console.error('Failed to fetch admin data', e);
        if (e.response?.status === 403) {
          setAccessDenied(true);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [isAdmin]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 rounded-full border-2 border-[#FDE047] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card text-center max-w-md"
        >
          <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-4">
            <ShieldX size={32} className="text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-[#A1A1AA] mb-6">You don't have permission to access the admin dashboard.</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2 bg-[#FDE047] text-[#0A0A0A] font-semibold rounded-xl hover:bg-[#FDE047]/90 transition-all"
          >
            Go to Dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  // Prepare chart data from activity
  const chartData = activity?.last_30_days?.signups_by_day
    ? Object.entries(activity.last_30_days.signups_by_day)
        .map(([date, count]) => ({ date: date.slice(5), signups: count }))
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];

  const expenseChartData = activity?.last_30_days?.expenses_by_day
    ? Object.entries(activity.last_30_days.expenses_by_day)
        .map(([date, count]) => ({ date: date.slice(5), expenses: count }))
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
      >
        <h1 className="text-3xl font-black tracking-tight font-['General_Sans'] text-white">
          Admin Dashboard
        </h1>
        <p className="text-[#A1A1AA] mt-1 text-sm">Monitor app usage and user activity</p>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Total Users"
          value={stats?.total_users || 0}
          color="bg-[#FDE047]/15 text-[#FDE047]"
          delay={0.1}
        />
        <StatCard
          icon={Receipt}
          label="Total Expenses"
          value={stats?.total_expenses || 0}
          color="bg-blue-500/15 text-blue-400"
          delay={0.15}
        />
        <StatCard
          icon={PiggyBank}
          label="Total Budgets"
          value={stats?.total_budgets || 0}
          color="bg-green-500/15 text-green-400"
          delay={0.2}
        />
        <StatCard
          icon={TrendingUp}
          label="Today's Signups"
          value={activity?.today?.new_users || 0}
          color="bg-purple-500/15 text-purple-400"
          delay={0.25}
        />
      </div>

      {/* Today & This Week */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.3 }}
          className="glass-card"
        >
          <div className="flex items-center gap-3 mb-4">
            <Calendar size={20} className="text-[#FDE047]" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#A1A1AA]">Today</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/[0.03] rounded-xl p-4">
              <p className="text-2xl font-bold text-white">{activity?.today?.new_users || 0}</p>
              <p className="text-xs text-[#A1A1AA]">New Users</p>
            </div>
            <div className="bg-white/[0.03] rounded-xl p-4">
              <p className="text-2xl font-bold text-white">{activity?.today?.new_expenses || 0}</p>
              <p className="text-xs text-[#A1A1AA]">New Expenses</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.35 }}
          className="glass-card"
        >
          <div className="flex items-center gap-3 mb-4">
            <Activity size={20} className="text-[#FDE047]" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#A1A1AA]">This Week</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/[0.03] rounded-xl p-4">
              <p className="text-2xl font-bold text-white">{activity?.this_week?.new_users || 0}</p>
              <p className="text-xs text-[#A1A1AA]">New Users</p>
            </div>
            <div className="bg-white/[0.03] rounded-xl p-4">
              <p className="text-2xl font-bold text-white">{activity?.this_week?.new_expenses || 0}</p>
              <p className="text-xs text-[#A1A1AA]">New Expenses</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Signups Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.4 }}
          className="glass-card"
        >
          <p className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA] mb-6">
            Signups (Last 30 Days)
          </p>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <XAxis dataKey="date" tick={{ fill: '#A1A1AA', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#A1A1AA', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#171717', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                  labelStyle={{ color: '#FDE047' }}
                />
                <Bar dataKey="signups" fill="#FDE047" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-[#A1A1AA] text-sm py-12 text-center">No signups in the last 30 days</p>
          )}
        </motion.div>

        {/* Expenses Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.45 }}
          className="glass-card"
        >
          <p className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA] mb-6">
            Expenses Added (Last 30 Days)
          </p>
          {expenseChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={expenseChartData}>
                <XAxis dataKey="date" tick={{ fill: '#A1A1AA', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#A1A1AA', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#171717', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                  labelStyle={{ color: '#4ECDC4' }}
                />
                <Bar dataKey="expenses" fill="#4ECDC4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-[#A1A1AA] text-sm py-12 text-center">No expenses in the last 30 days</p>
          )}
        </motion.div>
      </div>

      {/* Recent Signups */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.5 }}
        className="glass-card"
      >
        <p className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA] mb-6">
          Recent Signups
        </p>
        {stats?.recent_signups?.length > 0 ? (
          <div className="space-y-3">
            {stats.recent_signups.map((user, idx) => (
              <div key={user.id || idx} className="flex items-center justify-between py-2 border-b border-white/[0.05] last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#FDE047]/15 flex items-center justify-center text-[#FDE047] font-bold text-sm uppercase">
                    {user.name?.charAt(0) || 'U'}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{user.name || 'Unknown'}</p>
                    <p className="text-xs text-[#A1A1AA]">{user.email}</p>
                  </div>
                </div>
                <p className="text-xs text-[#A1A1AA]">
                  {user.created_at ? new Date(user.created_at).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                  }) : '-'}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[#A1A1AA] text-sm py-8 text-center">No users yet</p>
        )}
      </motion.div>
    </div>
  );
}
