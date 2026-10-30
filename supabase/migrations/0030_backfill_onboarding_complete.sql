-- Backfill `profiles.onboarding_complete` for users who are evidently
-- past onboarding.
--
-- The app did write this flag once: `persistOnboardingComplete` in
-- App.tsx. The M2 router cutover orphaned that file and the write went
-- with it, so the column has been stuck at its `default false` for
-- every account onboarded since. Both readers (session restore and the
-- magic-link callback) route on it, so those users would otherwise be
-- sent through onboarding once more after updating.
--
-- The split is visible in production: of 28 profiles, 14 carry the flag
-- (onboarded before the cutover) and 14 do not (since).
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
