-- Create refresh_tokens table for JWT refresh token flow

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(500) NOT NULL UNIQUE,
  "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "deviceInfo" VARCHAR(500),
  "isRevoked" BOOLEAN DEFAULT false,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens("userId");
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens("expiresAt");
