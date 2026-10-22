// Supabase Edge Function: contact-notify
// Fires from a Database Webhook on INSERT into public.site_contact_messages.
// 1) Emails the Bookflow team the new message (reply-to = the sender).
// 2) Sends the sender an auto-reply confirmation.
// Email is sent via Resend (https://resend.com). See README.md in this folder for setup.
//
// Secrets (set with `supabase secrets set` or in the dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY          (required)  Resend API key
//   CONTACT_WEBHOOK_SECRET  (required)  shared secret; must match the webhook's x-webhook-secret header
//   CONTACT_NOTIFY_TO       (optional)  inbox that receives notifications   [default support@getbookflow.co]
//   CONTACT_FROM            (optional)  "From" for the notification         [default Bookflow <notifications@getbookflow.co>]
//   CONTACT_REPLY_FROM      (optional)  "From" for the auto-reply           [default Bookflow <support@getbookflow.co>]

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("CONTACT_WEBHOOK_SECRET") ?? "";
const NOTIFY_TO = Deno.env.get("CONTACT_NOTIFY_TO") ?? "support@getbookflow.co";
const FROM = Deno.env.get("CONTACT_FROM") ?? "Bookflow <notifications@getbookflow.co>";
const REPLY_FROM = Deno.env.get("CONTACT_REPLY_FROM") ?? "Bookflow <support@getbookflow.co>";

function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function sendEmail(body: Record<string, unknown>) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  // Only the database webhook (which knows the shared secret) may trigger emails.
  if (!WEBHOOK_SECRET || req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY is not set");
    return new Response("Server misconfigured", { status: 500 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  // Supabase DB webhooks put the new row in `record`; fall back to the body for manual tests.
  const row = (payload?.record as Record<string, unknown>) ?? payload;
  const name = String(row?.name ?? "").trim();
  const email = String(row?.email ?? "").trim();
  const message = String(row?.message ?? "").trim();
  const when = String(row?.created_at ?? "");
  if (!name || !email || !message) return new Response("Missing fields", { status: 422 });

  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeMsg = escapeHtml(message).replaceAll("\n", "<br>");

  // Fire both sends concurrently.
  const notify = sendEmail({
    from: FROM,
    to: [NOTIFY_TO],
    reply_to: email, // hit "Reply" to answer the sender directly
    subject: `New contact message from ${name}`,
    html: `<h2 style="font-family:sans-serif;margin:0 0 12px">New contact message</h2>
<table style="font-family:sans-serif;font-size:14px;line-height:1.6">
  <tr><td style="color:#666;padding-right:12px">Name</td><td><strong>${safeName}</strong></td></tr>
  <tr><td style="color:#666;padding-right:12px">Email</td><td><a href="mailto:${safeEmail}">${safeEmail}</a></td></tr>
  ${when ? `<tr><td style="color:#666;padding-right:12px">Sent</td><td>${escapeHtml(when)}</td></tr>` : ""}
</table>
<p style="font-family:sans-serif;font-size:14px;line-height:1.6;white-space:pre-wrap;border-left:3px solid #D4A574;padding:4px 0 4px 14px;margin-top:16px">${safeMsg}</p>`,
    text: `New contact message\n\nName: ${name}\nEmail: ${email}\n${when ? `Sent: ${when}\n` : ""}\n${message}\n`,
  });

  const reply = sendEmail({
    from: REPLY_FROM,
    to: [email],
    reply_to: NOTIFY_TO,
    subject: "Thanks for reaching out to Bookflow",
    html: `<div style="font-family:sans-serif;font-size:15px;line-height:1.7;color:#1A1A1A">
  <p>Hi ${safeName},</p>
  <p>Thanks for getting in touch &mdash; we&rsquo;ve received your message and someone from the Bookflow team will get back to you soon.</p>
  <p style="color:#666;border-left:3px solid #D4A574;padding:4px 0 4px 14px;white-space:pre-wrap">${safeMsg}</p>
  <p>&mdash; The Bookflow team</p>
</div>`,
    text: `Hi ${name},\n\nThanks for getting in touch — we've received your message and someone from the Bookflow team will get back to you soon.\n\nYour message:\n${message}\n\n— The Bookflow team`,
  });

  // The team notification is the important one — fail loudly if it doesn't send.
  try {
    await notify;
  } catch (e) {
    console.error("notification email failed:", e);
    return new Response("Notify failed", { status: 502 });
  }
  // The auto-reply is best-effort — don't fail the webhook if only it errors.
  try {
    await reply;
  } catch (e) {
    console.error("auto-reply email failed (non-fatal):", e);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
