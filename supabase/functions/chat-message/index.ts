/**
 * chat-message — Edge Function for book-grounded Q&A.
 *
 * Single-thread-per-(user, book) chat. The function:
 *   1. Loads or creates the user's conversation for this book.
 *   2. Reads prior messages so the LLM has context across turns.
 *   3. Loads the book's text from `pages.content` (concatenated, with
 *      a soft cap so we don't blow the context window on huge books;
 *      RAG with embeddings is a follow-up).
 *   4. Calls Claude with the book text in a *cached* system prompt —
 *      Anthropic's prompt caching covers the cost of resending the
 *      book on every turn within the 5-minute cache window.
 *   5. Persists both user + assistant messages, returns them.
 *
 * Why Sonnet (not Haiku): chat benefits from better reasoning when
 * the user asks subtle questions about the text. Cost stays
 * reasonable thanks to the cached system prompt — repeated turns in
 * the same window pay ~10% of the full input cost on the cached
 * portion.
 */

import Anthropic from 'npm:@anthropic-ai/sdk@0.30.0';
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Soft cap on book text passed to the LLM. ~80K chars ≈ 20K tokens —
 * leaves plenty of room for the conversation history and response
 * inside even Haiku's window. Larger books are truncated; the user
 * gets answers grounded in the prefix until we wire RAG.
 */
const MAX_BOOK_CHARS = 80_000;
const MAX_HISTORY_MESSAGES = 20;

const SYSTEM_PROMPT_PREFIX = `You are a reading companion that answers questions strictly grounded in the book provided below.

Rules:
- Stay inside the book. If the answer isn't supported by the text, say so plainly and offer a question that *is* answerable from the book.
- When citing, refer to the page or passage by its content, not by a page number you'd have to invent.
- Keep answers concise — one or two short paragraphs unless the user explicitly asks for depth.
- Don't pretend to know the user. Don't invent character backstories the book doesn't include.

Book content follows below.

--- BOOK START ---
`;

const SYSTEM_PROMPT_SUFFIX = '\n--- BOOK END ---';

type Body = {
  book_id: string;
  /** Optional — if omitted, we'll find or create the conversation. */
  conversation_id?: string;
  message: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }
  if (!ANTHROPIC_API_KEY) {
    return json(
      { error: 'server_misconfigured', message: 'ANTHROPIC_API_KEY not set' },
      500,
    );
  }

  // Parse body.
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const { book_id, message } = body;
  if (!book_id || !message?.trim()) {
    return json({ error: 'missing_fields' }, 400);
  }
  if (message.length > 4000) {
    return json({ error: 'message_too_long' }, 400);
  }

  // Auth via the caller's JWT. The user-resolution client uses the
  // anon key (NOT service-role) so a leaked or misused reference can't
  // bypass RLS. The service-role client below is scoped to deliberate
  // cross-table writes (insert message → conversations + messages) and
  // is never given the user's Authorization header.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return json({ error: 'unauthorized', message: userErr?.message }, 401);
  }
  const userId = userData.user.id;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Ownership check. The book_id comes from the request body and the
  // queries below run as service-role (bypassing RLS), so we need an
  // explicit `books.user_id = jwt_uid` filter or any signed-in user
  // could chat with any other user's book content.
  const { data: ownedBook, error: ownErr } = await supabase
    .from('books')
    .select('id')
    .eq('id', book_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (ownErr) {
    console.warn('[chat-message] ownership check failed:', ownErr.message);
    return json({ error: 'lookup_failed' }, 500);
  }
  if (!ownedBook) {
    return json({ error: 'not_found' }, 404);
  }

  try {
    // 1. Get or create conversation. We treat (user, book) as a single
    // canonical thread for now — simpler UX, simpler caching. If we
    // ever want multi-thread, we'd thread the conversation_id through
    // and skip the lookup.
    let conversationId = body.conversation_id ?? null;
    if (!conversationId) {
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .eq('user_id', userId)
        .eq('book_id', book_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing?.id) {
        conversationId = existing.id;
      } else {
        const { data: created, error: createErr } = await supabase
          .from('conversations')
          .insert({ user_id: userId, book_id })
          .select('id')
          .single();
        if (createErr || !created) {
          return json(
            { error: 'conversation_create_failed', message: createErr?.message },
            500,
          );
        }
        conversationId = created.id;
      }
    }

    // 2. Load conversation history (recent first, then re-flip for
    // chronological feed to the LLM).
    const { data: history } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(MAX_HISTORY_MESSAGES);

    const priorMessages = (history ?? []).reverse() as Array<{
      role: 'user' | 'assistant';
      content: string;
    }>;

    // 3. Load book content. Concatenate page contents up to the soft
    // cap. We grab `content` (the plain-text 200-word slice) which is
    // perfect for grounding — no formatting noise.
    const { data: pages, error: pagesErr } = await supabase
      .from('pages')
      .select('content')
      .eq('book_id', book_id)
      .order('page_index', { ascending: true });
    if (pagesErr) {
      return json({ error: 'pages_lookup_failed', message: pagesErr.message }, 500);
    }
    if (!pages || pages.length === 0) {
      return json({ error: 'book_not_processed' }, 400);
    }

    let bookText = '';
    for (const p of pages) {
      if (!p.content) continue;
      if (bookText.length + p.content.length > MAX_BOOK_CHARS) {
        // Append what fits and stop. The truncation is silent — we
        // could surface a "this is a long book" hint but for now
        // accept the answer-from-prefix limitation until RAG lands.
        bookText += p.content.slice(0, MAX_BOOK_CHARS - bookText.length);
        break;
      }
      bookText += p.content + '\n\n';
    }

    // 4. Insert the user message before calling the LLM. If the LLM
    // call fails, the user's message is still saved — the client can
    // re-send and try again.
    const { data: userMsg, error: userInsertErr } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        role: 'user',
        content: message,
      })
      .select('id, content, role, created_at')
      .single();
    if (userInsertErr || !userMsg) {
      return json(
        { error: 'message_insert_failed', message: userInsertErr?.message },
        500,
      );
    }

    // 5. Call Anthropic. The book text goes into a cached system
    // block; the conversation history (incl. the new user message)
    // goes in `messages`.
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const t0 = Date.now();

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT_PREFIX + bookText + SYSTEM_PROMPT_SUFFIX,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        ...priorMessages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: message },
      ],
    });

    const replyText = response.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    if (!replyText) {
      return json({ error: 'empty_reply' }, 500);
    }

    // 6. Persist assistant message.
    const { data: aiMsg, error: aiInsertErr } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: replyText,
      })
      .select('id, content, role, created_at')
      .single();
    if (aiInsertErr) {
      // Reply went through but persisting failed — surface the reply
      // anyway so the user sees an answer; log the failure for our
      // sake. They lose the message on next thread reload but get
      // value from this turn.
      console.warn('[chat-message] assistant insert failed:', aiInsertErr.message);
    }

    console.log(
      `[chat-message] generated in ${Date.now() - t0}ms (history=${priorMessages.length} bookChars=${bookText.length} replyChars=${replyText.length})`,
    );

    return json(
      {
        conversation_id: conversationId,
        user_message: userMsg,
        assistant_message: aiMsg ?? {
          id: 'transient',
          content: replyText,
          role: 'assistant',
          created_at: new Date().toISOString(),
        },
      },
      200,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[chat-message] failed:', message);
    return json({ error: 'llm_failed', message }, 500);
  }
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
