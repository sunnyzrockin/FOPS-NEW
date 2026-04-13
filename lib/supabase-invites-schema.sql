-- Add user invites table to existing Supabase schema

CREATE TABLE IF NOT EXISTS user_invites (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('operator', 'staff')),
  invited_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id TEXT REFERENCES sites(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  accepted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_invites_email ON user_invites(email);
CREATE INDEX idx_invites_status ON user_invites(status);
CREATE INDEX idx_invites_invited_by ON user_invites(invited_by_user_id);

-- Enable RLS
ALTER TABLE user_invites ENABLE ROW LEVEL SECURITY;

-- RLS Policies for invites
CREATE POLICY "Users can view invites they sent" ON user_invites
  FOR SELECT USING (
    invited_by_user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Users can create invites" ON user_invites
  FOR INSERT WITH CHECK (
    invited_by_user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );
