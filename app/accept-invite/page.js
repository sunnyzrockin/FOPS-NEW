'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, AlertTriangle, Lock, Mail, User, Building2 } from 'lucide-react';

function AcceptInviteContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token');

  const [status, setStatus] = useState('loading'); // loading | valid | invalid | accepting | accepted
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      setError('No invite token provided. Please check the link in your email.');
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/invites/accept?token=${encodeURIComponent(token)}`, {
          cache: 'no-store',
        });
        const data = await res.json();
        if (!res.ok || !data.valid) {
          setStatus('invalid');
          setError(data.error || 'This invitation is no longer valid.');
          return;
        }
        setInvite(data);
        setStatus('valid');
      } catch (e) {
        setStatus('invalid');
        setError('Failed to validate invite. Please try again.');
      }
    })();
  }, [token]);

  const handleAccept = async (e) => {
    e?.preventDefault?.();
    setError('');
    if (!name.trim()) return setError('Please enter your name');
    if (password.length < 8) return setError('Password must be at least 8 characters');
    if (password !== confirmPassword) return setError('Passwords do not match');

    setStatus('accepting');
    try {
      const res = await fetch('/api/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name: name.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.hint || data.message || data.error || 'Failed to create account');
        setStatus('valid');
        return;
      }
      setStatus('accepted');
      // Redirect to login after 2.5s
      setTimeout(() => router.push('/login'), 2500);
    } catch (err) {
      setError('Network error. Please try again.');
      setStatus('valid');
    }
  };

  // ---------- Render states ----------
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-teal-50 px-4">
        <div className="flex flex-col items-center gap-3 text-slate-600">
          <Loader2 className="h-10 w-10 animate-spin text-teal-500" />
          <p>Validating your invitation...</p>
        </div>
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-teal-50 px-4">
        <Card className="max-w-md w-full border-red-200">
          <CardHeader>
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-7 w-7 text-red-500" />
              <CardTitle className="text-xl">Invitation Invalid</CardTitle>
            </div>
            <CardDescription>{error || 'This invitation is no longer valid.'}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={() => router.push('/login')}>
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'accepted') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-emerald-50 px-4">
        <Card className="max-w-md w-full border-emerald-200">
          <CardHeader>
            <div className="flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-emerald-500" />
              <CardTitle className="text-xl">Account Created!</CardTitle>
            </div>
            <CardDescription>
              Welcome to FOPS. Redirecting you to login...
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => router.push('/login')}>
              Login Now
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // status === 'valid' or 'accepting'
  const roleLabel = invite?.role === 'staff' ? 'Staff' : invite?.role === 'operator' ? 'Operator' : 'Owner';
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-teal-50 px-4 py-10">
      <Card className="max-w-md w-full shadow-xl">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-teal-600 to-indigo-600 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">FOPS</p>
              <CardTitle className="text-xl leading-tight">Accept Your Invitation</CardTitle>
            </div>
          </div>
          <CardDescription>
            {invite?.invited_by_name ? <><strong>{invite.invited_by_name}</strong> invited you </> : 'You\'ve been invited '}
            to join FOPS as <strong className="text-teal-700">{roleLabel}</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAccept} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-1.5 text-xs"><Mail className="h-3 w-3" /> Email</Label>
              <Input id="email" value={invite?.email || ''} disabled className="bg-slate-50" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name" className="flex items-center gap-1.5 text-xs"><User className="h-3 w-3" /> Your Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Jane Doe"
                disabled={status === 'accepting'}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="flex items-center gap-1.5 text-xs"><Lock className="h-3 w-3" /> Choose Password (min 8 chars)</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={status === 'accepting'}
                required
                minLength={8}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm" className="flex items-center gap-1.5 text-xs"><Lock className="h-3 w-3" /> Confirm Password</Label>
              <Input
                id="confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={status === 'accepting'}
                required
                minLength={8}
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" className="w-full" disabled={status === 'accepting'}>
              {status === 'accepting' ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating Account...</>
              ) : 'Create Account'}
            </Button>
            <p className="text-xs text-slate-500 text-center">
              By accepting, you agree to FOPS terms and privacy policy.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-teal-500" />
      </div>
    }>
      <AcceptInviteContent />
    </Suspense>
  );
}
