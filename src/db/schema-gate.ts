/**
 * A retryable, observable initializer for idempotent DDL.
 *
 * Kept dependency-free so its retry semantics can be unit-tested without a
 * database connection:
 *
 *  - a **success** is remembered for the life of the process;
 *  - a **failure** is never cached, so a transient outage is retried;
 *  - callers get an explicit `{ ok }` result and must not touch the new columns
 *    when it is `false`.
 */

export type SchemaStatus = { ok: true } | { ok: false; error: string };

export type SchemaGate = {
  ensure(): Promise<SchemaStatus>;
  reset(): void;
  lastError(): string | null;
};

/**
 * Human-readable failure text, including the underlying cause.
 *
 * Drizzle wraps driver errors in `DrizzleQueryError` whose own message is just
 * "Failed query: <sql> params: <params>". Without the cause, a wrong password,
 * an unreachable host and a missing table all look identical in the UI and in
 * the 503 body, so the cause is appended when it adds information.
 */
export function messageOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? (error as { cause?: unknown }).cause : undefined;
  if (cause instanceof Error && cause.message && !message.includes(cause.message)) {
    return `${message.trim()} (${cause.message})`;
  }
  return message;
}

export function createSchemaGate(
  apply: () => Promise<void>,
  label = "schema",
): SchemaGate {
  let inFlight: Promise<SchemaStatus> | null = null;
  let succeeded = false;
  let lastFailure: string | null = null;

  return {
    ensure(): Promise<SchemaStatus> {
      if (succeeded) return Promise.resolve({ ok: true });
      if (inFlight) return inFlight;

      // Wrapped so a synchronously-throwing `apply` becomes a status, not an
      // exception escaping `ensure()`.
      const attempt: Promise<SchemaStatus> = Promise.resolve()
        .then(() => apply())
        .then(
          (): SchemaStatus => {
            succeeded = true;
            lastFailure = null;
            return { ok: true };
          },
          (error: unknown): SchemaStatus => {
            lastFailure = messageOf(error);
            // Deliberately not cached: the next call retries.
            console.error(`[${label}] initialization failed: ${lastFailure}`);
            return { ok: false, error: lastFailure };
          },
        );

      const tracked = attempt.finally(() => {
        if (inFlight === tracked) inFlight = null;
      });
      inFlight = tracked;
      return tracked;
    },

    reset() {
      inFlight = null;
      succeeded = false;
      lastFailure = null;
    },

    lastError() {
      return lastFailure;
    },
  };
}
