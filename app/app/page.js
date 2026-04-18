'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { createBrowserClient } from '@/lib/supabase';

export default function AppDashboard() {
  const { user, session, loading: authLoading } = useAuth();
  const [debugInfo, setDebugInfo] = useState({
    localStorageUser: null,
    localStorageSites: null,
    supabaseSession: null,
    supabaseUser: null,
    dbUser: null,
    sites: null,
    error: null
  });

  useEffect(() => {
    const loadDebugInfo = async () => {
      const info = { ...debugInfo };

      // Check localStorage
      try {
        const storedUser = localStorage.getItem('user');
        const storedSites = localStorage.getItem('sites');
        info.localStorageUser = storedUser ? JSON.parse(storedUser) : null;
        info.localStorageSites = storedSites ? JSON.parse(storedSites) : null;
      } catch (e) {
        info.error = `localStorage error: ${e.message}`;
      }

      // Check Supabase session
      try {
        const supabase = createBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        info.supabaseSession = session ? {
          user_id: session.user?.id,
          email: session.user?.email,
          expires_at: new Date(session.expires_at * 1000).toLocaleString()
        } : null;

        const { data: { user } } = await supabase.auth.getUser();
        info.supabaseUser = user ? {
          id: user.id,
          email: user.email,
          metadata: user.user_metadata
        } : null;

        // Query DB user if we have auth
        if (session) {
          const { data: dbUser, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('auth_user_id', session.user.id)
            .single();

          if (userError) {
            info.error = `DB user query error: ${userError.message} (code: ${userError.code})`;
          } else {
            info.dbUser = dbUser;

            // Query sites if we have a user
            if (dbUser) {
              const { data: sites, error: sitesError } = await supabase
                .from('sites')
                .select('*')
                .eq('owner_id', dbUser.id);

              if (sitesError) {
                info.error = `Sites query error: ${sitesError.message} (code: ${sitesError.code})`;
              } else {
                info.sites = sites;
              }
            }
          }
        }
      } catch (e) {
        info.error = `Supabase error: ${e.message}`;
      }

      setDebugInfo(info);
    };

    loadDebugInfo();
  }, [user, session]);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-yellow-100 border-l-4 border-yellow-500 p-4 mb-6">
          <p className="font-semibold">🔧 DEBUG MODE - Middleware Disabled</p>
          <p className="text-sm">This page shows raw auth state for diagnostics.</p>
        </div>

        <h1 className="text-3xl font-bold mb-8">/app Debug Console</h1>

        {/* Auth Context State */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">📡 Auth Context (useAuth)</h2>
          <div className="grid grid-cols-2 gap-4 font-mono text-sm">
            <div>
              <span className="text-gray-600">Loading:</span>
              <span className={`ml-2 font-bold ${authLoading ? 'text-yellow-600' : 'text-green-600'}`}>
                {authLoading ? 'TRUE' : 'FALSE'}
              </span>
            </div>
            <div>
              <span className="text-gray-600">User:</span>
              <span className={`ml-2 font-bold ${user ? 'text-green-600' : 'text-red-600'}`}>
                {user ? user.email : 'NULL'}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Session:</span>
              <span className={`ml-2 font-bold ${session ? 'text-green-600' : 'text-red-600'}`}>
                {session ? 'PRESENT' : 'NULL'}
              </span>
            </div>
          </div>
        </div>

        {/* localStorage */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">💾 localStorage</h2>
          {debugInfo.localStorageUser ? (
            <div className="space-y-2">
              <div>
                <span className="font-semibold">User:</span>
                <pre className="bg-gray-100 p-3 rounded mt-1 text-xs overflow-auto">
                  {JSON.stringify(debugInfo.localStorageUser, null, 2)}
                </pre>
              </div>
              <div>
                <span className="font-semibold">Sites ({debugInfo.localStorageSites?.length || 0}):</span>
                <ul className="list-disc list-inside mt-1">
                  {debugInfo.localStorageSites?.map((site, i) => (
                    <li key={i}>{site.name} ({site.code})</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="text-red-600">⚠️ No user data in localStorage</p>
          )}
        </div>

        {/* Supabase Session */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">🔐 Supabase Auth Session</h2>
          {debugInfo.supabaseSession ? (
            <pre className="bg-gray-100 p-3 rounded text-xs overflow-auto">
              {JSON.stringify(debugInfo.supabaseSession, null, 2)}
            </pre>
          ) : (
            <p className="text-red-600">⚠️ No active Supabase session</p>
          )}
        </div>

        {/* Supabase User */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">👤 Supabase User</h2>
          {debugInfo.supabaseUser ? (
            <pre className="bg-gray-100 p-3 rounded text-xs overflow-auto">
              {JSON.stringify(debugInfo.supabaseUser, null, 2)}
            </pre>
          ) : (
            <p className="text-red-600">⚠️ No Supabase user</p>
          )}
        </div>

        {/* Database User */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">🗄️ Database User (public.users table)</h2>
          {debugInfo.dbUser ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="font-semibold">ID:</span>
                  <span className="ml-2">{debugInfo.dbUser.id}</span>
                </div>
                <div>
                  <span className="font-semibold">Name:</span>
                  <span className="ml-2">{debugInfo.dbUser.name}</span>
                </div>
                <div>
                  <span className="font-semibold">Email:</span>
                  <span className="ml-2">{debugInfo.dbUser.email}</span>
                </div>
                <div>
                  <span className="font-semibold">Role:</span>
                  <span className="ml-2 font-bold text-blue-600">{debugInfo.dbUser.role}</span>
                </div>
                <div>
                  <span className="font-semibold">Status:</span>
                  <span className="ml-2">{debugInfo.dbUser.status}</span>
                </div>
                <div>
                  <span className="font-semibold">Auth User ID:</span>
                  <span className="ml-2 text-xs">{debugInfo.dbUser.auth_user_id}</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-red-600">⚠️ No user record in database</p>
          )}
        </div>

        {/* Sites */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">🏢 Sites (public.sites table)</h2>
          {debugInfo.sites ? (
            <div>
              <p className="mb-2">
                <span className="font-semibold">Count:</span>
                <span className="ml-2 text-2xl font-bold text-green-600">{debugInfo.sites.length}</span>
              </p>
              <ul className="list-disc list-inside space-y-1">
                {debugInfo.sites.map((site, i) => (
                  <li key={i}>
                    <span className="font-semibold">{site.name}</span>
                    <span className="text-gray-600 text-sm ml-2">({site.code}) - {site.location}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-red-600">⚠️ No sites found</p>
          )}
        </div>

        {/* Errors */}
        {debugInfo.error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4">
            <p className="font-semibold text-red-800">❌ Error</p>
            <p className="text-red-700 text-sm mt-1">{debugInfo.error}</p>
          </div>
        )}

        {/* Quick Links */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">🔗 Debug Links</h2>
          <div className="space-y-2">
            <a href="/dev-login" className="block text-blue-600 hover:underline">
              → Go to /dev-login (Auth Testing Console)
            </a>
            <a href="/login" className="block text-blue-600 hover:underline">
              → Go to /login (Production Login Page)
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
