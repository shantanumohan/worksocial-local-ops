import { z } from "zod";

/**
 * Command denial / stop-condition codes for the action gateway and API.
 * Stubs for WP01–WP02; OpenAPI shapes will expand in later work packages.
 */
export const CommandErrorCode = z.enum([
  "SOURCE_STALE",
  "OUTBOUND_STOPPED",
  "GRANT_MISSING",
  "GRANT_EXPIRED",
  "REVISION_MISMATCH",
  "CONVERSATION_TAKEOVER",
  "BUDGET_EXHAUSTED",
  "UNKNOWN_REMOTE_OUTCOME",
  "PREREQUISITE_MISSING",
  "PREREQUISITE_CONFLICT",
  "POLICY_DENIED",
  "OWNERSHIP_UNPROVEN",
  "NEEDS_REAUTH",
  "UNSUPPORTED_ACTION",
  "QUARANTINED",
]);

export type CommandErrorCode = z.infer<typeof CommandErrorCode>;

export const CommandErrorSchema = z.object({
  code: CommandErrorCode,
  message: z.string().min(1),
  retryable: z.boolean().default(false),
  details: z.record(z.unknown()).optional(),
});

export type CommandError = z.infer<typeof CommandErrorSchema>;
