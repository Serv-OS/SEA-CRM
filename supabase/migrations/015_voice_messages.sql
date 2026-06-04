-- Migration 015: Editable phone greeting + voicemail prompt
-- Stored on the support_settings singleton so owners can edit the words
-- callers hear, without code changes.

ALTER TABLE public.support_settings
  ADD COLUMN IF NOT EXISTS voice_greeting text
    NOT NULL DEFAULT 'Please hold while we connect you to an agent.';

ALTER TABLE public.support_settings
  ADD COLUMN IF NOT EXISTS voicemail_prompt text
    NOT NULL DEFAULT 'Sorry, we can''t take your call right now. Please leave a message after the beep and we''ll get back to you.';
