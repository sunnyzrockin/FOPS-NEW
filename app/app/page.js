'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Loader2 } from 'lucide-react';

// Import the old dashboard component
// We'll need to extract just the dashboard logic without login UI
export default function AppDashboard() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();
  const [userData, setUserData] = useState(null);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Redirect if not authenticated
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }

    // Load user data from localStorage or fetch from API
    const loadUserData = async () => {
      if (!user) return;

      try {
        // Try localStorage first
        const storedUser = localStorage.getItem('user');
        const storedSites = localStorage.getItem('sites');

        if (storedUser && storedSites) {
          setUserData(JSON.parse(storedUser));
          setSites(JSON.parse(storedSites));
          setLoading(false);
          return;
        }

        // If not in localStorage, fetch from API
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            email: user.email,
            // Password not needed for session validation
          }),
        });

        if (res.ok) {
          const data = await res.json();
          setUserData(data.user);
          setSites(data.sites || []);
          localStorage.setItem('user', JSON.stringify(data.user));
          localStorage.setItem('sites', JSON.stringify(data.sites || []));
        }
      } catch (error) {
        console.error('Failed to load user data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      loadUserData();
    }
  }, [user, authLoading, router]);

  const handleSignOut = async () => {
    await signOut();
    localStorage.removeItem('user');
    localStorage.removeItem('sites');
    router.push('/login');
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg mb-4">Failed to load user data</p>
          <button 
            onClick={handleSignOut}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  // Import and render the actual dashboard based on role
  // For now, placeholder
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold">FOPS Dashboard</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600">{userData.name} ({userData.role})</span>
            <button 
              onClick={handleSignOut}
              className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <div className="bg-white rounded-lg border p-8">
          <h2 className="text-2xl font-bold mb-4">Welcome, {userData.name}!</h2>
          <p className="text-slate-600 mb-4">Role: <strong>{userData.role}</strong></p>
          <p className="text-slate-600 mb-4">Sites assigned: <strong>{sites.length}</strong></p>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
            <p className="text-sm text-blue-800">
              🚧 <strong>Dashboard migration in progress...</strong>
              <br />
              The full dashboard functionality is being moved to this protected route.
              <br />
              For now, you can access your account and sign out.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
