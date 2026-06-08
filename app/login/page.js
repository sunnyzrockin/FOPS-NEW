'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Eye, EyeOff, CheckCircle2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { signIn, user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Removed automatic redirect that causes loops
  // The manual redirect after login (line 57) handles navigation
  // useEffect(() => {
  //   if (user && !authLoading) {
  //     router.push('/app');
  //   }
  // }, [user, authLoading, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Call API directly instead of using Supabase client (which hangs)
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const userData = await res.json();

      if (!res.ok) {
        setError(userData.error || 'Invalid email or password');
        setLoading(false);
        return;
      }

      // Store user data and session (use correct keys that App component expects)
      localStorage.setItem('workflowlite_user', JSON.stringify(userData.user));
      localStorage.setItem('workflowlite_sites', JSON.stringify(userData.sites || []));
      if (userData.session) {
        localStorage.setItem('supabase-session', JSON.stringify(userData.session));

        // Also hand the session to the browser Supabase client so it
        // writes the sb-*-auth-token HTTP cookies. The new server-side
        // middleware (Section 1) reads those cookies via
        // supabase.auth.getUser() to gate /app/*. Without this, the
        // middleware would redirect back to /login in a loop.
        try {
          const { createBrowserClient } = await import('@/lib/supabase');
          const sb = createBrowserClient();
          await sb.auth.setSession({
            access_token: userData.session.access_token,
            refresh_token: userData.session.refresh_token,
          });
        } catch (cookieErr) {
          // Non-fatal — localStorage fallback still works for the UI.
          console.warn('Could not persist Supabase cookie session:', cookieErr);
        }
      }

      // Small delay to ensure localStorage is written before redirect
      await new Promise(resolve => setTimeout(resolve, 100));

      // Redirect to dashboard using window.location for guaranteed navigation
      window.location.href = '/app';
      
    } catch (err) {
      console.error('Login error:', err);
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-12 flex-col justify-between">
        <div>
          {/* Logo */}
          <div className="flex items-center gap-3 mb-16">
            <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">F</span>
            </div>
            <div>
              <h1 className="text-white text-2xl font-bold">FOPS</h1>
              <p className="text-slate-400 text-xs">Field Operations System</p>
            </div>
          </div>

          {/* Welcome Message */}
          <div className="max-w-md">
            <h2 className="text-4xl font-bold text-white mb-4">Welcome back</h2>
            <p className="text-slate-300 text-lg mb-8">
              Sign in to view reports, manage sites, and monitor daily performance.
            </p>

            {/* Value Bullets */}
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-teal-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-white font-medium">Multi-site visibility</p>
                  <p className="text-slate-400 text-sm">Monitor all locations from one dashboard</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-teal-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-white font-medium">Shift reporting</p>
                  <p className="text-slate-400 text-sm">Real-time updates from your team</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-teal-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-white font-medium">Banking and pricing insights</p>
                  <p className="text-slate-400 text-sm">Automated calculations and competitor tracking</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-slate-500 text-sm">
          © 2025 FOPS. Internal operations platform.
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">F</span>
            </div>
            <div>
              <h1 className="text-slate-900 text-2xl font-bold">FOPS</h1>
              <p className="text-slate-600 text-xs">Field Operations System</p>
            </div>
          </div>

          {/* Login Card */}
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Login</h2>
              <p className="text-slate-600">Access your FOPS workspace</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <Alert variant="destructive" className="bg-red-50 border-red-200">
                  <AlertDescription className="text-red-800">{error}</AlertDescription>
                </Alert>
              )}

              {/* Email Field */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-700 font-medium">
                  Email address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="h-12 text-base"
                />
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="password" className="text-slate-700 font-medium">
                    Password
                  </Label>
                  <Link 
                    href="/forgot-password" 
                    className="text-sm text-teal-600 hover:text-teal-700 font-medium"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    className="h-12 text-base pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                    disabled={loading}
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <Button 
                type="submit" 
                className="w-full h-12 text-base font-semibold bg-teal-600 hover:bg-teal-700"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Login to FOPS'
                )}
              </Button>
            </form>

            {/* Footer Info */}
            <div className="mt-8 pt-6 border-t border-slate-200 space-y-3">
              <p className="text-sm text-slate-600 text-center">
                Role-based access for owners, operators, and staff
              </p>
              <p className="text-sm text-slate-500 text-center">
                Need access? <span className="font-medium text-slate-700">Contact your administrator.</span>
              </p>
              
              {/* Signup Link - Subtle but accessible */}
              <div className="pt-3 border-t border-slate-100">
                <p className="text-sm text-slate-600 text-center">
                  Don't have an account?{' '}
                  <Link href="/signup" className="text-teal-600 hover:text-teal-700 font-medium transition-colors">
                    Sign up
                  </Link>
                </p>
              </div>
            </div>
          </div>

          {/* Additional Help */}
          <div className="mt-6 text-center">
            <Link href="/" className="text-sm text-slate-600 hover:text-slate-900">
              ← Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
