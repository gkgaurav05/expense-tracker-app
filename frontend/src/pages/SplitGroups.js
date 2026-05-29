import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Users2, Plus, ChevronRight } from 'lucide-react';
import { Link } from '@/lib/router';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import CreateGroupModal from '@/components/CreateGroupModal';

export default function SplitGroups() {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.listSplitGroups();
      setGroups(data);
    } catch {
      toast.error('Failed to load groups');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#FDE047] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 sm:px-6 md:px-10 py-8 md:py-12 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-['General_Sans'] text-3xl md:text-4xl font-bold tracking-tight">Split</h1>
          <p className="text-[#A1A1AA] mt-1 text-sm">Shared expenses, settled together.</p>
        </div>
        <button
          data-testid="create-group-btn"
          onClick={() => setCreateOpen(true)}
          className="rounded-full bg-[#FDE047] text-[#0A0A0A] font-bold px-5 h-11 hover:bg-[#FDE047]/90 transition-all hover:scale-105 active:scale-95 text-sm tracking-wide uppercase flex items-center gap-2"
        >
          <Plus size={16} strokeWidth={2.5} />
          New Group
        </button>
      </div>

      {/* Empty state */}
      {groups.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-[32px] p-12 text-center"
        >
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[#FDE047]/10 flex items-center justify-center mb-6">
            <Users2 size={28} className="text-[#FDE047]" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2 font-['General_Sans']">No groups yet</h3>
          <p className="text-[#A1A1AA] mb-8 max-w-md mx-auto text-sm">
            Create a group for trips, flatmates, or anything you split with friends. Add expenses, see balances, and settle up.
          </p>
          <button
            onClick={() => setCreateOpen(true)}
            className="rounded-full bg-[#FDE047] text-[#0A0A0A] font-bold px-6 h-11 hover:bg-[#FDE047]/90 transition-all hover:scale-105 active:scale-95 text-sm tracking-wide uppercase inline-flex items-center gap-2"
          >
            <Plus size={16} strokeWidth={2.5} />
            Create your first group
          </button>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groups.map((group) => (
            <GroupCard key={group.id} group={group} userId={user?.id} />
          ))}
        </div>
      )}

      <CreateGroupModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={fetchGroups}
      />
    </div>
  );
}

function GroupCard({ group, userId }) {
  return (
    <Link
      to={`/split/${group.id}`}
      className="glass-card rounded-3xl p-5 hover:bg-white/[0.04] transition-all group block"
      data-testid={`group-card-${group.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-white truncate font-['General_Sans']">{group.name}</h3>
          {group.description && (
            <p className="text-[#A1A1AA] text-xs mt-1 line-clamp-2">{group.description}</p>
          )}
        </div>
        <ChevronRight size={18} className="text-[#52525B] group-hover:text-[#FDE047] transition-colors flex-shrink-0" />
      </div>

      <div className="mt-4 flex items-center gap-2">
        <div className="flex -space-x-2">
          {group.members.slice(0, 4).map((m) => (
            <div
              key={m.user_id}
              className={`w-7 h-7 rounded-full border-2 border-[#0A0A0A] flex items-center justify-center text-[11px] font-bold uppercase ${
                m.user_id === userId
                  ? 'bg-[#FDE047] text-[#0A0A0A]'
                  : 'bg-white/[0.08] text-[#FDE047]'
              }`}
              title={m.name}
            >
              {m.name.charAt(0)}
            </div>
          ))}
          {group.members.length > 4 && (
            <div className="w-7 h-7 rounded-full border-2 border-[#0A0A0A] bg-white/[0.05] flex items-center justify-center text-[10px] text-[#A1A1AA] font-semibold">
              +{group.members.length - 4}
            </div>
          )}
        </div>
        <span className="text-xs text-[#A1A1AA] ml-1">
          {group.members.length} {group.members.length === 1 ? 'member' : 'members'}
        </span>
      </div>
    </Link>
  );
}
