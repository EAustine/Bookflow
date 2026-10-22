# bookflow-site

Static marketing + legal site for **[getbookflow.co](https://getbookflow.co)** — the public web home for Bookflow (a mobile reading app: read + bimodal TTS listening + AI summaries, Q&A, translation, vocabulary). Separate from the Bookflow React Native app.

Dependency-free static site: vanilla HTML/CSS/JS, no framework, no build step, no external CDN. Variable fonts are self-hosted. Forms post directly to Supabase's REST API (no JS SDK). Deployed to Vercel.

## Pages

```
bookflow-site/
├─ index.html          Landing page (hero, how-it-works, features, pricing, waitlist, final CTA)
├─ about.html          About page
├─ contact.html        Contact page (with form)
├─ privacy.html        Privacy Policy
├─ terms.html          Terms of Service
├─ styles.css          Shared stylesheet (all pages)
├─ app.js              Shared scripts (theme, mobile menu, waitlist + contact forms)
├─ fonts/              Self-hosted variable woff2 (Fraunces, Literata, Geist)
├─ images/             cta-library.jpg (CTA photo), hero-screenshot.jpg (app shot), about-portrait.webp (About quote photo)
├─ bookflow_og.png     1200×630 social share image
├─ apple-touch-icon.png
├─ vercel.json         cleanUrls + security headers
└─ README.md           This file
```

Routes (via `vercel.json` `cleanUrls`): `/`, `/about`, `/contact`, `/privacy`, `/terms`.

## Local preview

Some browsers block font loading over `file://` (CORS), so use a static server:

```bash
cd bookflow-site
python3 -m http.server 8000   # open http://localhost:8000
```

Internal links use relative paths (`about.html`, `privacy.html`, …) so the site also works when opened straight from disk.

## Deploy

```bash
npx vercel --prod
```

The Vercel project is wired to **getbookflow.co** via Namecheap DNS (A `@` → Vercel anycast IP, CNAME `www` → Vercel target). See Vercel → Settings → Domains for current values.

`vercel.json` sets `Cache-Control: public, max-age=31536000, immutable` on `/fonts/` and `/images/`. Filenames aren't content-hashed, so to bust a cached image after replacing it, rename the file (or bump a `?v=2` query on its references).

## Forms (Supabase)

Both the waitlist (landing) and the contact form post to Supabase REST with insert-only RLS. **Until credentials are set, both forms run in demo mode** (show success without sending). Set these at the top of `app.js`:

| What | Where |
|---|---|
| Supabase URL / anon key | `app.js` — `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| Table names | `app.js` — `WAITLIST_TABLE`, `CONTACT_TABLE` |
| Contact email shown on page | `contact.html` — `support@getbookflow.co` |

The anon key is safe to ship in client code — RLS is what protects the data. Run once in the Supabase SQL editor:

Tables are prefixed `site_` so they're clearly website-owned and can't collide with the mobile app's schema (the site shares the app's Supabase project).

```sql
-- Waitlist
create table if not exists public.site_waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  source text,
  created_at timestamptz not null default now()
);
alter table public.site_waitlist enable row level security;
create policy "site_waitlist_insert_anon" on public.site_waitlist
  for insert to anon, authenticated
  with check (char_length(email) < 320 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- Contact messages
create table if not exists public.site_contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null, email text not null, message text not null,
  created_at timestamptz not null default now()
);
alter table public.site_contact_messages enable row level security;
create policy "site_contact_insert_anon" on public.site_contact_messages
  for insert to anon, authenticated
  with check (char_length(name) between 1 and 200
    and char_length(message) between 2 and 5000
    and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
```

The waitlist's unique-email constraint produces a friendly "you're already on the list" message (HTTP 409).

## Updating the legal pages

Edit `privacy.html` or `terms.html` and bump the "Last updated" date at the top. If the change is material, also update the "Effective date" and notify users (in-app banner or email). Redeploy.

## Behaviour notes

- **Theme:** follows the OS by default; the toggle persists a manual choice in `localStorage` under `bf-theme`. A small inline script in every `<head>` resolves and sets the theme **before first paint** (no flash). The cross-fade is disabled under `prefers-reduced-motion`.
- **Mobile menu** kicks in at ≤860 px: section links + Join CTA, animated burger→X, closes on link/scrim/Escape/resize, locks body scroll while open.
- **Waitlist success** reverts to the empty form after 4 s (nice for demos). For production you may prefer it to persist — see `wlDone` / `wlReset` in `app.js`.

## Design system — please preserve

- Page background is `cream-50` (#FAF7F2), **never pure white**.
- Dark mode = warm forest-tinted near-blacks (`#1A1F1B` / `#232A24` / `#2C342D`), not cold blue-black. Body text is warm cream (`#E8E5DC`), never pure white.
- Fonts are **variable** and use the `opsz` (optical-size) axis — keep the variable files; don't swap for static instances. Fraunces (display), Geist (UI), Literata (reading/long-form body, used on the legal pages).
- Amber (`#D4A574`) is decorative only — **never place text directly on amber** (the "Most Popular" tag uses dark ink on amber for this reason). The legal `:target` highlight also uses dark ink on amber.
- In dark mode, accent _text_ uses `--d-accent-text` (passes AA); accent _fills_ use `--d-accent`. Keep them separate.
- Contrast is WCAG AA-audited. Card/tile borders and the empty scrubber track are intentionally low-contrast (decorative) — leave them.

## Still open

- ✅ Supabase is configured in `app.js` and both forms are verified inserting into `site_waitlist` / `site_contact_messages` (RLS: insert-only for anon, reads blocked). Two test rows were created during setup (`bookflow-waitlist-test@example.com` and a "Bookflow Setup Test" contact) — delete them from the Supabase **Table Editor** when convenient (anon can't delete via RLS).
- Consider spam/rate-limit protection on the public insert endpoints (e.g. Cloudflare Turnstile or a Supabase Edge Function) before heavy traffic — the anon key is public, so the RLS `with check` limits *shape* (format/length) but not *volume*.
- Wire footer **social** links (Instagram / LinkedIn currently `#`) once you have the real profile URLs.
- **Contact email notifications** are built in `supabase/functions/contact-notify/` — emails the team + auto-replies to the sender (via Resend) on each submission, while still storing the row. Not yet deployed: follow that folder's `README.md` (Resend domain verify → Supabase secrets → Edge Function → Database Webhook).
- Decide: persist waitlist success in production vs the 4 s revert.
- Optional: privacy-friendly analytics (Plausible/Fathom).
- About page uses the editorial redesign (`ab-*` sections in `styles.css`): centered hero, portrait pull-quote, sticky-label "why", numbered principles, signature note, forest CTA. Copy is finalized starter text — tweak the story if desired.
