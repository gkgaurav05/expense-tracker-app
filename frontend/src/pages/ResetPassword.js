import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Lock, CheckCircle, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { getResetPasswordValidationError } from '@/lib/authValidation';
import { Link, useSearchParams, useNavigate } from '@/lib/router';
import { toast } from 'sonner';

const spring = { type: 'spring', bounce: 0.3, duration: 0.6 };

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    const validationError = getResetPasswordValidationError(password, confirmPassword);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setLoading(true);
    setError('');

    try {
      await api.resetPassword(token, password);
      setSuccess(true);
      toast.success('Password reset successfully!');
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          className="w-full max-w-md"
        >
          <div className="glass-card text-center">
            <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-4">
              <XCircle size={32} className="text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Invalid Link</h2>
            <p className="text-[#A1A1AA] text-sm mb-6">
              This password reset link is invalid or has expired.
            </p>
            <Link
              to="/forgot-password"
              className="inline-block px-6 py-2 bg-[#FDE047] text-[#0A0A0A] font-semibold rounded-xl hover:bg-[#FDE047]/90 transition-all"
            >
              Request New Link
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

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
          <p className="text-sm text-[#A1A1AA] mt-2">Create a new password</p>
        </div>

        <div className="glass-card">
          {success ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-4"
            >
              <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={32} className="text-green-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Password Reset!</h2>
              <p className="text-[#A1A1AA] text-sm mb-6">
                Your password has been reset successfully. Redirecting to login...
              </p>
              <Link
                to="/login"
                className="inline-block px-6 py-2 bg-[#FDE047] text-[#0A0A0A] font-semibold rounded-xl hover:bg-[#FDE047]/90 transition-all"
              >
                Go to Login
              </Link>
            </motion.div>
          ) : (
            <>
              {error && (
                <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="text-xs uppercase tracking-[0.15em] font-semibold text-[#A1A1AA] block mb-2">
                    New Password
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

                <div>
                  <label className="text-xs uppercase tracking-[0.15em] font-semibold text-[#A1A1AA] block mb-2">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1A1AA]" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
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
                    <><Loader2 size={18} className="animate-spin" /> Resetting...</>
                  ) : (
                    'Reset Password'
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
