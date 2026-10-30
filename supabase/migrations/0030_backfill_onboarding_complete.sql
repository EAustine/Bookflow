-- Backfill `profiles.onboarding_complete` for users who are evidently
-- past onboarding.
--
-- The column has been `default false` since 0001 and, until the app fix
-- that ships with this migration, nothing ever set it to true. Both
-- readers (session restore and the magic-link callback) route on it, so
-- every existing user would otherwise be sent through onboarding once
-- more after updating, despite having used the app for months.
--
-- It looked intermittent rather than total only because the root
-- layout caps its profile lookup at 4s and a timeout falls through to
-- Library: a slow lookup let people in by accident.
--
-- "Evidently past onboarding" is having at least one book. That is what
-- the final onboarding step asks for, so anyone holding a book either
-- completed the step or skipped past it, and in both cases they have
-- already seen the flow. A user with no books is left alone: they get
-- the flow once, now correctly recorded.
--
-- Idempotent, and safe to re-run: the `is distinct from true` guard
-- means already-true rows (and any future NULLs) are not rewritten, so
-- a redeploy touches nothing.

update public.profiles p
set onboarding_complete = true
where p.onboarding_complete is distinct from true
  and exists (
    select 1
    from public.books b
    where b.user_id = p.id
  );
