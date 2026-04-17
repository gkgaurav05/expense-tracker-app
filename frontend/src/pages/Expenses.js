import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Plus, Trash2, Receipt, Filter, Pencil, Download, ChevronLeft, ChevronRight, CalendarDays, Upload } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { api, formatINR } from '@/lib/api';
import { buildExpenseExportParams } from '@/lib/expenseExport';
import { toast } from 'sonner';
import { format, addMonths, subMonths } from 'date-fns';
import AddExpenseModal from '@/components/AddExpenseModal';
import UploadStatementModal from '@/components/UploadStatementModal';

const spring = { type: 'spring', bounce: 0.3, duration: 0.6 };

export default function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filter, setFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());

  const monthStr = format(currentDate, 'yyyy-MM');
  const monthLabel = format(currentDate, 'MMMM yyyy');
  const isCurrentMonth = monthStr === format(new Date(), 'yyyy-MM');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildExpenseExportParams(monthStr, filter);
      const [expRes, catRes] = await Promise.all([
        api.getExpenses(params),
        api.getCategories(),
      ]);
      setExpenses(expRes.data);
      setCategories(catRes.data);
    } catch (e) {
      console.error('Fetch error', e);
    } finally {
      setLoading(false);
    }
  }, [filter, monthStr]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async (id) => {
    try {
      await api.deleteExpense(id);
      setExpenses((prev) => prev.filter((e) => e.id !== id));
      toast.success('Expense deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const catColorMap = {};
  categories.forEach((c) => { catColorMap[c.name] = c.color; });

  const handleEdit = (expense) => {
    setEditingExpense(expense);
    setModalOpen(true);
  };

  const handleExportCSV = async () => {
    try {
      const params = buildExpenseExportParams(monthStr, filter);
      const { data } = await api.exportCSV(params);
      const url = window.URL.createObjectURL(new Blob([data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'expenses.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('CSV exported successfully');
    } catch {
      toast.error('Failed to export CSV');
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight font-['General_Sans']">Expenses</h1>
          <p className="text-sm text-[#A1A1AA] mt-1">{expenses.length} transactions</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            data-testid="upload-statement-btn"
            onClick={() => setUploadModalOpen(true)}
            className="h-11 sm:h-12 px-4 sm:px-5 rounded-full bg-white/[0.08] border border-white/[0.1] flex items-center gap-2 text-white hover:bg-white/[0.12] hover:border-white/[0.2] transition-all group"
          >
            <Upload size={16} className="text-[#FDE047] group-hover:scale-110 transition-transform" />
            <span className="text-sm font-medium hidden sm:inline">Import</span>
          </button>
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  data-testid="export-csv-btn"
                  onClick={handleExportCSV}
                  className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-[#A1A1AA] hover:bg-white/[0.1] hover:text-white transition-all"
                >
                  <Download size={16} />
                </button>
              </TooltipTrigger>
              <TooltipContent className="bg-[#171717] border-white/10 text-white">
                Export CSV
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <button
            data-testid="add-expense-btn"
            onClick={() => { setEditingExpense(null); setModalOpen(true); }}
            className="rounded-full bg-[#FDE047] text-[#0A0A0A] font-bold px-5 sm:px-6 h-11 sm:h-12 flex items-center gap-2 hover:bg-[#FDE047]/90 transition-all hover:scale-105 active:scale-95 text-sm tracking-wide uppercase shadow-lg shadow-[#FDE047]/20"
          >
            <Plus size={18} strokeWidth={2.5} /> Add
          </button>
        </div>
      </motion.div>

      {/* Month Navigator */}
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.05 }} className="flex items-center gap-4">
        <button onClick={() => setCurrentDate((d) => subMonths(d, 1))} className="w-10 h-10 rounded-full bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-[#A1A1AA] hover:bg-white/[0.1] transition-all">
          <ChevronLeft size={18} />
        </button>
        <span className="text-lg font-semibold font-['General_Sans'] flex items-center gap-2">
          <CalendarDays size={16} className="text-[#FDE047]" /> {monthLabel}
        </span>
        <button onClick={() => setCurrentDate((d) => addMonths(d, 1))} className="w-10 h-10 rounded-full bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-[#A1A1AA] hover:bg-white/[0.1] transition-all">
          <ChevronRight size={18} />
        </button>
        {!isCurrentMonth && (
          <button onClick={() => setCurrentDate(new Date())} className="text-xs text-[#FDE047] font-semibold hover:underline ml-2">
            Back to Current Month
          </button>
        )}
      </motion.div>

      {/* Summary + Filter */}
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.1 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA]">Total</p>
            <p className="text-xl font-bold font-['General_Sans']">{formatINR(expenses.reduce((s, e) => s + e.amount, 0))}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA]">Count</p>
            <p className="text-xl font-bold font-['General_Sans']">{expenses.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
        <Filter size={16} className="text-[#A1A1AA]" />
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger data-testid="expense-filter-select" className="w-48 pill-input h-10 text-sm">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent className="bg-[#171717] border-white/10 rounded-2xl text-white">
            <SelectItem value="all" className="focus:bg-white/10 focus:text-white">All Categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.name} value={c.name} className="focus:bg-white/10 focus:text-white">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                  {c.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        </div>
      </motion.div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 rounded-full border-2 border-[#FDE047] border-t-transparent animate-spin" />
        </div>
      ) : expenses.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card text-center py-12 px-6">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-[#FDE047]/20 to-[#FDE047]/5 flex items-center justify-center">
            <Receipt size={36} className="text-[#FDE047]" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2 font-['General_Sans']">No expenses yet</h3>
          <p className="text-[#A1A1AA] mb-8 max-w-md mx-auto">
            Start tracking your spending by importing a bank statement or adding expenses manually.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <button
              onClick={() => setUploadModalOpen(true)}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#FDE047] text-[#0A0A0A] font-bold flex items-center justify-center gap-2 hover:bg-[#FDE047]/90 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-[#FDE047]/20"
            >
              <Upload size={18} /> Import Bank Statement
            </button>
            <span className="text-[#A1A1AA] text-sm">or</span>
            <button
              onClick={() => { setEditingExpense(null); setModalOpen(true); }}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-white/[0.08] border border-white/[0.1] text-white font-medium flex items-center justify-center gap-2 hover:bg-white/[0.12] transition-all"
            >
              <Plus size={18} /> Add Manually
            </button>
          </div>

          <div className="mt-8 pt-6 border-t border-white/[0.06]">
            <p className="text-xs text-[#A1A1AA]/70 flex items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                Supports
              </span>
              GPay • PhonePe • Axis • HDFC • SBI • CSV • PDF • HTML
            </p>
          </div>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="space-y-3" data-testid="expense-list">
          {expenses.map((exp, i) => (
            <motion.div
              key={exp.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: i * 0.03 }}
              data-testid={`expense-item-${exp.id}`}
              className="glass-card-sm flex items-center justify-between group"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex flex-col items-center justify-center leading-none">
                  <span className="text-xs font-bold text-white">{exp.date?.slice(8)}</span>
                  <span className="text-[10px] text-[#A1A1AA] uppercase">{new Date(exp.date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short' })}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: catColorMap[exp.category] || '#FDE047' }} />
                  <div>
                    <p className="text-sm font-semibold text-white">{exp.category}</p>
                    <p className="text-xs text-[#A1A1AA]">{exp.description || '-'}</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-base font-bold text-white">{formatINR(exp.amount)}</p>
                <button
                  data-testid={`edit-expense-${exp.id}`}
                  onClick={() => handleEdit(exp)}
                  className="opacity-0 group-hover:opacity-100 w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center text-[#A1A1AA] hover:bg-white/[0.1] hover:text-white transition-all"
                >
                  <Pencil size={14} />
                </button>
                <button
                  data-testid={`delete-expense-${exp.id}`}
                  onClick={() => handleDelete(exp.id)}
                  className="opacity-0 group-hover:opacity-100 w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-all"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      <AddExpenseModal
        open={modalOpen}
        onOpenChange={(open) => { setModalOpen(open); if (!open) setEditingExpense(null); }}
        categories={categories}
        onSuccess={fetchData}
        expense={editingExpense}
      />

      <UploadStatementModal
        open={uploadModalOpen}
        onOpenChange={setUploadModalOpen}
        categories={categories}
        onSuccess={fetchData}
      />
    </div>
  );
}
