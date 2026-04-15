import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';

const spring = { type: 'spring', bounce: 0.3, duration: 0.6 };

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) {
      toast.error('Please enter your email');
      return;
    }
    setLoading(true);
    try {
      await api.forgotPassword(email);
      setSubmitted(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Something went wrong');
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
          <p className="text-sm text-[#A1A1AA] mt-2">Reset your password</p>
        </div>

        <div className="glass-card">
          {submitted ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-4"
            >
              <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={32} className="text-green-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Check your email</h2>
              <p className="text-[#A1A1AA] text-sm mb-6">
                If an account exists for {email}, you'll receive a password reset link shortly.
              </p>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-[#FDE047] font-semibold hover:underline text-sm"
              >
                <ArrowLeft size={16} /> Back to login
              </Link>
            </motion.div>
          ) : (
            <>
              <p className="text-[#A1A1AA] text-sm mb-6">
                Enter your email address and we'll send you a link to reset your password.
              </p>
              <form onSubmit={handleSubmit} className="space-y-5">
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

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-[#FDE047] text-[#0A0A0A] font-bold py-3 flex items-center justify-center gap-2 hover:bg-[#FDE047]/90 transition-all disabled:opacity-50 text-sm tracking-wide uppercase"
                >
                  {loading ? (
                    <><Loader2 size={18} className="animate-spin" /> Sending...</>
                  ) : (
                    'Send Reset Link'
                  )}
                </button>
              </form>

              <p className="text-center text-sm text-[#A1A1AA] mt-6">
                <Link to="/login" className="text-[#FDE047] font-semibold hover:underline inline-flex items-center gap-1">
                  <ArrowLeft size={14} /> Back to login
                </Link>
              </p>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
