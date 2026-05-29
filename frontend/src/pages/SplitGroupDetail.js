import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate, useParams } from '@/lib/router';
import {
  ArrowLeft,
  Plus,
  Users2,
  Receipt,
  Scale,
  HandCoins,
  ChevronRight,
  Trash2,
  ArrowRight,
  UserPlus,
  Trash,
} from 'lucide-react';
import { format } from 'date-fns';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, formatINR } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import AddSplitExpenseModal from '@/components/AddSplitExpenseModal';
import SettleUpModal from '@/components/SettleUpModal';
import AddMemberModal from '@/components/AddMemberModal';

export default function SplitGroupDetail() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [group, setGroup] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [balances, setBalances] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('expenses');

  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [settleDefaults, setSettleDefaults] = useState(null);
  const [addMemberOpen, setAddMemberOpen] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [groupRes, expensesRes, balancesRes, suggestionsRes, settlementsRes, catsRes] = await Promise.all([
        api.getSplitGroup(groupId),
        api.listSplitExpenses(groupId),
        api.getSplitBalances(groupId),
        api.getSettlementSuggestions(groupId),
        api.listSplitSettlements(groupId),
        api.getCategories(),
      ]);
      setGroup(groupRes.data);
      setExpenses(expensesRes.data);
      setBalances(balancesRes.data.balances);
      setSuggestions(suggestionsRes.data.suggestions);
      setSettlements(settlementsRes.data);
      setCategories(catsRes.data);
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (err.response?.status === 403 || err.response?.status === 404) {
        toast.error(detail || 'Group not found');
        navigate('/split');
      } else {
        toast.error('Failed to load group');
      }
    } finally {
      setLoading(false);
    }
  }, [groupId, navigate]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const memberById = useMemo(() => {
    const map = {};
    (group?.members || []).forEach((m) => { map[m.user_id] = m; });
    return map;
  }, [group]);

  const myBalance = useMemo(() => {
    const entry = balances.find((b) => b.user_id === user?.id);
    return entry?.net ?? 0;
  }, [balances, user]);

  const isAdmin = useMemo(() => {
    if (!group || !user) return false;
    const me = group.members.find((m) => m.user_id === user.id);
    return !!me?.is_admin;
  }, [group, user]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#FDE047] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!group) return null;

  const handleDeleteExpense = async (expenseId) => {
    if (!window.confirm('Delete this expense? This will also remove each member\'s mirrored personal entry.')) return;
    try {
      await api.deleteSplitExpense(groupId, expenseId);
      toast.success('Expense deleted');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete');
    }
  };

  const handleDeleteSettlement = async (settlementId) => {
    if (!window.confirm('Delete this settlement?')) return;
    try {
      await api.deleteSplitSettlement(groupId, settlementId);
      toast.success('Settlement deleted');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete');
    }
  };

  const handleRemoveMember = async (userId) => {
    if (!window.confirm('Remove this member from the group?')) return;
    try {
      await api.removeSplitGroupMember(groupId, userId);
      toast.success('Member removed');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to remove member');
    }
  };

  const useSuggestion = (suggestion) => {
    setSettleDefaults({
      from_user: suggestion.from_user,
      to_user: suggestion.to_user,
      amount: suggestion.amount,
    });
    setSettleOpen(true);
  };

  return (
    <div className="min-h-screen px-4 sm:px-6 md:px-10 py-8 md:py-12 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link to="/split" className="inline-flex items-center gap-2 text-sm text-[#A1A1AA] hover:text-white transition mb-4">
          <ArrowLeft size={16} />
          All groups
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="font-['General_Sans'] text-3xl md:text-4xl font-bold tracking-tight truncate">{group.name}</h1>
            {group.description && (
              <p className="text-[#A1A1AA] mt-1 text-sm">{group.description}</p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              data-testid="add-split-expense-btn"
              onClick={() => setAddExpenseOpen(true)}
              className="rounded-full bg-[#FDE047] text-[#0A0A0A] font-bold px-5 h-11 hover:bg-[#FDE047]/90 transition-all hover:scale-105 active:scale-95 text-sm tracking-wide uppercase flex items-center gap-2"
            >
              <Plus size={16} strokeWidth={2.5} />
              Add Expense
            </button>
            <button
              data-testid="settle-up-btn"
              onClick={() => { setSettleDefaults(null); setSettleOpen(true); }}
              className="rounded-full bg-white/5 border border-white/10 text-white px-5 h-11 hover:bg-white/10 transition-all text-sm uppercase tracking-wide font-semibold flex items-center gap-2"
            >
              <HandCoins size={16} />
              Settle Up
            </button>
          </div>
        </div>
      </div>

      {/* My balance summary */}
      <MyBalanceCard balance={myBalance} />

      {/* Tabs */}
      <div className="mt-8">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-white/[0.04] border border-white/[0.08] rounded-full p-1 inline-flex">
            <TabsTrigger value="expenses" className="rounded-full px-4 py-1.5 text-xs uppercase tracking-wider data-[state=active]:bg-[#FDE047] data-[state=active]:text-[#0A0A0A]">
              <Receipt size={14} className="mr-1.5" /> Expenses
            </TabsTrigger>
            <TabsTrigger value="balances" className="rounded-full px-4 py-1.5 text-xs uppercase tracking-wider data-[state=active]:bg-[#FDE047] data-[state=active]:text-[#0A0A0A]">
              <Scale size={14} className="mr-1.5" /> Balances
            </TabsTrigger>
            <TabsTrigger value="settlements" className="rounded-full px-4 py-1.5 text-xs uppercase tracking-wider data-[state=active]:bg-[#FDE047] data-[state=active]:text-[#0A0A0A]">
              <HandCoins size={14} className="mr-1.5" /> Settlements
            </TabsTrigger>
            <TabsTrigger value="members" className="rounded-full px-4 py-1.5 text-xs uppercase tracking-wider data-[state=active]:bg-[#FDE047] data-[state=active]:text-[#0A0A0A]">
              <Users2 size={14} className="mr-1.5" /> Members
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="mt-6">
        {tab === 'expenses' && (
          <ExpensesTab expenses={expenses} memberById={memberById} userId={user?.id} onDelete={handleDeleteExpense} />
        )}
        {tab === 'balances' && (
          <BalancesTab balances={balances} suggestions={suggestions} memberById={memberById} userId={user?.id} onSettle={useSuggestion} />
        )}
        {tab === 'settlements' && (
          <SettlementsTab settlements={settlements} memberById={memberById} userId={user?.id} onDelete={handleDeleteSettlement} />
        )}
        {tab === 'members' && (
          <MembersTab
            members={group.members}
            createdBy={group.created_by}
            currentUserId={user?.id}
            isAdmin={isAdmin}
            onAdd={() => setAddMemberOpen(true)}
            onRemove={handleRemoveMember}
          />
        )}
      </div>

      <AddSplitExpenseModal
        open={addExpenseOpen}
        onOpenChange={setAddExpenseOpen}
        group={group}
        categories={categories}
        onSuccess={fetchAll}
      />
      <SettleUpModal
        open={settleOpen}
        onOpenChange={setSettleOpen}
        group={group}
        defaults={settleDefaults}
        onSuccess={fetchAll}
      />
      <AddMemberModal
        open={addMemberOpen}
        onOpenChange={setAddMemberOpen}
        groupId={groupId}
        onSuccess={fetchAll}
      />
    </div>
  );
}

function MyBalanceCard({ balance }) {
  const isCreditor = balance > 0;
  const isDebtor = balance < 0;
  const label = isCreditor ? 'You are owed' : isDebtor ? 'You owe' : 'You are settled up';
  const colorClass = isCreditor ? 'text-emerald-400' : isDebtor ? 'text-red-400' : 'text-[#A1A1AA]';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-3xl p-6 flex items-center justify-between"
    >
      <div>
        <p className="text-xs uppercase tracking-[0.2em] font-semibold text-[#A1A1AA]">Your balance</p>
        <p className={`text-3xl font-bold mt-2 font-['General_Sans'] ${colorClass}`}>
          {formatINR(Math.abs(balance))}
        </p>
        <p className="text-sm text-[#A1A1AA] mt-1">{label}</p>
      </div>
      <div className="hidden sm:flex w-14 h-14 rounded-2xl bg-[#FDE047]/10 items-center justify-center">
        <Scale size={26} className="text-[#FDE047]" />
      </div>
    </motion.div>
  );
}

function ExpensesTab({ expenses, memberById, userId, onDelete }) {
  if (expenses.length === 0) {
    return (
      <div className="glass-card rounded-3xl p-10 text-center">
        <Receipt size={28} className="mx-auto text-[#FDE047] mb-4" />
        <p className="text-white font-semibold mb-1">No expenses yet</p>
        <p className="text-sm text-[#A1A1AA]">Add your first shared expense to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {expenses.map((exp) => {
        const payer = memberById[exp.paid_by];
        const myShare = exp.participants.find((p) => p.user_id === userId)?.share ?? 0;
        const youPaid = exp.paid_by === userId;
        return (
          <div
            key={exp.id}
            className="glass-card-sm rounded-2xl p-4 flex items-center gap-4"
            data-testid={`split-expense-${exp.id}`}
          >
            <div className="w-11 h-11 rounded-xl bg-white/[0.05] flex flex-col items-center justify-center flex-shrink-0">
              <span className="text-xs text-[#A1A1AA] uppercase tracking-wide leading-none">
                {format(new Date(exp.date + 'T00:00:00'), 'MMM')}
              </span>
              <span className="text-base text-white font-bold leading-none mt-0.5">
                {format(new Date(exp.date + 'T00:00:00'), 'd')}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white font-semibold truncate">{exp.description}</p>
              <p className="text-xs text-[#A1A1AA] mt-0.5">
                {payer?.name || 'Unknown'} paid · {exp.category} · split {exp.participants.length} ways
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-white font-bold">{formatINR(exp.amount)}</p>
              <p className={`text-[11px] mt-0.5 ${youPaid ? 'text-emerald-400' : 'text-[#A1A1AA]'}`}>
                {youPaid ? `you paid` : `your share ${formatINR(myShare)}`}
              </p>
            </div>
            <button
              onClick={() => onDelete(exp.id)}
              className="text-[#52525B] hover:text-red-400 transition-colors p-1 ml-1"
              aria-label="Delete expense"
            >
              <Trash2 size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function BalancesTab({ balances, suggestions, memberById, userId, onSettle }) {
  const allSettled = balances.every((b) => b.net === 0);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm uppercase tracking-[0.2em] font-semibold text-[#A1A1AA] mb-3">Per member</h3>
        <div className="glass-card rounded-3xl divide-y divide-white/[0.06]">
          {balances.map((b) => {
            const member = memberById[b.user_id];
            const isMe = b.user_id === userId;
            const owed = b.net > 0;
            const owes = b.net < 0;
            return (
              <div key={b.user_id} className="flex items-center justify-between px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold uppercase ${
                    isMe ? 'bg-[#FDE047] text-[#0A0A0A]' : 'bg-white/[0.08] text-[#FDE047]'
                  }`}>
                    {member?.name.charAt(0) || '?'}
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">
                      {member?.name || 'Unknown'} {isMe && <span className="text-[#71717A] text-xs">(you)</span>}
                    </p>
                  </div>
                </div>
                <span className={`text-sm font-semibold ${
                  owed ? 'text-emerald-400' : owes ? 'text-red-400' : 'text-[#71717A]'
                }`}>
                  {b.net === 0 ? 'settled' : owed ? `+${formatINR(b.net)}` : `-${formatINR(Math.abs(b.net))}`}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-sm uppercase tracking-[0.2em] font-semibold text-[#A1A1AA] mb-3">
          Suggested settlements
        </h3>
        {allSettled || suggestions.length === 0 ? (
          <div className="glass-card-sm rounded-2xl p-6 text-center">
            <p className="text-emerald-400 font-semibold">All settled up</p>
            <p className="text-xs text-[#A1A1AA] mt-1">No payments needed.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {suggestions.map((s, idx) => {
              const from = memberById[s.from_user];
              const to = memberById[s.to_user];
              const fromIsMe = s.from_user === userId;
              return (
                <div
                  key={idx}
                  className="glass-card-sm rounded-2xl p-4 flex items-center gap-3"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-white text-sm truncate">
                      <span className="font-semibold">{fromIsMe ? 'You' : from?.name}</span>
                      {' '}pay{fromIsMe ? '' : 's'}{' '}
                      <span className="font-semibold">{to?.user_id === userId ? 'you' : to?.name}</span>
                    </span>
                    <ArrowRight size={14} className="text-[#52525B]" />
                    <span className="text-white font-bold">{formatINR(s.amount)}</span>
                  </div>
                  <button
                    onClick={() => onSettle(s)}
                    className="rounded-full bg-[#FDE047] text-[#0A0A0A] font-bold px-3 h-8 hover:bg-[#FDE047]/90 text-xs uppercase tracking-wide flex items-center gap-1"
                  >
                    Record <ChevronRight size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SettlementsTab({ settlements, memberById, userId, onDelete }) {
  if (settlements.length === 0) {
    return (
      <div className="glass-card rounded-3xl p-10 text-center">
        <HandCoins size={28} className="mx-auto text-[#FDE047] mb-4" />
        <p className="text-white font-semibold mb-1">No settlements recorded</p>
        <p className="text-sm text-[#A1A1AA]">When members pay each other back, they'll appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {settlements.map((s) => {
        const from = memberById[s.from_user];
        const to = memberById[s.to_user];
        const fromIsMe = s.from_user === userId;
        const toIsMe = s.to_user === userId;
        return (
          <div key={s.id} className="glass-card-sm rounded-2xl p-4 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-white/[0.05] flex flex-col items-center justify-center flex-shrink-0">
              <span className="text-xs text-[#A1A1AA] uppercase tracking-wide leading-none">
                {format(new Date(s.date + 'T00:00:00'), 'MMM')}
              </span>
              <span className="text-base text-white font-bold leading-none mt-0.5">
                {format(new Date(s.date + 'T00:00:00'), 'd')}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white text-sm">
                <span className="font-semibold">{fromIsMe ? 'You' : from?.name}</span>
                {' '}paid{' '}
                <span className="font-semibold">{toIsMe ? 'you' : to?.name}</span>
              </p>
              {s.note && <p className="text-xs text-[#A1A1AA] mt-0.5 truncate">{s.note}</p>}
            </div>
            <p className="text-white font-bold">{formatINR(s.amount)}</p>
            <button
              onClick={() => onDelete(s.id)}
              className="text-[#52525B] hover:text-red-400 transition-colors p-1"
              aria-label="Delete settlement"
            >
              <Trash2 size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function MembersTab({ members, createdBy, currentUserId, isAdmin, onAdd, onRemove }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm uppercase tracking-[0.2em] font-semibold text-[#A1A1AA]">
          {members.length} {members.length === 1 ? 'member' : 'members'}
        </h3>
        {isAdmin && (
          <button
            onClick={onAdd}
            className="rounded-full bg-white/5 border border-white/10 text-white px-4 h-9 hover:bg-white/10 transition-all text-xs uppercase tracking-wide font-semibold flex items-center gap-2"
          >
            <UserPlus size={14} />
            Add member
          </button>
        )}
      </div>
      <div className="glass-card rounded-3xl divide-y divide-white/[0.06]">
        {members.map((m) => {
          const isMe = m.user_id === currentUserId;
          const isCreator = m.user_id === createdBy;
          return (
            <div key={m.user_id} className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold uppercase ${
                  isMe ? 'bg-[#FDE047] text-[#0A0A0A]' : 'bg-white/[0.08] text-[#FDE047]'
                }`}>
                  {m.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    {m.name} {isMe && <span className="text-[#71717A] text-xs">(you)</span>}
                  </p>
                  <p className="text-xs text-[#A1A1AA] truncate">{m.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {m.is_admin && (
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#FDE047]/15 text-[#FDE047] font-semibold">
                    Admin
                  </span>
                )}
                {isAdmin && !isCreator && !isMe && (
                  <button
                    onClick={() => onRemove(m.user_id)}
                    className="text-[#52525B] hover:text-red-400 transition-colors p-1"
                    aria-label="Remove member"
                  >
                    <Trash size={16} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
