/**
 * Poll Temporal frontend until SDK Connection.connect succeeds.
 * Used by CI temporal-compose job (avoid tsx -e top-level await / CJS eval).
 *
 * Usage:
 *   TEMPORAL_ADDRESS=127.0.0.1:7233 pnpm exec tsx scripts/wait-temporal-frontend.ts
 *
 * Env:
 *   TEMPORAL_ADDRESS (default 127.0.0.1:7233)
 *   WORKSOCIAL_TEMPORAL_WAIT_ATTEMPTS (default 90)
 *   WORKSOCIAL_TEMPORAL_WAIT_MS (default 2000 between attempts)
 *   WORKSOCIAL_TEMPORAL_CONNECT_TIMEOUT_MS (default 2000 per dial)
 */

import { Connection } from "@temporalio/client";

const address = process.env.TEMPORAL_ADDRESS?.trim() || "127.0.0.1:7233";
const attempts = Number(process.env.WORKSOCIAL_TEMPORAL_WAIT_ATTEMPTS ?? 90);
const waitMs = Number(process.env.WORKSOCIAL_TEMPORAL_WAIT_MS ?? 2000);
const connectTimeout = Number(
  process.env.WORKSOCIAL_TEMPORAL_CONNECT_TIMEOUT_MS ?? 2000,
);

async function dialOnce(): Promise<void> {
  const connection = await Connection.connect({
    address,
    connectTimeout,
  });
  await connection.close();
}

async function main(): Promise<void> {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await dialOnce();
      console.log(
        JSON.stringify({
          status: "READY",
          address,
          attempt: i,
        }),
      );
      process.exit(0);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(
        JSON.stringify({
          status: "WAITING",
          address,
          attempt: i,
          attempts,
          detail: message,
        }),
      );
      if (i < attempts) {
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }
  console.error(
    JSON.stringify({
      status: "FAILED",
      address,
      attempts,
      detail: "Temporal frontend did not accept SDK connections in time",
    }),
  );
  process.exit(1);
}

void main();
