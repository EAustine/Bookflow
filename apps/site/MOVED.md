# Marketing site — moved into the monorepo

Moved here in M1 from `~/bookflow-site`, which was **not a git repository**:
the live marketing site had no version history at all. That is the main reason
this move happened now rather than later.

## What came with it

Everything except three directories:

| Excluded | Why |
|---|---|
| `.vercel/` | Local deploy linkage, not source. The Vercel project still exists; **re-point it at `apps/site` rather than creating a new one**, or the domain moves. |
| `supabase/` | It held `functions/contact-notify`, a **21st edge function this repo had never seen**, linked to the *same* Supabase project as the app (`wqybsuhccyixpnrvmlxr`). It now lives at `supabase/functions/contact-notify` with the other twenty, so one checkout can deploy them all. |
| `.claude/` | Session-local. |

`vercel.json` came across unchanged and carries `cleanUrls`, three security
headers, and immutable caching for `/fonts` and `/images`. Losing it would
silently drop those headers, so it is worth checking after the first deploy
from the new path.

## Before deleting `~/bookflow-site`

The original is still on disk and is still the only copy of its `.vercel`
linkage. Confirm a deploy from `apps/site` works first.
