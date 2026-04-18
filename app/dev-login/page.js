'use client';

import { useState } from 'react';
import { createBrowserClient } from '@/lib/supabase';

export default function DevLoginPage() {
  const [email, setEmail] = useState('owner@workflowlite.com');
  const [password, setPassword] = useState('WorkflowDemo2026!');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    setLogs(prev => [...prev, { timestamp, message, type }]);
    console.log(`[${type.toUpperCase()}]`, message);
  };

  const testSupabaseDirectAuth = async () => {
    setLogs([]);
    setLoading(true);
    addLog('🔍 TEST 1: Direct Supabase Auth Client', 'info');

    try {
      const supabase = createBrowserClient();
      addLog('✅ Supabase client created', 'success');
      
      addLog(`📧 Attempting signInWithPassword: ${email}`, 'info');
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        addLog(`❌ Supabase Auth Error: ${error.message}`, 'error');
        addLog(`Error Code: ${error.status} - ${error.code}`, 'error');
        addLog(`Full error: ${JSON.stringify(error, null, 2)}`, 'error');
      } else {
        addLog('✅ Authentication successful!', 'success');
        addLog(`User ID: ${data.user?.id}`, 'success');
        addLog(`Email: ${data.user?.email}`, 'success');
        addLog(`Session expires: ${new Date(data.session?.expires_at * 1000).toLocaleString()}`, 'success');
      }
    } catch (err) {
      addLog(`💥 Exception: ${err.message}`, 'error');
      addLog(`Stack: ${err.stack}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const testAPIEndpoint = async () => {
    setLogs([]);
    setLoading(true);
    addLog('🔍 TEST 2: /api/auth/login Endpoint', 'info');

    try {
      addLog(`📤 POST /api/auth/login with ${email}`, 'info');
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      addLog(`📥 Response status: ${res.status} ${res.statusText}`, res.ok ? 'success' : 'error');
      
      const data = await res.json();
      
      if (!res.ok) {
        addLog(`❌ API Error: ${data.error}`, 'error');
        addLog(`Full response: ${JSON.stringify(data, null, 2)}`, 'error');
      } else {
        addLog('✅ API call successful!', 'success');
        addLog(`User: ${data.user?.name} (${data.user?.role})`, 'success');
        addLog(`Sites count: ${data.sites?.length || 0}`, 'success');
        addLog(`Sites: ${data.sites?.map(s => s.name).join(', ')}`, 'success');
        addLog(`Session access_token present: ${!!data.session?.access_token}`, 'success');
      }
    } catch (err) {
      addLog(`💥 Fetch Exception: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const testSessionPersistence = async () => {
    setLogs([]);
    setLoading(true);
    addLog('🔍 TEST 3: Session Persistence Check', 'info');

    try {
      const supabase = createBrowserClient();
      
      addLog('📖 Checking current session...', 'info');
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        addLog(`❌ getSession error: ${error.message}`, 'error');
      } else if (!session) {
        addLog('⚠️ No active session found', 'warn');
        addLog('LocalStorage keys: ' + Object.keys(localStorage).filter(k => k.includes('supabase')).join(', '), 'info');
      } else {
        addLog('✅ Active session found!', 'success');
        addLog(`User: ${session.user?.email}`, 'success');
        addLog(`Expires: ${new Date(session.expires_at * 1000).toLocaleString()}`, 'success');
      }

      addLog('🔐 Checking user...', 'info');
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError) {
        addLog(`❌ getUser error: ${userError.message}`, 'error');
      } else if (!user) {
        addLog('⚠️ No user found', 'warn');
      } else {
        addLog('✅ User found!', 'success');
        addLog(`Email: ${user.email}`, 'success');
        addLog(`ID: ${user.id}`, 'success');
      }
    } catch (err) {
      addLog(`💥 Exception: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const testDatabaseQuery = async () => {
    setLogs([]);
    setLoading(true);
    addLog('🔍 TEST 4: Database Query (Users Table)', 'info');

    try {
      const supabase = createBrowserClient();
      
      // First authenticate
      addLog('🔐 Authenticating first...', 'info');
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (authError) {
        addLog(`❌ Auth failed: ${authError.message}`, 'error');
        setLoading(false);
        return;
      }

      addLog('✅ Authenticated', 'success');
      addLog(`Auth User ID: ${authData.user.id}`, 'info');

      // Query users table
      addLog('📊 Querying users table...', 'info');
      const { data: users, error: queryError } = await supabase
        .from('users')
        .select('*')
        .eq('auth_user_id', authData.user.id)
        .single();

      if (queryError) {
        addLog(`❌ Query error: ${queryError.message}`, 'error');
        addLog(`Error code: ${queryError.code}`, 'error');
        addLog(`Error hint: ${queryError.hint}`, 'error');
      } else if (!users) {
        addLog('⚠️ No user record found in users table', 'warn');
      } else {
        addLog('✅ User record found!', 'success');
        addLog(`DB User ID: ${users.id}`, 'success');
        addLog(`Name: ${users.name}`, 'success');
        addLog(`Role: ${users.role}`, 'success');
        addLog(`Status: ${users.status}`, 'success');
      }

      // Query sites
      addLog('📊 Querying sites table...', 'info');
      const { data: sites, error: sitesError } = await supabase
        .from('sites')
        .select('*')
        .eq('owner_id', users?.id || 'owner-001');

      if (sitesError) {
        addLog(`❌ Sites query error: ${sitesError.message}`, 'error');
      } else {
        addLog(`✅ Found ${sites?.length || 0} sites`, sites?.length > 0 ? 'success' : 'warn');
        sites?.forEach(site => {
          addLog(`  - ${site.name} (${site.code})`, 'info');
        });
      }
    } catch (err) {
      addLog(`💥 Exception: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">🔧 Auth Debug Console</h1>
        <p className="text-gray-600 mb-8">Middleware disabled. Direct auth testing.</p>

        {/* Credentials */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Test Credentials</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded"
              />
            </div>
          </div>
        </div>

        {/* Test Buttons */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Run Tests</h2>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={testSupabaseDirectAuth}
              disabled={loading}
              className="px-4 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Test 1: Supabase Auth Client
            </button>
            <button
              onClick={testAPIEndpoint}
              disabled={loading}
              className="px-4 py-3 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              Test 2: API Endpoint
            </button>
            <button
              onClick={testSessionPersistence}
              disabled={loading}
              className="px-4 py-3 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
            >
              Test 3: Session Persistence
            </button>
            <button
              onClick={testDatabaseQuery}
              disabled={loading}
              className="px-4 py-3 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
            >
              Test 4: Database Query
            </button>
          </div>
        </div>

        {/* Logs */}
        <div className="bg-gray-900 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4 text-white">Console Output</h2>
          {logs.length === 0 ? (
            <p className="text-gray-400">Click a test button above to see results...</p>
          ) : (
            <div className="font-mono text-sm space-y-1">
              {logs.map((log, i) => (
                <div
                  key={i}
                  className={`${
                    log.type === 'error'
                      ? 'text-red-400'
                      : log.type === 'success'
                      ? 'text-green-400'
                      : log.type === 'warn'
                      ? 'text-yellow-400'
                      : 'text-gray-300'
                  }`}
                >
                  <span className="text-gray-500">[{log.timestamp}]</span> {log.message}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
