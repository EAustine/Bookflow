/**
 * Shared AI-credit metering for the Anthropic-backed edge functions.
 *
 * Every `anthropic.messages.create` response carries a `usage` object that
 * the functions previously discarded. We convert it to "credits" (the unit
 * the app surfaces in its meters) and record it via the `record_ai_usage`
 * RPC, which also rolls the monthly counter on `profiles`.
 *
 * Recording is strictly best-effort: a metering failure must never turn a
 * successful generation into a user-facing error.
 */

export type AnthropicUsage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

/**
 * Token → credit conversion. We bill on non-cached input + output (output
 * weighted ~5×, since it costs roughly that much more than input on
 * Anthropic). Tuned so a typical single-page summary lands near the "~2K
 * credits" the UI advertises.
 *
 * Cache tokens are deliberately NOT billed: chat caches the entire book text
 * in its prompt, so counting cache-creation/-read would make the first chat
 * message alone cost tens of thousands of credits — penalising users for an
 * optimisation that actually makes their request cheaper. The raw cache
 * token counts are still recorded in the ledger for cost auditing.
 */
export function creditsFromUsage(u: AnthropicUsage | null | undefined): {
  credits: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate: number;
} {
  const input = Math.max(0, Math.round(u?.input_tokens ?? 0));
  const output = Math.max(0, Math.round(u?.output_tokens ?? 0));
  const cacheRead = Math.max(0, Math.round(u?.cache_read_input_tokens ?? 0));
  const cacheCreate = Math.max(0, Math.round(u?.cache_creation_input_tokens ?? 0));
  const credits = Math.ceil(input + output * 5);
  return { credits, input, output, cacheRead, cacheCreate };
}

/** Sum two usage objects — for functions that make more than one LLM call
 * per request (e.g. practice generation's JSON-repair retry). */
export function addUsage(
  a: AnthropicUsage | null | undefined,
  b: AnthropicUsage | null | undefined,
): AnthropicUsage {
  return {
    input_tokens: (a?.input_tokens ?? 0) + (b?.input_tokens ?? 0),
    output_tokens: (a?.output_tokens ?? 0) + (b?.output_tokens ?? 0),
    cache_read_input_tokens:
      (a?.cache_read_input_tokens ?? 0) + (b?.cache_read_input_tokens ?? 0),
    cache_creation_input_tokens:
      (a?.cache_creation_input_tokens ?? 0) + (b?.cache_creation_input_tokens ?? 0),
  };
}

type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};

/**
 * Record one AI operation's usage. Never throws. Skips zero-credit calls
 * (shouldn't happen on a real generation, but guards against empty usage).
 */
export async function recordAiUsage(
  supabase: RpcClient,
  args: {
    userId: string;
    tool: 'summary' | 'chat' | 'practice' | 'translation' | string;
    bookId?: string | null;
    model?: string | null;
    usage: AnthropicUsage | null | undefined;
  },
): Promise<void> {
  try {
    const { credits, input, output, cacheRead, cacheCreate } = creditsFromUsage(
      args.usage,
    );
    if (credits <= 0) return;
    const { error } = await supabase.rpc('record_ai_usage', {
      p_user: args.userId,
      p_tool: args.tool,
      p_book: args.bookId ?? null,
      p_model: args.model ?? null,
      p_input: input,
      p_output: output,
      p_cache_read: cacheRead,
      p_cache_create: cacheCreate,
      p_credits: credits,
    });
    if (error) console.warn('[aiCredits] record_ai_usage failed:', error);
  } catch (err) {
    console.warn('[aiCredits] recordAiUsage threw:', err);
  }
}

// deno-lint-ignore no-explicit-any
type DbClient = { from: (table: string) => any };

/**
 * Server-authoritative monthly limit check. Reads the profile's running
 * counter + period anchor + plan limit (the limit is maintained by the
 * RevenueCat webhook: 500K for Pro, 50K for free). Period-aware — a counter
 * left over from a prior month reads as 0, mirroring the RPC's roll.
 *
 * Fails OPEN: a DB hiccup must never block a (possibly paying) user
 * mid-generation. The authoritative accounting still happens on the record
 * side; this is the gate.
 */
export async function checkAiCreditLimit(
  supabase: DbClient,
  userId: string,
): Promise<{ allowed: boolean; used: number; limit: number }> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select(
        'ai_credits_used, ai_credits_limit, ai_credits_period_start, ai_credits_balance, ai_credits_balance_expires_at',
      )
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return { allowed: true, used: 0, limit: 0 };
    const now = new Date();
    const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const psRaw = data.ai_credits_period_start as string | null | undefined;
    const ps = psRaw ? new Date(psRaw).getTime() : 0;
    const rawUsed = (data.ai_credits_used as number | null | undefined) ?? 0;
    const used = ps >= monthStart ? rawUsed : 0;
    const limit = (data.ai_credits_limit as number | null | undefined) ?? 50000;
    // Purchased top-up balance (expiry-aware) extends availability beyond the
    // monthly allowance.
    const balExpRaw = data.ai_credits_balance_expires_at as string | null | undefined;
    const balExp = balExpRaw ? new Date(balExpRaw).getTime() : 0;
    const balance =
      balExp > now.getTime()
        ? ((data.ai_credits_balance as number | null | undefined) ?? 0)
        : 0;
    return { allowed: used < limit || balance > 0, used, limit };
  } catch {
    return { allowed: true, used: 0, limit: 0 }; // fail open
  }
}
