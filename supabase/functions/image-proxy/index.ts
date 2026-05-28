/**
 * image-proxy — thin streaming proxy for remote image hosts the
 * React Native `<Image>` component refuses to load directly.
 *
 * Why this exists:
 *   Wikimedia's `upload.wikimedia.org` returns valid HTTPS JPEGs
 *   with `access-control-allow-origin: *` — they SHOULD load in
 *   React Native's Image component without ceremony. In practice
 *   the Android pipeline (Fresco → OkHttp) silently fails the load
 *   for a non-trivial subset of Wikimedia URLs and falls through to
 *   the `onError` branch. Suspects: URL-encoded characters in the
 *   path (`%28`/`%29`), the `/file.jpg/Npx-file.jpg` thumbnail path
 *   shape, Wikimedia's CDN-specific `content-disposition` header,
 *   or some combination. We tried decoding the parens server-side
 *   and that didn't fully resolve it on the user's device.
 *
 *   Routing through our own edge function sidesteps every one of
 *   those variables: React Native sees a URL on `*.supabase.co`
 *   (a host pattern it has loaded thousands of times) and the
 *   image bytes come back through a Deno fetch that has none of
 *   Fresco's quirks.
 *
 * Allowlist:
 *   Only `upload.wikimedia.org` is permitted as an upstream — we're
 *   not building a general SSRF gateway. Adding new hosts requires
 *   an explicit code change here.
 *
 * Caching:
 *   `s-maxage=86400` (1 day at the CDN edge) + `max-age=604800`
 *   (1 week at the device cache). Wikimedia thumbnails change
 *   essentially never; aggressive caching is correct.
 */

const ALLOWED_HOSTS = ['upload.wikimedia.org'];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'GET') {
    return new Response('method_not_allowed', {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  const reqUrl = new URL(req.url);
  const target = reqUrl.searchParams.get('url');
  if (!target) {
    return new Response('missing_url', { status: 400, headers: CORS_HEADERS });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new Response('invalid_url', { status: 400, headers: CORS_HEADERS });
  }
  if (parsed.protocol !== 'https:') {
    return new Response('not_https', { status: 400, headers: CORS_HEADERS });
  }
  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return new Response('host_not_allowed', {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  // Forward fetch. We send a real-browser User-Agent header so
  // Wikimedia doesn't flag the request as a non-browser scraper
  // (their CDN occasionally challenges unfamiliar UAs). We do NOT
  // pass through any client headers — this is a public-resource
  // proxy, not an authenticated relay.
  let upstream: Response;
  try {
    upstream = await fetch(parsed.toString(), {
      headers: {
        accept: 'image/*,*/*;q=0.8',
        'user-agent':
          'Bookflow/1.0 (Bookflow image-proxy; https://getbookflow.co)',
      },
    });
  } catch (err) {
    console.warn('[image-proxy] upstream fetch threw:', err);
    return new Response('upstream_error', {
      status: 502,
      headers: CORS_HEADERS,
    });
  }

  if (!upstream.ok) {
    return new Response(`upstream_status_${upstream.status}`, {
      status: 502,
      headers: CORS_HEADERS,
    });
  }

  // Stream the body straight through. Forward the upstream
  // `content-type` if present (default to `image/jpeg` — Wikimedia's
  // most common thumbnail format). Strip every other upstream header
  // so we don't accidentally leak CDN headers or the
  // `content-disposition: inline; filename=…` that may be implicated
  // in the Fresco behaviour we're routing around.
  const contentType = upstream.headers.get('content-type') ?? 'image/jpeg';
  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': contentType,
      // Aggressive cache — Wikimedia thumbnails are content-addressed
      // by filename and effectively immutable.
      'Cache-Control': 'public, s-maxage=86400, max-age=604800, immutable',
    },
  });
});
