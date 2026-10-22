# M0 spike 3 — RevenueCat Web

**Question.** In sandbox: set the RevenueCat app user id to a Supabase user id,
buy a subscription through the Web SDK, confirm the entitlement appears on the
Android build for the same user. Confirm Web Billing status and fees.

**Status: PARTIAL.** The fees and status half is **done** (see §10.1 of
`ARCHITECTURE.md`). The sandbox purchase is **blocked** — it needs RevenueCat
dashboard access and Stripe test keys.

What *was* possible without credentials turned out to matter more than
expected: the architectural precondition the purchase was meant to prove is
**already implemented and verifiable from code**.

Date 2026-10-22 · branch `arch/m0-spikes`

---

## 1. Done — Web Billing status and fees

Recorded in full at `ARCHITECTURE.md` §10.1. Summary:

- RevenueCat labels Web Billing neither **beta** nor **GA**; the docs use
  neither word and publish a limitations list instead.
- No additional RevenueCat fee for web. Web falls under the normal Pro rate:
  free to $2,500 MTR, then 1%.
- RevenueCat Billing chosen over Stripe Billing (which adds 0.7% of volume) and
  Paddle (merchant of record, unpriced on the overview).
- The limitation that matters is not a fee: **web purchase links cannot be
  localised and Stripe is the only gateway**, so checkout is card-only and
  English-only — for a product whose first persona is a Ghanaian ESL
  undergraduate. Open question 13.

## 2. Done — the identity precondition, verified from code

§10's load-bearing claim:

> **RevenueCat app user id = Supabase user id** on every platform. This is what
> makes one subscriber record across stores and web. Set it at sign-in, before
> any purchase call.

**On native this already works.** The chain:

| Step | Where |
|---|---|
| `configureRevenueCat()` at app start | `App.tsx:484` |
| `setupRevenueCatAuthSync()` returned as the effect cleanup | `App.tsx:485` |
| On existing session and on `SIGNED_IN`: `Purchases.logIn(session.user.id)` | `src/lib/auth.ts:367` |
| On sign-out: `Purchases.logOut()` | `src/lib/auth.ts:373` |
| Webhook maps `event.app_user_id` straight to `profiles.id` | `revenuecat-webhook/index.ts:98,180` |

The webhook's own header comment states the contract explicitly, so this is
intentional rather than incidental.

**The webhook already does more than §9.2 credits it with.** Beyond
subscriptions it handles `NON_RENEWING_PURCHASE` by calling the `grant_credits`
RPC (`index.ts:124–141`) — so top-up grants are already server-side and
transactional. Grants are limited to `INITIAL_PURCHASE`, `RENEWAL`,
`PRODUCT_CHANGE`, `UNCANCELLATION`, `TEMPORARY_ENTITLEMENT_GRANT`; revokes to
`EXPIRATION` and `SUBSCRIPTION_PAUSED`. `CANCELLATION` deliberately changes
nothing, since auto-renew-off is still an active subscription.

This reinforces the Phase 0 finding: **M5 is reshaping, not building.** §9.1's
`entitlements` and `credit_ledger` already exist in substance as
`profiles.plan` / `ai_credits_limit` and `grant_credits` / `credit_grants` /
`ai_usage_events`.

## 3. Blocked — the sandbox purchase

Needs, none of which I have:

1. RevenueCat dashboard access — to add a Web Billing app and read its public
   API key.
2. Stripe test-mode keys connected to that RevenueCat project.
3. A web offering configured with the same entitlement identifier the native
   offerings use.

**Do not hand these over to be used here.** It is a purchase flow against a
real account; run it yourself with the plan below, or pair on it.

### Test plan

1. In RevenueCat, add a **Web Billing** app to the existing project and connect
   Stripe in **test mode**. Create an offering whose entitlement identifier
   matches the native one exactly — a mismatch is the most common cause of
   "purchased on web, still free on Android".
2. On the web build, initialise the Web SDK with
   `appUserId = supabase.auth.getUser().id`, the same value `auth.ts:367`
   passes to the native SDK. This is the step the whole spike exists to verify.
3. Buy the subscription with a Stripe test card (`4242 4242 4242 4242`).
4. Check `profiles` for that user id: `plan` should become `pro` and
   `ai_credits_limit` should move to the Pro limit. The webhook is already live,
   so **no new code is needed for this to work** — that is the prediction.
5. Open the Android build signed in as the same user. The entitlement should
   appear without a reinstall; `Purchases.logIn` is already called on session
   restore.
6. Buy a **top-up** on web and confirm `grant_credits` fires and the balance
   moves. This path is live but has never been exercised from web.

### What I expect, and what would surprise me

The webhook keys on `app_user_id` and nothing else, so if step 2 sets the id
correctly, steps 4–6 should pass with no code change. A failure would most
likely be a **mismatched entitlement identifier** between the web and native
offerings, not a problem with the identity model.

## 4. Risks found while reading the code

| | |
|---|---|
| **Identity race** | `configureRevenueCat()` runs with **no** `appUserID`, and `logIn()` follows asynchronously. A purchase in that window would attach to an anonymous id. In practice purchase UI sits behind auth so the window is unreachable — but §10 says "before any purchase call", and nothing in code *enforces* that ordering. Worth an assertion at the purchase call site rather than a comment. |
| **Web has no equivalent wiring** | `setupRevenueCatAuthSync()` calls the native SDK. The Web SDK needs the same subscription to `onAuthStateChange`, and M4's `billing` adapter is where it belongs. |
| **No `entitlements` table yet** | Gating reads `profiles.plan`. §10 wants Supabase as the source of truth with the SDK as a fast hint; that is true today by accident of there being one writer. It stops being automatic once web is a second purchase surface. |

## 5. Verdict

- **Status and fees: answered.** §10.1.
- **Identity model: confirmed from code**, more cheaply and more durably than a
  sandbox purchase would have.
- **End-to-end web purchase: untested**, and it stays untested until the
  credentials exist. It is **not** on M0's critical path — nothing in M1–M4
  depends on it, and M8 is where web purchases ship. Running it before M8 is
  sufficient.
