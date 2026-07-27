'use client';

import React, { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/app/contexts/AuthContext';
import { useToast } from '@/app/components/Toast';

function AuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, signup, user } = useAuth();
  const { toast } = useToast();

  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (searchParams.get('signup') === 'true') {
      setIsSignup(true);
    } else {
      setIsSignup(false);
    }
  }, [searchParams]);

  useEffect(() => {
    if (user) {
      router.push('/');
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast('Please fill in all required fields', 'error');
      return;
    }
    if (password.length < 8) {
      toast('Password must be at least 8 characters long', 'error');
      return;
    }

    setLoading(true);
    try {
      if (isSignup) {
        const result = await signup(email, password, phone || undefined);
        toast('Account created! Please log in.', 'success');
        setIsSignup(false);
        setPassword('');
      } else {
        await login(email, password);
        toast('Logged in successfully!', 'success');
        router.push('/');
      }
    } catch (err: any) {
      toast(err.message || 'Authentication failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center py-16 px-4 bg-gradient-to-b from-[var(--background)] to-[var(--background-secondary)]">
      {/* Radial Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-violet-600/5 blur-[100px] pointer-events-none" />

      <div className="w-full max-w-md glass-card p-8 animate-fadeIn relative z-10">
        {/* Toggle tabs */}
        <div className="flex border-b border-[var(--border)] mb-8">
          <button
            onClick={() => setIsSignup(false)}
            className={`flex-1 pb-3 text-sm font-semibold tracking-wider uppercase border-b-2 transition-all cursor-pointer ${
              !isSignup
                ? 'border-[var(--primary)] text-white'
                : 'border-transparent text-[var(--foreground-muted)] hover:text-white'
            }`}
          >
            Login
          </button>
          <button
            onClick={() => setIsSignup(true)}
            className={`flex-1 pb-3 text-sm font-semibold tracking-wider uppercase border-b-2 transition-all cursor-pointer ${
              isSignup
                ? 'border-[var(--primary)] text-white'
                : 'border-transparent text-[var(--foreground-muted)] hover:text-white'
            }`}
          >
            Sign Up
          </button>
        </div>

        <h2 className="text-2xl font-bold text-white mb-6 text-center">
          {isSignup ? 'Create your Account' : 'Welcome Back'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="input-label">Email Address *</label>
            <input
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              required
            />
          </div>

          {isSignup && (
            <div>
              <label className="input-label">Phone Number (Optional)</label>
              <input
                type="tel"
                placeholder="+1234567890"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="input-field"
              />
            </div>
          )}

          <div>
            <label className="input-label">Password *</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              required
            />
          </div>

          <button type="submit" disabled={loading} className="w-full btn-primary py-3 font-semibold mt-4">
            {loading ? 'Processing...' : isSignup ? 'Register & Get Started' : 'Sign In'}
          </button>
        </form>

        <p className="text-xs text-center text-[var(--foreground-muted)] mt-6">
          {isSignup ? (
            <>
              Already have an account?{' '}
              <button onClick={() => setIsSignup(false)} className="text-[var(--primary)] hover:underline">
                Log in
              </button>
            </>
          ) : (
            <>
              Don&apos;t have an account yet?{' '}
              <button onClick={() => setIsSignup(true)} className="text-[var(--primary)] hover:underline">
                Create account
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="page-container">Preparing sign in…</div>}>
      <AuthContent />
    </Suspense>
  );
}
