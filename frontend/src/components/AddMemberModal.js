import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { toast } from 'sonner';

export default function AddMemberModal({ open, onOpenChange, groupId, onSuccess }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setEmail('');
  }, [open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error('Invalid email address');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.addSplitGroupMember(groupId, trimmed);
      toast.success('Member added');
      onSuccess?.(data);
      onOpenChange(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add member');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0A0A0A]/95 backdrop-blur-3xl border border-white/[0.08] rounded-[32px] p-8 max-w-md text-white z-[100]">
        <DialogHeader>
          <DialogTitle className="font-['General_Sans'] text-2xl font-bold tracking-tight">
            Add Member
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA]">Email</label>
            <input
              data-testid="add-member-email-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="friend@example.com"
              className="pill-input w-full"
              autoFocus
            />
            <p className="text-[11px] text-[#71717A] pt-1">
              The user must already be registered on Spendrax.
            </p>
          </div>

          <button
            type="submit"
            data-testid="add-member-submit"
            disabled={loading}
            className="w-full rounded-full bg-[#FDE047] text-[#0A0A0A] font-bold h-12 hover:bg-[#FDE047]/90 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 text-sm tracking-wide uppercase"
          >
            {loading ? 'Adding...' : 'Add Member'}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
