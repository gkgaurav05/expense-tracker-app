import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Receipt, PiggyBank, LogOut, Shield } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/context/AuthContext';

const baseNavItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/expenses', icon: Receipt, label: 'Expenses' },
  { to: '/budgets', icon: PiggyBank, label: 'Budgets' },
];

const adminNavItem = { to: '/admin', icon: Shield, label: 'Admin' };

export default function Sidebar() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const isAdmin = user?.role === 'admin';
  const navItems = isAdmin ? [...baseNavItems, adminNavItem] : baseNavItems;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <TooltipProvider delayDuration={0}>
      {/* Desktop */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-20 flex-col items-center py-8 gap-4 bg-white/[0.03] backdrop-blur-3xl border-r border-white/[0.08] z-40">
        <div
          data-testid="app-logo"
          className="w-11 h-11 rounded-full bg-[#FDE047] flex items-center justify-center font-black text-[#0A0A0A] text-xl mb-8 shadow-lg shadow-[#FDE047]/20"
        >
          S
        </div>
        {navItems.map((item) => (
          <Tooltip key={item.to}>
            <TooltipTrigger asChild>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                data-testid={`nav-${item.label.toLowerCase()}`}
                className={({ isActive }) =>
                  `w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200 ${
                    isActive
                      ? 'bg-[#FDE047] text-[#0A0A0A] shadow-lg shadow-[#FDE047]/20'
                      : 'text-[#A1A1AA] hover:bg-white/[0.08] hover:text-white'
                  }`
                }
              >
                <item.icon size={22} strokeWidth={2.2} />
              </NavLink>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-[#171717] border-white/10 text-white">
              {item.label}
            </TooltipContent>
          </Tooltip>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* User info & Logout */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="w-10 h-10 rounded-full bg-white/[0.08] flex items-center justify-center text-[#FDE047] font-bold text-sm uppercase">
              {user?.name?.charAt(0) || 'U'}
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className="bg-[#171717] border-white/10 text-white">
            {user?.name || 'User'}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleLogout}
              data-testid="nav-logout"
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-[#A1A1AA] hover:bg-red-500/20 hover:text-red-400 transition-all duration-200"
            >
              <LogOut size={22} strokeWidth={2.2} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="bg-[#171717] border-white/10 text-white">
            Logout
          </TooltipContent>
        </Tooltip>
      </aside>

      {/* Mobile bottom bar */}
      <nav
        data-testid="mobile-nav"
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex justify-around items-center h-16 bg-[#0A0A0A]/95 backdrop-blur-xl border-t border-white/[0.08]"
      >
        {navItems.slice(0, 5).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            data-testid={`mobile-nav-${item.label.toLowerCase()}`}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 text-[10px] uppercase tracking-wider font-medium transition-colors ${
                isActive ? 'text-[#FDE047]' : 'text-[#A1A1AA]'
              }`
            }
          >
            <item.icon size={20} strokeWidth={2.2} />
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button
          onClick={handleLogout}
          className="flex flex-col items-center gap-0.5 text-[10px] uppercase tracking-wider font-medium text-[#A1A1AA]"
        >
          <LogOut size={20} strokeWidth={2.2} />
          <span>Logout</span>
        </button>
      </nav>
    </TooltipProvider>
  );
}
