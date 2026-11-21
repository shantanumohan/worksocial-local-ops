/**
 * Temporal worker factory for local durable missions.
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NativeConnection, Worker } from "@temporalio/worker";
import { TEMPORAL_TASK_QUEUE } from "../temporal-binding.js";
import type { DurableMissionRuntime } from "../durable-mission.js";
import { temporalMissionActivities } from "./activities.js";
import { bindMissionRuntime } from "./runtime-context.js";

export type CreateTemporalWorkerOptions = {
  address: string;
  namespace?: string;
  taskQueue?: string;
  runtime: DurableMissionRuntime;
  /** Optional pre-built native connection (tests / shared). */
  connection?: NativeConnection;
};

function resolveWorkflowsPath(): string {
  const js = fileURLToPath(new URL("./workflows.js", import.meta.url));
  const ts = fileURLToPath(new URL("./workflows.ts", import.meta.url));
  return existsSync(js) ? js : ts;
}

export async function createTemporalMissionWorker(
  options: CreateTemporalWorkerOptions,
): Promise<Worker> {
  bindMissionRuntime(options.runtime);
  const namespace = options.namespace ?? "default";
  const taskQueue = options.taskQueue ?? TEMPORAL_TASK_QUEUE;
  const connection =
    options.connection ??
    (await NativeConnection.connect({ address: options.address }));

  return Worker.create({
    connection,
    namespace,
    taskQueue,
    workflowsPath: resolveWorkflowsPath(),
    activities: temporalMissionActivities,
  });
}
