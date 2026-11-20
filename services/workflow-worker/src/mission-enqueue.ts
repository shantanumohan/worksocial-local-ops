/**
 * Durable mission enqueue stub (R1-04).
 * Temporal self-host is NOT_WIRED locally — missions are accepted into a
 * file-backed / in-process queue via Claude runner with honest status labels.
 */

import type { JobEnvelope } from "@worksocial/contracts";
import { JobEnvelopeSchema } from "@worksocial/contracts";
import type { ClaudeRunner, RoleJobResult } from "@worksocial/claude-runner";

export type TemporalWiringStatus = "NOT_WIRED" | "LOCAL_DURABLE" | "FIXTURE";

export type MissionEnqueueRequest = {
  envelope: JobEnvelope;
  priority?: number;
};

export type MissionEnqueueResult = {
  accepted: boolean;
  temporalStatus: TemporalWiringStatus;
  detail: string;
  workflowId: string;
  run: RoleJobResult | null;
};

export type MissionEnqueueService = {
  readonly temporalStatus: TemporalWiringStatus;
  enqueue(request: MissionEnqueueRequest): Promise<MissionEnqueueResult>;
};

/**
 * Creates a mission enqueue facade. When Temporal is not running locally,
 * jobs execute through the Claude runner in-process and report NOT_WIRED.
 */
export function createMissionEnqueueService(options: {
  runner: ClaudeRunner;
  temporalStatus?: TemporalWiringStatus;
}): MissionEnqueueService {
  const temporalStatus = options.temporalStatus ?? "NOT_WIRED";

  return {
    temporalStatus,
    async enqueue(request) {
      const parsed = JobEnvelopeSchema.safeParse(request.envelope);
      if (!parsed.success) {
        return {
          accepted: false,
          temporalStatus,
          detail: `Invalid envelope: ${parsed.error.message}`,
          workflowId: request.envelope.workflowId,
          run: null,
        };
      }

      const enqueueArgs =
        request.priority !== undefined
          ? { envelope: parsed.data, priority: request.priority }
          : { envelope: parsed.data };

      if (temporalStatus === "NOT_WIRED") {
        const run = await options.runner.enqueue(enqueueArgs);
        return {
          accepted: true,
          temporalStatus: "NOT_WIRED",
          detail:
            "Temporal runtime not bound on this host. Mission executed in-process via claude-runner; durable Temporal workflow ID is advisory only.",
          workflowId: parsed.data.workflowId,
          run,
        };
      }

      if (temporalStatus === "LOCAL_DURABLE") {
        const run = await options.runner.enqueue(enqueueArgs);
        return {
          accepted: true,
          temporalStatus: "LOCAL_DURABLE",
          detail:
            "LOCAL_DURABLE: Postgres-backed mission durability (enqueue/leases/effect boundaries). Temporal cluster remains NOT_WIRED.",
          workflowId: parsed.data.workflowId,
          run,
        };
      }

      // FIXTURE temporal path still uses in-process runner — no live Temporal SDK.
      const run = await options.runner.enqueue(enqueueArgs);
      return {
        accepted: true,
        temporalStatus: "FIXTURE",
        detail:
          "Fixture Temporal wiring: local runner only; not a production Temporal cluster.",
        workflowId: parsed.data.workflowId,
        run,
      };
    },
  };
}
