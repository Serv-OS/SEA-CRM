-- Migration 011: Secondary roles / teams on users (additive)
-- Independent of the permission role (owner/editor/viewer). Used to mark
-- who is a Support agent, Sales rep, etc. so tickets/leads can be auto-routed.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS teams text[] NOT NULL DEFAULT '{}';

-- GIN index so "who is on the support team" (teams @> '{support}') is fast
CREATE INDEX IF NOT EXISTS idx_profiles_teams ON public.profiles USING gin (teams);
