-- Migration: Add snippet column to messages table
-- Run: npx wrangler d1 execute tempik-db --remote --file=src/db/migrations/001_add_snippet.sql

ALTER TABLE messages ADD COLUMN snippet TEXT DEFAULT '';
