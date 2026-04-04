import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { api } from '@/lib/api';
import { toast } from 'sonner';

export default function AddExpenseModal({ open, onOpenChange, categories, onSuccess, expense }) {
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [showNewCat, setShowNewCat] = useState(false);

  useEffect(() => {
    if (open) {
      if (expense) {
        setAmount(String(expense.amount));
        setCategory(expense.category);
        setDescription(expense.description || '');
        setDate(new Date(expense.date + 'T00:00:00'));
      } else {
        setAmount('');
        setCategory('');
        setDescription('');
        setDate(new Date());
      }
      setShowNewCat(false);
      setNewCatName('');
    }
  }, [open, expense]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || !category) {
      toast.error('Please fill amount and category');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        amount: parseFloat(amount),
        category,
        description,
        date: format(date, 'yyyy-MM-dd'),
      };
      if (expense) {
        await api.updateExpense(expense.id, payload);
        toast.success('Expense updated');
      } else {
        await api.createExpense(payload);
        toast.success('Expense added');
      }
      onSuccess?.();
      onOpenChange(false);
    } catch {
      toast.error(expense ? 'Failed to update' : 'Failed to add expense');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      await api.createCategory({ name: newCatName.trim() });
      setCategory(newCatName.trim());
      setShowNewCat(false);
      setNewCatName('');
      onSuccess?.();
      toast.success('Category created');
    } catch {
      toast.error('Category already exists');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0A0A0A]/95 backdrop-blur-3xl border border-white/[0.08] rounded-[32px] p-8 max-w-md text-white z-[100]">
        <DialogHeader>
          <DialogTitle className="font-['General_Sans'] text-2xl font-bold tracking-tight">
            {expense ? 'Edit Expense' : 'Add Expense'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          {/* Amount */}
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA]">Amount</label>
            <div className="relative">
              {!amount && (
                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-[#A1A1AA] font-semibold text-sm pointer-events-none">Rs.</span>
              )}
              <input
                data-testid="expense-amount-input"
                type="number"
                min="1"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={amount ? '' : '0'}
                className="pill-input w-full pl-12"
              />
            </div>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA]">Category</label>
            {showNewCat ? (
              <div className="flex gap-2">
                <input
                  data-testid="new-category-input"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="New category name"
                  className="pill-input flex-1"
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCategory())}
                />
                <button
                  type="button"
                  data-testid="save-new-category-btn"
                  onClick={handleAddCategory}
                  className="rounded-full bg-[#FDE047] text-[#0A0A0A] font-bold px-5 h-12 hover:bg-[#FDE047]/90 transition-all hover:scale-105 active:scale-95 text-sm"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewCat(false)}
                  className="rounded-full bg-white/5 border border-white/10 text-white px-4 h-12 hover:bg-white/10 transition-all text-sm"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger
                    data-testid="expense-category-select"
                    className="flex-1 h-12 rounded-full bg-white/[0.05] border border-white/[0.1] px-6 text-white text-sm focus:ring-2 focus:ring-[#FDE047]"
                  >
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#171717] border-white/10 rounded-2xl text-white z-[200]">
                    {categories.map((c) => (
                      <SelectItem key={c.name} value={c.name} className="focus:bg-white/10 focus:text-white">
                        <span className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
                          {c.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  data-testid="add-new-category-btn"
                  onClick={() => setShowNewCat(true)}
                  className="rounded-full bg-white/5 border border-white/10 w-12 h-12 flex items-center justify-center text-[#A1A1AA] hover:bg-white/10 hover:text-white transition-all"
                >
                  <Plus size={18} />
                </button>
              </div>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA]">Description</label>
            <input
              data-testid="expense-description-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What was it for?"
              className="pill-input w-full"
            />
          </div>

          {/* Date */}
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA]">Date</label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  data-testid="expense-date-picker"
                  className="pill-input w-full flex items-center justify-between text-left"
                >
                  <span>{date ? format(date, 'PPP') : 'Pick a date'}</span>
                  <CalendarIcon size={16} className="text-[#A1A1AA]" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-[#171717] border-white/10 rounded-2xl z-[200]" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => { setDate(d); setCalendarOpen(false); }}
                  initialFocus
                  className="text-white"
                />
              </PopoverContent>
            </Popover>
          </div>

          <button
            type="submit"
            data-testid="expense-submit-btn"
            disabled={loading}
            className="w-full rounded-full bg-[#FDE047] text-[#0A0A0A] font-bold h-12 hover:bg-[#FDE047]/90 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 text-sm tracking-wide uppercase"
          >
            {loading ? (expense ? 'Updating...' : 'Adding...') : (expense ? 'Update Expense' : 'Add Expense')}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
