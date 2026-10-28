/**
 * Shared Supabase client type for the edge functions.
 *
 * `ReturnType<typeof createClient>` looks like the obvious way to type a
 * client parameter, and it is wrong: it resolves to the generic
 * DEFAULTS — `SupabaseClient<unknown, never, GenericSchema>` — whereas
 * an actual `createClient(url, key, …)` call infers
 * `SupabaseClient<any, 'public', any>`. The two are not assignable, so
 * every helper typed that way rejected the client it was handed.
 *
 * Twelve call sites across four functions were affected. Nothing caught
 * it, because `supabase/functions` had no type checking at all until
 * `deno check` was added to CI.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.0';

// deno-lint-ignore no-explicit-any
export type EdgeSupabaseClient = SupabaseClient<any, 'public', any>;
