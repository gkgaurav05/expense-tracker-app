import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, X } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { useSubmitOnCmdEnter } from '@/lib/useSubmitOnCmdEnter';

export default function CreateGroupModal({ open, onOpenChange, onSuccess }) {
  const formRef = useRef(null);
  useSubmitOnCmdEnter(formRef, open);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
      setEmailInput('');
      setEmails([]);
    }
  }, [open]);

  const addEmail = () => {
    const trimmed = emailInput.trim().toLowerCase();
    if (!trimmed) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error('Invalid email address');
      return;
    }
    if (emails.includes(trimmed)) {
      toast.error('Email already added');
      return;
    }
    setEmails([...emails, trimmed]);
    setEmailInput('');
  };

  const removeEmail = (email) => setEmails(emails.filter((e) => e !== email));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Group name is required');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.createSplitGroup({
        name: name.trim(),
        description: description.trim() || null,
        member_emails: emails,
      });
      toast.success('Group created');
      if (data.unresolved_emails?.length) {
        toast.message('Some emails were not registered users', {
          description: data.unresolved_emails.join(', '),
        });
      }
      onSuccess?.(data);
      onOpenChange(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create group');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0A0A0A]/95 backdrop-blur-3xl border border-white/[0.08] rounded-[32px] p-8 max-w-md text-white z-[100]">
        <DialogHeader>
          <DialogTitle className="font-['General_Sans'] text-2xl font-bold tracking-tight">
            Create Group
          </DialogTitle>
        </DialogHeader>
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-5 mt-4">
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA]">Name</label>
            <input
              data-testid="group-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Trip to Goa"
              maxLength={80}
              className="pill-input w-full"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA]">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              maxLength={500}
              className="pill-input w-full"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA]">
              Add Members <span className="text-[#71717A] normal-case">(by email)</span>
            </label>
            <div className="flex gap-2">
              <input
                data-testid="group-member-email-input"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addEmail())}
                placeholder="friend@example.com"
                className="pill-input flex-1"
              />
              <button
                type="button"
                onClick={addEmail}
                className="rounded-full bg-white/5 border border-white/10 w-12 h-12 flex items-center justify-center text-[#A1A1AA] hover:bg-white/10 hover:text-white transition-all"
              >
                <Plus size={18} />
              </button>
            </div>
            {emails.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {emails.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] border border-white/[0.1] text-white text-xs px-3 py-1.5"
                  >
                    {email}
                    <button
                      type="button"
                      onClick={() => removeEmail(email)}
                      className="text-[#A1A1AA] hover:text-red-400"
                      aria-label={`Remove ${email}`}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-[11px] text-[#71717A] pt-1">
              Members must already have a Spendrax account. Unrecognized emails will be flagged.
            </p>
          </div>

          <button
            type="submit"
            data-testid="group-create-submit"
            disabled={loading}
            className="w-full rounded-full bg-[#FDE047] text-[#0A0A0A] font-bold h-12 hover:bg-[#FDE047]/90 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 text-sm tracking-wide uppercase"
          >
            {loading ? 'Creating...' : 'Create Group'}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
