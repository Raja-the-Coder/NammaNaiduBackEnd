-- Conversations and Messages tables for messaging flow
-- Run this against your PostgreSQL database (e.g. psql or GUI) before using messaging APIs.

-- Conversations: one row per pair of users (user1Id < user2Id for uniqueness)
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  "user1Id" UUID NOT NULL REFERENCES users("accountId") ON DELETE CASCADE,
  "user2Id" UUID NOT NULL REFERENCES users("accountId") ON DELETE CASCADE,
  "lastMessageAt" TIMESTAMP WITH TIME ZONE,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_conversation_pair UNIQUE ("user1Id", "user2Id")
);

CREATE INDEX IF NOT EXISTS idx_conversations_user1 ON conversations("user1Id");
CREATE INDEX IF NOT EXISTS idx_conversations_user2 ON conversations("user2Id");
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations("lastMessageAt");

-- Messages: one row per message in a conversation
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  "conversationId" INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  "senderId" UUID NOT NULL REFERENCES users("accountId") ON DELETE CASCADE,
  body TEXT NOT NULL,
  "isRead" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages("conversationId");
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages("senderId");
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages("createdAt");
