/**
 * Durable mission enqueue (R1-04 / Temporal wiring).
 * When temporalStatus is TEMPORAL, starts a Temporal workflow; otherwise
 * missions execute in-process via Claude runner with honest labels.
 */

import type { JobEnvelope } from "@worksocial/contracts";
import { JobEnvelopeSchema } from "@worksocial/contracts";
import type { ClaudeRunner, RoleJobResult } from "@worksocial/claude-runner";
import type { TemporalMissionClient } from "./temporal/client.js";

export type TemporalWiringStatus =
  | "NOT_WIRED"
  | "LOCAL_DURABLE"
  | "FIXTURE"
  | "TEMPORAL";

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
  temporalRunId?: string | null;
};

export type MissionEnqueueService = {
  readonly temporalStatus: TemporalWiringStatus;
  enqueue(request: MissionEnqueueRequest): Promise<MissionEnqueueResult>;
};

/**
 * Creates a mission enqueue facade.
 * TEMPORAL path starts a Temporal workflow only when a client is bound.
 * Without a client, refuses to claim TEMPORAL while running Claude in-process.
 */
export function createMissionEnqueueService(options: {
  runner: ClaudeRunner;
  temporalStatus?: TemporalWiringStatus;
  temporalClient?: TemporalMissionClient | null;
}): MissionEnqueueService {
  const temporalStatus = options.temporalStatus ?? "NOT_WIRED";
  const temporalClient = options.temporalClient ?? null;

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
          temporalRunId: null,
        };
      }

      const enqueueArgs =
        request.priority !== undefined
          ? { envelope: parsed.data, priority: request.priority }
          : { envelope: parsed.data };

      if (temporalStatus === "TEMPORAL") {
        if (!temporalClient) {
          // Do not claim TEMPORAL while executing Claude in-process.
          return {
            accepted: false,
            temporalStatus: "NOT_WIRED",
            detail:
              "Temporal label TEMPORAL requires a bound Temporal client. Refusing in-process Claude fallback that would mislabel durability. Bind createTemporalMissionClient when TEMPORAL_ADDRESS is reachable.",
            workflowId: parsed.data.workflowId,
            run: null,
            temporalRunId: null,
          };
        }
        const started = await temporalClient.startMission({
          envelope: {
            jobId: parsed.data.jobId,
            roleId: parsed.data.roleId,
            workflowId: parsed.data.workflowId,
            siteId: parsed.data.siteId,
            assetId: parsed.data.assetId,
            trigger: parsed.data.trigger,
            policyVersion: parsed.data.policyVersion,
            inputArtifactIds: parsed.data.inputArtifactIds ?? [],
            capabilityGrantId: parsed.data.capabilityGrantId,
            sourceRevision: parsed.data.sourceRevision,
            maxAttempts: parsed.data.maxAttempts ?? 2,
            deadlineSeconds: parsed.data.deadlineSeconds ?? 600,
            idempotencyKey: parsed.data.idempotencyKey,
            expectedOutcome: parsed.data.expectedOutcome,
          },
          reviewRequired: false,
          operationId: `op-${parsed.data.workflowId}`,
          payloadDigest: `digest-${parsed.data.idempotencyKey}`,
          businessIdempotencyKey: `biz-${parsed.data.workflowId}`,
          decision: {
            decisionId: `dec-${parsed.data.workflowId}`,
            reason: "temporal mission enqueue",
          },
          holder: "api-enqueue",
        });
        return {
          accepted: true,
          temporalStatus: "TEMPORAL",
          detail:
            "Temporal workflow started on worksocial-missions. Effect boundary remains idempotent; live CMS/Zoho/GSC NOT_WIRED.",
          workflowId: parsed.data.workflowId,
          run: null,
          temporalRunId: started.runId,
        };
      }

      if (temporalStatus === "NOT_WIRED") {
        const run = await options.runner.enqueue(enqueueArgs);
        return {
          accepted: true,
          temporalStatus: "NOT_WIRED",
          detail:
            "Temporal runtime not bound on this host. Mission executed in-process via claude-runner; durable Temporal workflow ID is advisory only.",
          workflowId: parsed.data.workflowId,
          run,
          temporalRunId: null,
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
          temporalRunId: null,
        };
      }

      const run = await options.runner.enqueue(enqueueArgs);
      return {
        accepted: true,
        temporalStatus: "FIXTURE",
        detail:
          "Fixture Temporal wiring: local runner only; not a production Temporal cluster.",
        workflowId: parsed.data.workflowId,
        run,
        temporalRunId: null,
      };
    },
  };
}
