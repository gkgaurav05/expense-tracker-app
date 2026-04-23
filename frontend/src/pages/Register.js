import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Mail, Lock, User, UserPlus } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getRegisterValidationError } from '@/lib/authValidation';
import { Link, useNavigate } from '@/lib/router';
import { toast } from 'sonner';

const spring = { type: 'spring', bounce: 0.3, duration: 0.6 };

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = getRegisterValidationError(name, email, password);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setLoading(true);
    try {
      await register(name, email, password);
      toast.success('Account created successfully!');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold tracking-tight font-['General_Sans'] text-[#FDE047]">Spendrax</h1>
          <p className="text-sm text-[#A1A1AA] mt-2">Create your account</p>
        </div>

        <div className="glass-card">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-xs uppercase tracking-[0.15em] font-semibold text-[#A1A1AA] block mb-2">
                Name
              </label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1A1AA]" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-[#FDE047]/50 transition-colors"
                  placeholder="Your name"
                />
              </div>
            </div>

            <div>
              <label className="text-xs uppercase tracking-[0.15em] font-semibold text-[#A1A1AA] block mb-2">
                Email
              </label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1A1AA]" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-[#FDE047]/50 transition-colors"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <label className="text-xs uppercase tracking-[0.15em] font-semibold text-[#A1A1AA] block mb-2">
                Password
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1A1AA]" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-[#FDE047]/50 transition-colors"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#FDE047] text-[#0A0A0A] font-bold py-3 flex items-center justify-center gap-2 hover:bg-[#FDE047]/90 transition-all disabled:opacity-50 text-sm tracking-wide uppercase"
            >
              {loading ? (
                <><Loader2 size={18} className="animate-spin" /> Creating account...</>
              ) : (
                <><UserPlus size={18} /> Sign Up</>
              )}
            </button>
          </form>

          <p className="text-center text-sm text-[#A1A1AA] mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-[#FDE047] font-semibold hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
