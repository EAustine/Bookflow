# M0 spike 4 — job queue

**Question.** Supabase Queues (pgmq), or a `jobs` table drained by a scheduled
function, for book processing and narration?

**Answer.** **The `jobs` table.** Not because pgmq is bad, but because for this
workload a queue does not replace the table — it would sit *beside* one.

Date 2026-10-22 · branch `arch/m0-spikes` · research + code reading, no
prototype

---

## 1. What exists today

| | |
|---|---|
| Trigger | `uploadBook.ts` invokes `process-book` directly |
| Worker | `supabase/functions/process-book/index.ts` — 2,095 lines, a request-bound `Deno.serve` |
| Progress | Client **polls** `books.processing_status` every 1 s for 30 s, then every 3 s |
| Status detail | `books.processing_message`, a human-readable hint |
| Retry | Manual only — `reprocessBook()`, user-initiated |
| `pg_cron` / `pg_net` | **Not used anywhere** |

`process-book/index.ts:67` already says the quiet part:

> `// would need a background worker and progress UI we don't have yet.`

So the real change at M5 is not "pick a queue", it is "stop doing long work
inside a request". Both options do that equally.

## 2. What pgmq actually gives you

Confirmed from Supabase's own docs:

- Operations are exposed as `pgmq_public.send / send_batch / read / pop /
  archive / delete`, over PostgREST. An Edge Function with `service_role` **can**
  consume — a widely repeated claim that Queues is "DB functions only" is wrong.
- **No built-in worker and no scheduler.** Consumers are pull-based; the docs'
  own example triggers `pop` from a button click. You drive reads yourself.
- Exactly-once *within a visibility window*; at-least-once over a message's
  lifetime.
- Included in the database tier, no separate price.
- Third-party reports (not in the official docs): no dead-letter queue, no retry
  limit, no failure alerting — a poison message retries forever. Supabase's
  features page reportedly still labels Queues **Public Alpha**; the docs pages
  carry no status label either way, so treat the maturity as unsettled.

## 3. The argument

**The decisive point is that pgmq has no worker.** Adopting Queues means
pgmq **plus** `pg_cron` **plus** `pg_net` **plus** a consumer Edge Function.
The `jobs` table means `pg_cron` **plus** `pg_net` **plus** a consumer Edge
Function **plus** a table you design. The queue does not save the scheduling
work, which is the part that does not exist today.

What it costs instead:

1. **§9.1 already requires `jobs`.** The Library reads processing progress from
   it. A queue does not remove that requirement, so choosing pgmq means running
   both — a queue for dispatch and a table for state — and keeping them
   consistent.
2. **Progress is the product requirement, and queues are bad at it.** A pgmq
   message is opaque and consumed; you cannot ask "how far along is book X".
   A row can be queried, indexed, and pushed over Realtime — which this repo
   already does for `books` (migration `0004_realtime_books.sql`), so it is a
   pattern the app knows.
3. **Retry policy becomes a column rather than a gap.** No DLQ and no retry
   limit means writing that logic anyway; on a table it is `attempts`,
   `last_error`, `next_attempt_at` — three columns and a `WHERE` clause.
4. **The workload is wrong for a queue.** Book processing is low-volume
   (one message per upload) and very long-running. Queues earn their keep on
   high throughput and fan-out to many workers. Bookflow has neither.

Maturity is a tiebreaker, not the reason. Even if Queues were unambiguously
GA, the first two points would still hold.

## 4. Recommendation

Build `jobs` per §9.1:

```
jobs(id, type, book_id, user_id, status, progress, total,
     message, attempts, last_error, next_attempt_at,
     created_at, started_at, finished_at)
```

- `pg_cron` fires a drain function on a short interval; it claims due jobs with
  `FOR UPDATE SKIP LOCKED` — the same concurrency primitive pgmq is built on —
  and invokes the worker Edge Function via `pg_net`.
- Workers write `progress` / `message` as they go. The Library subscribes over
  Realtime instead of polling, which removes the 1 s poll in `uploadBook.ts`.
- Retries are `attempts < max AND next_attempt_at <= now()`, with exponential
  backoff. A job past the limit lands in `status = 'dead'` — the dead-letter
  queue pgmq does not have.

**Revisit pgmq if** narration fans out to many parallel workers per book, or
message volume stops being one-per-upload. At that point the queue earns its
keep and the `jobs` table stays as the progress projection.

## 5. Not settled

- **No prototype was built.** This is a reading of the docs and of
  `process-book`, not a measurement. The risk is low — `SKIP LOCKED` draining is
  well-trodden — but it is not evidence in the way spikes 1 and 2 are.
- **`pg_cron` minimum interval** and whether `pg_net` timeouts are long enough
  to invoke a worker that may run for minutes. Worth checking at M5 before the
  first migration; if `pg_net` cannot wait, the drain function fires the worker
  and returns, and the worker writes its own completion — which is the better
  shape anyway.
- Supabase Queues' actual maturity label. The docs do not say; the features page
  reportedly says Public Alpha. Not load-bearing for this decision.

Sources: [Supabase Queues](https://supabase.com/docs/guides/queues) ·
[Queues quickstart](https://supabase.com/docs/guides/queues/quickstart) ·
[pgmq in production](https://dev.to/mwiginton/supabase-queues-in-production-dead-letter-queues-retries-and-poison-messages-with-pgmq-28dp)
