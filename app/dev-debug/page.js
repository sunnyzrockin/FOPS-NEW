'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { createBrowserClient } from '@/lib/supabase';

export default function DevDebugPage() {
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

      try {
        const storedUser = localStorage.getItem('user');
        const storedSites = localStorage.getItem('sites');
        info.localStorageUser = storedUser ? JSON.parse(storedUser) : null;
        info.localStorageSites = storedSites ? JSON.parse(storedSites) : null;
      } catch (e) {
        info.error = `localStorage error: ${e.message}`;
      }

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
          <p className="font-semibold">🔧 DEBUG MODE - Dev Only Route</p>
          <p className="text-sm">This page shows raw auth state for diagnostics.</p>
        </div>

        <h1 className="text-3xl font-bold mb-8">/dev-debug Console</h1>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">📡 Auth Context</h2>
          <div className="grid grid-cols-2 gap-4 font-mono text-sm">
            <div><span className="text-gray-600">Loading:</span> <span className={`ml-2 font-bold ${authLoading ? 'text-yellow-600' : 'text-green-600'}`}>{authLoading ? 'TRUE' : 'FALSE'}</span></div>
            <div><span className="text-gray-600">User:</span> <span className={`ml-2 font-bold ${user ? 'text-green-600' : 'text-red-600'}`}>{user ? user.email : 'NULL'}</span></div>
            <div><span className="text-gray-600">Session:</span> <span className={`ml-2 font-bold ${session ? 'text-green-600' : 'text-red-600'}`}>{session ? 'PRESENT' : 'NULL'}</span></div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">💾 localStorage</h2>
          {debugInfo.localStorageUser ? (
            <pre className="bg-gray-100 p-3 rounded text-xs overflow-auto">{JSON.stringify(debugInfo.localStorageUser, null, 2)}</pre>
          ) : (
            <p className="text-red-600">⚠️ No user data</p>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">🗄️ Database User</h2>
          {debugInfo.dbUser ? (
            <div className="space-y-2">
              <div><strong>ID:</strong> {debugInfo.dbUser.id}</div>
              <div><strong>Name:</strong> {debugInfo.dbUser.name}</div>
              <div><strong>Role:</strong> <span className="font-bold text-teal-600">{debugInfo.dbUser.role}</span></div>
            </div>
          ) : (
            <p className="text-red-600">⚠️ No user record</p>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">🏢 Sites</h2>
          {debugInfo.sites ? (
            <div>
              <p className="mb-2"><strong>Count:</strong> <span className="text-2xl font-bold text-green-600">{debugInfo.sites.length}</span></p>
              <ul className="list-disc list-inside space-y-1">
                {debugInfo.sites.map((site, i) => (
                  <li key={i}><strong>{site.name}</strong> <span className="text-gray-600 text-sm">({site.code})</span></li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-red-600">⚠️ No sites</p>
          )}
        </div>
      </div>
    </div>
  );
}
