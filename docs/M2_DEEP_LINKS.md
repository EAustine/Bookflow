# M2 deep links — getbookflow.co

What has to be true for a magic link to open the app instead of a browser.

The app side is configured (`apps/app/app.json`). **The domain side is not** —
two files have to be served from `getbookflow.co`, and until they are, both
platforms silently fall back to opening the link in a browser. That failure
looks exactly like a broken magic link to the user, with nothing in the logs.

---

## Identifiers

| | |
|---|---|
| Domain | `getbookflow.co` (and `www.`) |
| iOS bundle id | `com.eaustine.bookflow` |
| Android package | `com.eaustine.bookflow` |
| Custom scheme | `bookflow://` |
| Claimed path prefix | `/auth` |
| Callback route | `app/auth/callback.tsx` → `/auth/callback` → `https://getbookflow.co/auth/callback` |

**The directory must not be `(auth)`.** Parentheses make a group, which
Expo Router strips from the URL, so `app/(auth)/callback.tsx` serves
`/callback` and every magic link lands on "Unmatched Route". This table
previously recorded `/(auth)/callback` as if it mapped to
`/auth/callback`; it does not. Fixed 2026-10-28.

The path prefix is why the route lives at `/auth/callback` rather than
somewhere tidier: the native manifests claim that prefix, so the route has to
sit under it.

## What `apps/site` must serve

Both files go at the domain root, served over HTTPS with no redirect. A 301
from `getbookflow.co` to `www.` (or the reverse) breaks verification on both
platforms — the file must be reachable at whichever host is in the config, and
both hosts are.

### `/.well-known/apple-app-site-association`

**No file extension**, served as `application/json`.

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAMID.com.eaustine.bookflow",
        "paths": ["/auth/*"]
      }
    ]
  }
}
```

`TEAMID` is the Apple Developer Team ID — it is not in this repo and has to
come from the Apple Developer account. The string is `TeamID.bundleId`, and a
wrong Team ID fails silently.

### `/.well-known/assetlinks.json`

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.eaustine.bookflow",
      "sha256_cert_fingerprints": ["<SHA256 of the signing cert>"]
    }
  }
]
```

The fingerprint must be of the certificate the **shipped** build is signed
with. If Play App Signing is on — and it is for anything distributed through
Play — that is Google's upload-and-signing cert, found in **Play Console →
Release → Setup → App signing**, not the local keystore. Using the local
fingerprint is the usual reason App Links verify in a local build and fail in
production.

List more than one fingerprint if local release builds also need to verify.

## `vercel.json`

`apps/site/vercel.json` has `cleanUrls: true`, which strips `.json`
extensions. Check `/.well-known/assetlinks.json` still resolves after deploy;
if `cleanUrls` interferes, add an explicit rewrite.

## Supabase

The magic link's redirect target has to be on Supabase's allowlist:
**Authentication → URL Configuration → Redirect URLs**. Add:

```
https://getbookflow.co/auth/callback
https://www.getbookflow.co/auth/callback
bookflow://auth/callback
```

The custom scheme stays — it is the fallback when App Link verification has
not happened yet (fresh install, no network on first launch) and it is what
makes local development work without the domain files.

## Verifying

**Android**, once the app is installed:

```bash
adb shell pm get-app-links com.eaustine.bookflow
```

Look for `verified` next to the domain. `legacy_failure` or `1024` means
`assetlinks.json` was not fetched or did not match.

```bash
adb shell am start -a android.intent.action.VIEW -d "https://getbookflow.co/auth/callback?code=test"
```

Should open the app, not Chrome.

**iOS**: install to a device, long-press the link in Notes or Mail. "Open in
Bookflow" in the context menu means the association resolved. The simulator
does not verify Universal Links reliably, so this one needs real hardware —
which, per `ARCHITECTURE.md` §13.1, is not available. **This is the part of
M2's evidence that cannot be produced here.**

## Status

| | |
|---|---|
| `app.json` — `associatedDomains`, `intentFilters`, `typedRoutes` | ✅ done |
| `apple-app-site-association` on the domain | ❌ needs the Apple Team ID |
| `assetlinks.json` on the domain | ❌ needs the Play signing fingerprint |
| Supabase redirect allowlist | ❌ needs doing in the dashboard |
| Android verification | blocked on the two files |
| iOS verification | blocked on the files **and** on a physical device |
