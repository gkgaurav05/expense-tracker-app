import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { PiggyBank, Save, Trash2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { api, formatINR } from '@/lib/api';
import { toast } from 'sonner';

const spring = { type: 'spring', bounce: 0.3, duration: 0.6 };

export default function Budgets() {
  const [categories, setCategories] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [spending, setSpending] = useState({});
  const [budgetInputs, setBudgetInputs] = useState({});
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [catRes, budRes, sumRes] = await Promise.all([
        api.getCategories(),
        api.getBudgets(),
        api.getDashboardSummary(),
      ]);
      setCategories(catRes.data);
      setBudgets(budRes.data);

      const spendMap = {};
      (sumRes.data.category_breakdown || []).forEach((c) => {
        spendMap[c.category] = c.amount;
      });
      setSpending(spendMap);

      const inputs = {};
      budRes.data.forEach((b) => { inputs[b.category] = String(b.amount); });
      setBudgetInputs(inputs);
    } catch (e) {
      console.error('Fetch error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSave = async (categoryName) => {
    const val = parseFloat(budgetInputs[categoryName]);
    if (!val || val <= 0) {
      toast.error('Enter a valid budget amount');
      return;
    }
    try {
      await api.createOrUpdateBudget({ category: categoryName, amount: val });
      toast.success(`Budget set for ${categoryName}`);
      fetchData();
    } catch {
      toast.error('Failed to save budget');
    }
  };

  const handleDelete = async (budgetId, categoryName) => {
    try {
      await api.deleteBudget(budgetId);
      setBudgetInputs((prev) => { const n = { ...prev }; delete n[categoryName]; return n; });
      toast.success('Budget removed');
      fetchData();
    } catch {
      toast.error('Failed to remove budget');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 rounded-full border-2 border-[#FDE047] border-t-transparent animate-spin" />
      </div>
    );
  }

  const budgetMap = {};
  budgets.forEach((b) => { budgetMap[b.category] = b; });

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight font-['General_Sans']">Budgets</h1>
        <p className="text-sm text-[#A1A1AA] mt-1">Set monthly spending limits per category</p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {categories.map((cat, i) => {
          const budget = budgetMap[cat.name];
          const spent = spending[cat.name] || 0;
          const limit = budget?.amount || 0;
          const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
          const isOver = spent > limit && limit > 0;

          return (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: i * 0.05 }}
              className="glass-card-sm space-y-4"
              data-testid={`budget-card-${cat.name}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${cat.color}20` }}>
                    <span className="w-3 h-3 rounded-full" style={{ background: cat.color }} />
                  </div>
                  <span className="font-semibold text-sm">{cat.name}</span>
                </div>
                {budget && (
                  <button
                    data-testid={`delete-budget-${cat.name}`}
                    onClick={() => handleDelete(budget.id, cat.name)}
                    className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              {limit > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#A1A1AA]">Spent: {formatINR(spent)}</span>
                    <span className={isOver ? 'text-red-400 font-semibold' : 'text-[#A1A1AA]'}>
                      {isOver ? 'Over budget!' : `${formatINR(limit - spent)} left`}
                    </span>
                  </div>
                  <Progress
                    value={pct}
                    className="h-2 bg-white/[0.06] rounded-full"
                    data-testid={`budget-progress-${cat.name}`}
                  />
                </div>
              )}

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A1A1AA] text-xs font-medium">Rs.</span>
                  <input
                    data-testid={`budget-amount-input-${cat.name}`}
                    type="number"
                    min="0"
                    step="100"
                    value={budgetInputs[cat.name] || ''}
                    onChange={(e) => setBudgetInputs((p) => ({ ...p, [cat.name]: e.target.value }))}
                    placeholder="Set budget"
                    className="pill-input w-full pl-10 h-10 text-sm"
                  />
                </div>
                <button
                  data-testid={`save-budget-btn-${cat.name}`}
                  onClick={() => handleSave(cat.name)}
                  className="rounded-full bg-[#FDE047] text-[#0A0A0A] font-bold w-10 h-10 flex items-center justify-center hover:bg-[#FDE047]/90 transition-all hover:scale-105 active:scale-95"
                >
                  <Save size={16} />
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {categories.length === 0 && (
        <div className="glass-card text-center py-16">
          <PiggyBank size={40} className="mx-auto text-[#A1A1AA] mb-4" />
          <p className="text-[#A1A1AA]">No categories found</p>
        </div>
      )}
    </div>
  );
}
