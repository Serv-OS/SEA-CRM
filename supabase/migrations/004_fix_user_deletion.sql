-- v0.4: Fix user deletion — add DELETE policy + fix FK constraints
-- Safe to re-run (idempotent).

-- ── 1. DELETE RLS policy on profiles (owner only) ───────────────────────
DO $$ BEGIN
  CREATE POLICY profiles_delete_owner ON public.profiles FOR DELETE TO authenticated
    USING (public.current_user_role() = 'owner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Fix FK references that block profile deletion ────────────────────
-- Each FK needs to be dropped and recreated with ON DELETE SET NULL.
-- Items and comments stay; they just lose the author reference.

-- 2a. projects.created_by
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_created_by_fkey;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL
  NOT VALID;

-- 2b. items.created_by
ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_created_by_fkey;
ALTER TABLE public.items
  ADD CONSTRAINT items_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL
  NOT VALID;

-- 2c. comments.author_id
ALTER TABLE public.comments DROP CONSTRAINT IF EXISTS comments_author_id_fkey;
ALTER TABLE public.comments
  ADD CONSTRAINT comments_author_id_fkey
  FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE SET NULL
  NOT VALID;

-- 2d. activity.actor_id
ALTER TABLE public.activity DROP CONSTRAINT IF EXISTS activity_actor_id_fkey;
ALTER TABLE public.activity
  ADD CONSTRAINT activity_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL
  NOT VALID;

-- 2e. invited_emails.invited_by
ALTER TABLE public.invited_emails DROP CONSTRAINT IF EXISTS invited_emails_invited_by_fkey;
ALTER TABLE public.invited_emails
  ADD CONSTRAINT invited_emails_invited_by_fkey
  FOREIGN KEY (invited_by) REFERENCES public.profiles(id) ON DELETE SET NULL
  NOT VALID;

-- 2f. invited_emails.accepted_by
ALTER TABLE public.invited_emails DROP CONSTRAINT IF EXISTS invited_emails_accepted_by_fkey;
ALTER TABLE public.invited_emails
  ADD CONSTRAINT invited_emails_accepted_by_fkey
  FOREIGN KEY (accepted_by) REFERENCES public.profiles(id) ON DELETE SET NULL
  NOT VALID;

-- ── 3. Server-side function to fully remove a user ──────────────────────
-- Deletes from auth.users which cascades to profiles.
-- Must be SECURITY DEFINER to access auth schema.
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
RETURNS void AS $$
BEGIN
  -- Only owners can delete users
  IF public.current_user_role() <> 'owner' THEN
    RAISE EXCEPTION 'Only owners can delete users' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Cannot delete yourself
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete your own account' USING ERRCODE = 'check_violation';
  END IF;
  -- Delete from auth.users — this cascades to profiles via ON DELETE CASCADE
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 4. Verify ───────────────────────────────────────────────────────────
SELECT 'DELETE policy exists' AS check, EXISTS (
  SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND cmd = 'DELETE'
) AS ok
UNION ALL SELECT 'admin_delete_user function',
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'admin_delete_user');
