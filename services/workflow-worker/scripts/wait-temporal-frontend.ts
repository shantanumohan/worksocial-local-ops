/**
 * Poll Temporal until frontend dials AND the target namespace is registered.
 * Lives in @worksocial/workflow-worker (declares @temporalio/client) so pnpm
 * can resolve the SDK — do not run this file from the monorepo root importer.
 *
 * Usage:
 *   pnpm --filter @worksocial/workflow-worker run wait:temporal
 *   # or, with cwd=services/workflow-worker:
 *   pnpm run wait:temporal
 *
 * Env:
 *   TEMPORAL_ADDRESS (default 127.0.0.1:7233)
 *   TEMPORAL_NAMESPACE (default default)
 *   WORKSOCIAL_TEMPORAL_WAIT_ATTEMPTS (default 90)
 *   WORKSOCIAL_TEMPORAL_WAIT_MS (default 2000)
 *   WORKSOCIAL_TEMPORAL_CONNECT_TIMEOUT_MS (default 2000)
 */

import { Connection } from "@temporalio/client";

const address = process.env.TEMPORAL_ADDRESS?.trim() || "127.0.0.1:7233";
const namespace = process.env.TEMPORAL_NAMESPACE?.trim() || "default";
const attempts = Number(process.env.WORKSOCIAL_TEMPORAL_WAIT_ATTEMPTS ?? 90);
const waitMs = Number(process.env.WORKSOCIAL_TEMPORAL_WAIT_MS ?? 2000);
const connectTimeout = Number(
  process.env.WORKSOCIAL_TEMPORAL_CONNECT_TIMEOUT_MS ?? 2000,
);

async function probeReady(): Promise<void> {
  const connection = await Connection.connect({
    address,
    connectTimeout,
  });
  try {
    // auto-setup registers the namespace asynchronously after SERVING;
    // dial alone is not enough for workflow start / worker poll.
    await connection.workflowService.describeNamespace({ namespace });
  } finally {
    await connection.close();
  }
}

async function main(): Promise<void> {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await probeReady();
      console.log(
        JSON.stringify({
          status: "READY",
          address,
          namespace,
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
          namespace,
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
      namespace,
      attempts,
      detail:
        "Temporal frontend/namespace did not become ready for SDK use in time",
    }),
  );
  process.exit(1);
}

void main();
