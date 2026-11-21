/**
 * Temporal client helpers for starting durable mission workflows.
 */

import { Client, Connection } from "@temporalio/client";
import { TEMPORAL_TASK_QUEUE } from "../temporal-binding.js";
import type { TemporalMissionInput, TemporalMissionResult } from "./types.js";

export type TemporalMissionClient = {
  client: Client;
  connection: Connection;
  startMission(
    input: TemporalMissionInput,
    options?: { workflowId?: string; taskQueue?: string },
  ): Promise<{ workflowId: string; runId: string }>;
  awaitMission(workflowId: string): Promise<TemporalMissionResult>;
  signalReviewApproved(workflowId: string, reviewToken: string): Promise<void>;
  close(): Promise<void>;
};

export async function createTemporalMissionClient(options: {
  address: string;
  namespace?: string;
}): Promise<TemporalMissionClient> {
  const namespace = options.namespace ?? "default";
  const connection = await Connection.connect({ address: options.address });
  const client = new Client({ connection, namespace });

  return {
    client,
    connection,
    async startMission(input, startOptions) {
      const workflowId =
        startOptions?.workflowId ?? `mission-${input.envelope.workflowId}`;
      const handle = await client.workflow.start("durableMissionWorkflow", {
        taskQueue: startOptions?.taskQueue ?? TEMPORAL_TASK_QUEUE,
        workflowId,
        args: [input],
      });
      return { workflowId: handle.workflowId, runId: handle.firstExecutionRunId };
    },
    async awaitMission(workflowId) {
      const handle = client.workflow.getHandle(workflowId);
      return (await handle.result()) as TemporalMissionResult;
    },
    async signalReviewApproved(workflowId, reviewToken) {
      const handle = client.workflow.getHandle(workflowId);
      await handle.signal("reviewApproved", reviewToken);
    },
    async close() {
      await connection.close();
    },
  };
}
