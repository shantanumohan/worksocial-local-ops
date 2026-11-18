import { z } from "zod";

/** Role IDs A01–A30 (exactly thirty registered roles). */
export const JobRoleIdSchema = z.string().regex(/^A(0[1-9]|[12][0-9]|30)$/);

/**
 * Job envelope contract — illustrative values only; not live grants or credentials.
 * Mirrors the v3 example shape used by the Claude Code runtime adapter.
 */
export const JobEnvelopeSchema = z.object({
  jobId: z.string().uuid(),
  roleId: JobRoleIdSchema,
  workflowId: z.string().min(1),
  siteId: z.string().min(1),
  assetId: z.string().min(1),
  trigger: z.string().min(1),
  policyVersion: z.string().min(1),
  inputArtifactIds: z.array(z.string().min(1)).default([]),
  capabilityGrantId: z.string().min(1),
  sourceRevision: z.string().min(1),
  maxAttempts: z.number().int().positive().default(2),
  deadlineSeconds: z.number().int().positive(),
  idempotencyKey: z.string().min(1),
  expectedOutcome: z.string().min(1),
});

export type JobEnvelope = z.infer<typeof JobEnvelopeSchema>;
