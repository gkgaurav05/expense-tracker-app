import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { useSubmitOnCmdEnter } from '@/lib/useSubmitOnCmdEnter';

export default function SettleUpModal({ open, onOpenChange, group, defaults, onSuccess }) {
  const formRef = useRef(null);
  useSubmitOnCmdEnter(formRef, open);
  const [fromUser, setFromUser] = useState('');
  const [toUser, setToUser] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && group) {
      const members = group.members || [];
      setFromUser(defaults?.from_user || members[0]?.user_id || '');
      setToUser(defaults?.to_user || members[1]?.user_id || '');
      setAmount(defaults?.amount ? String(defaults.amount) : '');
      setDate(new Date());
      setNote('');
    }
  }, [open, group, defaults]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (!fromUser || !toUser) {
      toast.error('Pick payer and receiver');
      return;
    }
    if (fromUser === toUser) {
      toast.error('Payer and receiver must differ');
      return;
    }
    setLoading(true);
    try {
      // Idempotency key prevents accidental double-submit duplicates server-side.
      const idempotencyKey = `${group.id}:${fromUser}:${toUser}:${numAmount}:${format(date, 'yyyy-MM-dd')}:${Date.now()}`;
      await api.createSplitSettlement(group.id, {
        from_user: fromUser,
        to_user: toUser,
        amount: numAmount,
        date: format(date, 'yyyy-MM-dd'),
        note: note.trim() || null,
        idempotency_key: idempotencyKey,
      });
      toast.success('Settlement recorded');
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to record settlement');
    } finally {
      setLoading(false);
    }
  };

  if (!group) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0A0A0A]/95 backdrop-blur-3xl border border-white/[0.08] rounded-[32px] p-8 max-w-md text-white z-[100]">
        <DialogHeader>
          <DialogTitle className="font-['General_Sans'] text-2xl font-bold tracking-tight">
            Settle Up
          </DialogTitle>
        </DialogHeader>
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-5 mt-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA]">From</label>
              <Select value={fromUser} onValueChange={setFromUser}>
                <SelectTrigger className="h-12 rounded-full bg-white/[0.05] border border-white/[0.1] px-5 text-white text-sm focus:ring-2 focus:ring-[#FDE047]">
                  <SelectValue placeholder="Payer" />
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

            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA]">To</label>
              <Select value={toUser} onValueChange={setToUser}>
                <SelectTrigger className="h-12 rounded-full bg-white/[0.05] border border-white/[0.1] px-5 text-white text-sm focus:ring-2 focus:ring-[#FDE047]">
                  <SelectValue placeholder="Receiver" />
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
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA]">Amount</label>
            <div className="relative">
              {!amount && (
                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-[#A1A1AA] font-semibold text-sm pointer-events-none">Rs.</span>
              )}
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={amount ? '' : '0'}
                className="pill-input w-full pl-12"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA]">Date</label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="pill-input w-full flex items-center justify-between text-left"
                >
                  <span>{format(date, 'PPP')}</span>
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

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA]">Note</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional"
              maxLength={200}
              className="pill-input w-full"
            />
          </div>

          <button
            type="submit"
            data-testid="settle-up-submit"
            disabled={loading}
            className="w-full rounded-full bg-[#FDE047] text-[#0A0A0A] font-bold h-12 hover:bg-[#FDE047]/90 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 text-sm tracking-wide uppercase"
          >
            {loading ? 'Recording...' : 'Record Settlement'}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
