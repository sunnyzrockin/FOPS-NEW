'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, ShieldAlert, Eye, EyeOff, Loader2 } from 'lucide-react';

/**
 * /founder — hidden, single-purpose login page for the FOPS platform
 * support/founder layer. Not linked anywhere in the app; only reachable
 * by typing the URL.
 */
export default function FounderLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Login failed');
        return;
      }
      if (data?.user?.role !== 'support') {
        setError('This area is reserved for FOPS Support. Use the regular /login page.');
        return;
      }
      // Persist the same way the rest of the app does, plus a marker so
      // /founder/dashboard knows this is a support session.
      localStorage.setItem('fopsapp_user', JSON.stringify(data.user));
      localStorage.setItem('fopsapp_sites', JSON.stringify(data.sites || []));
      localStorage.setItem('supabase-session', JSON.stringify(data.session));
      localStorage.setItem('fops_support_session', '1');
      router.replace('/founder/dashboard');
    } catch (e) {
      setError(e?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
      <Card className="w-full max-w-md border-0 shadow-2xl bg-slate-900/80 backdrop-blur ring-1 ring-slate-700">
        <CardContent className="p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto w-14 h-14 rounded-xl bg-amber-600 flex items-center justify-center shadow-lg">
              <ShieldAlert className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">FOPS Founder</h1>
            <p className="text-xs text-slate-400">
              Restricted area — platform support only.<br/>
              All access is recorded in the audit log.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-slate-300 text-xs">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                placeholder="founder@fops.platform"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-slate-300 text-xs">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((p) => !p)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {error && (
              <div className="p-3 rounded-md bg-red-900/40 border border-red-700 text-red-200 text-sm">
                {error}
              </div>
            )}
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-600 hover:opacity-90 text-white gap-2"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              Sign in
            </Button>
          </form>

          <p className="text-[10px] text-slate-500 text-center">
            Not authorized? Close this page. Attempts are logged.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
