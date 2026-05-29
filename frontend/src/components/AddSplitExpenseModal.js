import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { api, formatINR } from '@/lib/api';
import { toast } from 'sonner';

// Mirrors the backend rule in split_logic.calculate_equal_split:
// payer absorbs the leftover paisa.
function previewEqualSplit(amountRupees, participantUserIds, payerId) {
  if (!amountRupees || participantUserIds.length === 0) return {};
  const amountPaise = Math.round(amountRupees * 100);
  const n = participantUserIds.length;
  const baseShare = Math.floor(amountPaise / n);
  let remainder = amountPaise - baseShare * n;
  const splits = {};
  for (const uid of participantUserIds) {
    splits[uid] = baseShare;
  }
  if (remainder === 0) return splits;
  if (splits[payerId] !== undefined) {
    splits[payerId] += remainder;
  } else {
    for (let i = 0; i < participantUserIds.length && remainder > 0; i++) {
      splits[participantUserIds[i]] += 1;
      remainder -= 1;
    }
  }
  return splits;
}

export default function AddSplitExpenseModal({ open, onOpenChange, group, categories, onSuccess }) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Food & Dining');
  const [date, setDate] = useState(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [paidBy, setPaidBy] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && group) {
      setAmount('');
      setDescription('');
      setCategory('Food & Dining');
      setDate(new Date());
      const allMemberIds = group.members.map((m) => m.user_id);
      setSelectedUserIds(allMemberIds);
      setPaidBy(group.members[0]?.user_id || '');
    }
  }, [open, group]);

  const memberById = useMemo(() => {
    const map = {};
    (group?.members || []).forEach((m) => { map[m.user_id] = m; });
    return map;
  }, [group]);

  const splitPreview = useMemo(() => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) return {};
    return previewEqualSplit(numAmount, selectedUserIds, paidBy);
  }, [amount, selectedUserIds, paidBy]);

  const toggleParticipant = (userId) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (!description.trim()) {
      toast.error('Description is required');
      return;
    }
    if (!paidBy) {
      toast.error('Select who paid');
      return;
    }
    if (selectedUserIds.length === 0) {
      toast.error('Select at least one participant');
      return;
    }
    setLoading(true);
    try {
      await api.createSplitExpense(group.id, {
        description: description.trim(),
        amount: numAmount,
        category,
        date: format(date, 'yyyy-MM-dd'),
        paid_by: paidBy,
        participant_user_ids: selectedUserIds,
        split_method: 'equal',
      });
      toast.success('Expense added');
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add expense');
    } finally {
      setLoading(false);
    }
  };

  if (!group) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0A0A0A]/95 backdrop-blur-3xl border border-white/[0.08] rounded-[32px] p-8 max-w-lg text-white z-[100] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-['General_Sans'] text-2xl font-bold tracking-tight">
            Add Split Expense
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
                data-testid="split-expense-amount"
                type="number"
                min="1"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={amount ? '' : '0'}
                className="pill-input w-full pl-12"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA]">Description</label>
            <input
              data-testid="split-expense-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Dinner, Cab, Tickets..."
              maxLength={200}
              className="pill-input w-full"
            />
          </div>

          {/* Category + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA]">Category</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-12 rounded-full bg-white/[0.05] border border-white/[0.1] px-5 text-white text-sm focus:ring-2 focus:ring-[#FDE047]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#171717] border-white/10 rounded-2xl text-white z-[200]">
                  {(categories || []).map((c) => (
                    <SelectItem key={c.name} value={c.name} className="focus:bg-white/10 focus:text-white">
                      <span className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA]">Date</label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="pill-input w-full flex items-center justify-between text-left"
                  >
                    <span>{format(date, 'PP')}</span>
                    <CalendarIcon size={16} className="text-[#A1A1AA]" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-[#171717] border-white/10 rounded-2xl z-[200]" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => { setDate(d); setCalendarOpen(false); }}
                    disabled={{ after: new Date() }}
                    toDate={new Date()}
                    initialFocus
                    className="text-white"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Paid by */}
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA]">Paid by</label>
            <Select value={paidBy} onValueChange={setPaidBy}>
              <SelectTrigger className="h-12 rounded-full bg-white/[0.05] border border-white/[0.1] px-5 text-white text-sm focus:ring-2 focus:ring-[#FDE047]">
                <SelectValue placeholder="Select payer" />
              </SelectTrigger>
              <SelectContent className="bg-[#171717] border-white/10 rounded-2xl text-white z-[200]">
                {group.members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id} className="focus:bg-white/10 focus:text-white">
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Participants + live preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA]">Split between</label>
              <span className="text-[11px] text-[#71717A]">Equal split</span>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] divide-y divide-white/[0.06]">
              {group.members.map((m) => {
                const checked = selectedUserIds.includes(m.user_id);
                const share = splitPreview[m.user_id] ?? 0;
                return (
                  <label
                    key={m.user_id}
                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-white/[0.02]"
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleParticipant(m.user_id)}
                        className="w-4 h-4 accent-[#FDE047]"
                      />
                      <span className="text-sm text-white">{m.name}</span>
                      {m.user_id === paidBy && (
                        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#FDE047]/15 text-[#FDE047] font-semibold">
                          Payer
                        </span>
                      )}
                    </span>
                    <span className={`text-sm font-medium ${checked ? 'text-white' : 'text-[#52525B]'}`}>
                      {checked ? formatINR(share / 100) : '—'}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            data-testid="split-expense-submit"
            disabled={loading}
            className="w-full rounded-full bg-[#FDE047] text-[#0A0A0A] font-bold h-12 hover:bg-[#FDE047]/90 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 text-sm tracking-wide uppercase"
          >
            {loading ? 'Saving...' : 'Add Expense'}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
