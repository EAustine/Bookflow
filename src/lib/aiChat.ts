import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '~/lib/supabase';

/**
 * Book-grounded chat. One canonical conversation per (user, book) —
 * we pick the most-recent existing thread (or create one) on mount
 * and append from there. The edge function handles auth, prompt
 * caching, and persistence; the client just sends user messages and
 * appends the returned pair to the on-screen list.
 */

export type ChatRole = 'user' | 'assistant';

export type ChatRecord = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: Date;
  /**
   * Set on optimistic / failed local rows that don't exist on the
   * server yet. The retry path resends the same content; the success
   * path swaps the optimistic id for the persisted server id.
   */
  pending?: boolean;
  failed?: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RawMessage = {
  id: string;
  role: ChatRole;
  content: string | null;
  created_at: string;
};

function rawToRecord(raw: RawMessage): ChatRecord {
  return {
    id: raw.id,
    role: raw.role,
    content: raw.content ?? '',
    createdAt: new Date(raw.created_at),
  };
}

/**
 * Loads the existing conversation for (user, book) — returns
 * `{ conversationId, messages }` or `{ conversationId: null, messages: [] }`
 * if there's no thread yet (caller's first send creates it server-side).
 */
async function loadConversation(bookId: string): Promise<{
  conversationId: string | null;
  messages: ChatRecord[];
}> {
  if (!UUID_RE.test(bookId)) return { conversationId: null, messages: [] };

  // Each Supabase call can throw a `TypeError: Network request failed`
  // when the device is offline. Without try/catch the rejection
  // propagates up through the `useChat` mount effect (which has no
  // surrounding try/catch either) and lands in React Native's
  // LogBox as a red "TypeError: Network request failed" toast at
  // the bottom of the Chat screen. That toast is dev-mode noise
  // unrelated to the friendly errors we already surface in the
  // panel itself — catch each network call and fall back to "no
  // prior conversation" semantics, which is the same outcome as
  // having no conversation at all.
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { conversationId: null, messages: [] };

    const { data: conv } = await supabase
      .from('conversations')
      .select('id')
      .eq('user_id', user.id)
      .eq('book_id', bookId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conv?.id) return { conversationId: null, messages: [] };

    const { data: rows } = await supabase
      .from('messages')
      .select('id, role, content, created_at')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true });

    return {
      conversationId: conv.id,
      messages: (rows ?? []).map((r) => rawToRecord(r as RawMessage)),
    };
  } catch (err) {
    console.warn('[aiChat] loadConversation failed:', err);
    return { conversationId: null, messages: [] };
  }
}

export type SendChatResult =
  | { ok: true; userMessage: ChatRecord; assistantMessage: ChatRecord; conversationId: string }
  | { ok: false; error: string; message?: string };

async function sendChatMessage(args: {
  bookId: string;
  conversationId: string | null;
  message: string;
}): Promise<SendChatResult> {
  try {
    const { data, error } = await supabase.functions.invoke('chat-message', {
      body: {
        book_id: args.bookId,
        conversation_id: args.conversationId,
        message: args.message,
      },
    });
    if (error) {
      const ctx = (error as { context?: unknown }).context;
      if (ctx && typeof (ctx as Response).text === 'function') {
        try {
          const text = await (ctx as Response).text();
          if (text) {
            try {
              const parsed = JSON.parse(text) as { error: string; message?: string };
              return { ok: false, error: parsed.error, message: parsed.message };
            } catch {
              return { ok: false, error: 'function_failed', message: text.slice(0, 280) };
            }
          }
        } catch {
          // ignore
        }
      }
      return { ok: false, error: 'function_failed', message: error.message };
    }
    if (!data?.user_message || !data?.assistant_message) {
      return { ok: false, error: 'invalid_response' };
    }
    return {
      ok: true,
      userMessage: rawToRecord(data.user_message as RawMessage),
      assistantMessage: rawToRecord(data.assistant_message as RawMessage),
      conversationId: data.conversation_id as string,
    };
  } catch (err) {
    return {
      ok: false,
      error: 'request_failed',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export type UseChatState = {
  /** Loaded conversation history + any optimistic in-flight rows. */
  messages: ChatRecord[];
  /** True while history is loading. After the first send, no spinner. */
  loading: boolean;
  /** True while a send is in flight. */
  sending: boolean;
  /** Last error from the last send attempt, if any. */
  errorMessage: string | null;
  /** Append a user message and dispatch to the edge function. */
  send: (text: string) => Promise<void>;
  /** Re-send a previously-failed user message. */
  retry: (failedId: string) => Promise<void>;
};

export function useChat(bookId: string): UseChatState {
  const [messages, setMessages] = useState<ChatRecord[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Refs so callbacks don't capture stale state.
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const result = await loadConversation(bookId);
      if (cancelled) return;
      setConversationId(result.conversationId);
      setMessages(result.messages);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      setErrorMessage(null);
      setSending(true);

      // Optimistic user row — local id; replaced by the server's id on success.
      const optimisticId = `local-${Date.now()}`;
      const optimisticUser: ChatRecord = {
        id: optimisticId,
        role: 'user',
        content: trimmed,
        createdAt: new Date(),
        pending: true,
      };
      setMessages((prev) => [...prev, optimisticUser]);

      const result = await sendChatMessage({
        bookId,
        conversationId: conversationIdRef.current,
        message: trimmed,
      });

      if (result.ok) {
        setConversationId(result.conversationId);
        setMessages((prev) => {
          // Drop the optimistic row; append the real pair.
          const without = prev.filter((m) => m.id !== optimisticId);
          return [...without, result.userMessage, result.assistantMessage];
        });
      } else {
        // Mark the optimistic row as failed and let the user retry.
        setMessages((prev) =>
          prev.map((m) =>
            m.id === optimisticId ? { ...m, pending: false, failed: true } : m,
          ),
        );
        setErrorMessage(result.message ?? errorCodeToMessage(result.error));
      }
      setSending(false);
    },
    [bookId, sending],
  );

  const retry = useCallback(
    async (failedId: string) => {
      const failed = messages.find((m) => m.id === failedId && m.failed);
      if (!failed || sending) return;
      // Drop the failed row; `send` re-creates the optimistic version.
      setMessages((prev) => prev.filter((m) => m.id !== failedId));
      await send(failed.content);
    },
    [messages, send, sending],
  );

  return { messages, loading, sending, errorMessage, send, retry };
}

function errorCodeToMessage(code: string): string {
  switch (code) {
    case 'book_not_processed':
      return "This book hasn't been processed yet. Long-press it in the library and tap Re-process.";
    case 'message_too_long':
      return 'Your question is too long — try keeping it under a few sentences.';
    case 'unauthorized':
      return 'You need to be signed in to chat.';
    case 'server_misconfigured':
      return 'The chat service is temporarily unavailable.';
    case 'llm_failed':
      return "The model couldn't generate a reply. Try again in a moment.";
    case 'request_failed':
    case 'function_failed':
      return 'Network issue talking to the chat service.';
    default:
      return 'Something went wrong sending your message.';
  }
}
