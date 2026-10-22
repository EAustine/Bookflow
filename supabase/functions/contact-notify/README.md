# Contact form → email notifications

Emails the Bookflow team whenever someone submits the contact form, **and** sends the
submitter an auto-reply. Messages are still stored in `public.site_contact_messages` —
this just adds notifications on top, so nothing is ever lost even if email fails.

```
Contact form → Supabase REST (insert row) → Database Webhook (on INSERT)
            → Edge Function `contact-notify` → Resend → 1) you  2) the sender
```

Everything below is done in the **Supabase + Resend + Namecheap dashboards** — no website
changes and no CLI required (a CLI path is noted at the end).

---

## 1. Resend (the email sender)

1. Create an account at <https://resend.com>.
2. **Add your domain** `getbookflow.co` (Resend → Domains → Add Domain). Resend shows a few
   DNS records (DKIM `TXT`, an SPF/return-path record, and optionally DMARC). Add them in
   **Namecheap → Domain List → getbookflow.co → Advanced DNS**, then click **Verify** in Resend.
   - Verifying the domain lets you send *from* `notifications@getbookflow.co` / `support@getbookflow.co`
     with good deliverability.
   - **Want to test first, before DNS?** Skip verification and set `CONTACT_FROM` to
     `Bookflow <onboarding@resend.dev>` and `CONTACT_NOTIFY_TO` to the email you signed up with.
     Resend's sandbox only delivers to your own address until a domain is verified.
3. **Create an API key** (Resend → API Keys → Create). Copy it — you'll paste it in step 2.

## 2. Supabase secrets

Supabase → **Edge Functions → Secrets** (or **Project Settings → Edge Functions**). Add:

| Secret | Value |
|---|---|
| `RESEND_API_KEY` | the key from step 1 |
| `CONTACT_WEBHOOK_SECRET` | any long random string (e.g. run `openssl rand -hex 24`) |
| `CONTACT_NOTIFY_TO` | `support@getbookflow.co` *(optional — this is the default)* |
| `CONTACT_FROM` | `Bookflow <notifications@getbookflow.co>` *(optional)* |
| `CONTACT_REPLY_FROM` | `Bookflow <support@getbookflow.co>` *(optional)* |

Keep `CONTACT_WEBHOOK_SECRET` handy — you'll paste the same value into the webhook in step 4.

## 3. Deploy the Edge Function

**Dashboard:** Supabase → **Edge Functions → Deploy a new function → via Editor**. Name it
exactly `contact-notify`, paste the contents of [`index.ts`](./index.ts), and **Deploy**.

**CLI (alternative):**
```bash
supabase functions deploy contact-notify --no-verify-jwt --project-ref wqybsuhccyixpnrvmlxr
```

Function URL: `https://wqybsuhccyixpnrvmlxr.supabase.co/functions/v1/contact-notify`

> **Turn "Verify JWT" OFF for this function** (Edge Functions → the function → Settings/Details →
> toggle **Verify JWT** / "Enforce JWT Verification" off; or deploy with `--no-verify-jwt`). With it
> **on**, Supabase rejects the webhook at the gateway with `401` *before the function runs* — even the
> auto-added token is refused (`Invalid credentials`). Security is handled instead by the
> `x-webhook-secret` header the function checks.

## 4. Create the Database Webhook

Supabase → **Database → Webhooks → Create a new hook**:

- **Name:** `contact-notify`
- **Table:** `public.site_contact_messages`
- **Events:** `Insert` only
- **Type of hook:** **Supabase Edge Functions** → select `contact-notify` (method `POST`)
- **HTTP Headers:** add one header — `x-webhook-secret` = the same value you set for
  `CONTACT_WEBHOOK_SECRET`. (Supabase fills in `Authorization` + `Content-Type` automatically.)

Save. From now on, every new row triggers the function.

## 5. Test

Submit the contact form on the site (or insert a test row in the Table Editor). You should get:
- a **notification** at `support@getbookflow.co` (hit Reply to answer the sender), and
- an **auto-reply** at the address you submitted with.

If nothing arrives, check **Edge Functions → Logs** for `contact-notify`, and Resend → **Logs**.

---

### Notes
- The shared `x-webhook-secret` is what stops random callers from triggering emails — without
  it the function returns `401`.
- The team notification is required (function returns `502` if it fails so you can see it in logs);
  the auto-reply is best-effort and won't fail the webhook.
- Resend free tier: 3,000 emails/month, 100/day — plenty for a contact form.
- For best inbox placement, also add a **DMARC** record (`_dmarc.getbookflow.co TXT "v=DMARC1; p=none;"`).
