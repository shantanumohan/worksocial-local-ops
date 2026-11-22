/**
 * T-X063 — Indirect prompt-injection exfiltration boundary.
 *
 * Untrusted web/email content that embeds instructions to exfiltrate secrets
 * is denied at the trust + effect boundary. Untrusted sources are never
 * instruction-eligible; secret_exfiltration / credential_access are absolute
 * denials. Pure — no network I/O. External effects: NONE.
 */

import {
  ArtifactTrustLabel,
  type ArtifactTrustLabelValue,
} from "./input-package.js";
import {
  roleForbidsEffect,
  type AgentRoleId,
} from "./agent-roles.js";

/** Channel that delivered the untrusted content. */
export const IndirectInjectionChannel = {
  WEB: "web",
  EMAIL: "email",
  ATTACHMENT: "attachment",
} as const;

export type IndirectInjectionChannelValue =
  (typeof IndirectInjectionChannel)[keyof typeof IndirectInjectionChannel];

/** Effects an injection payload may try to coerce. */
export const ExfiltrationEffect = {
  SECRET_EXFILTRATION: "secret_exfiltration",
  CREDENTIAL_ACCESS: "credential_access",
  BROKER_SECRET_READ: "broker_secret_read",
} as const;

export type ExfiltrationEffectValue =
  (typeof ExfiltrationEffect)[keyof typeof ExfiltrationEffect];

const EXFILTRATION_EFFECTS = new Set<string>(Object.values(ExfiltrationEffect));

export type IndirectPromptInjectionBoundaryInput = {
  channel: IndirectInjectionChannelValue;
  trustLabel: ArtifactTrustLabelValue;
  /** Effect the injected content tries to coerce. */
  attemptedEffect: string;
  /** Role the injection tries to coerce (optional honesty check). */
  coercedRoleId?: AgentRoleId;
};

export type IndirectPromptInjectionBoundaryDecision =
  | {
      allowed: false;
      code:
        | "UNTRUSTED_SOURCE_NOT_INSTRUCTION"
        | "EXFILTRATION_DENIED"
        | "CREDENTIAL_ACCESS_DENIED";
      reason: string;
      instructionEligible: false;
      externalEffects: "NONE";
    }
  | {
      allowed: true;
      reason: string;
      instructionEligible: true;
      externalEffects: "NONE";
    };

/**
 * Evaluate whether untrusted web/email content may become instructions that
 * exfiltrate secrets. Attack path always denies; trusted non-exfil paths pass
 * this boundary only (other gates still apply).
 */
export function evaluateIndirectPromptInjectionBoundary(
  input: IndirectPromptInjectionBoundaryInput,
): IndirectPromptInjectionBoundaryDecision {
  const isUntrusted =
    input.trustLabel === ArtifactTrustLabel.UNTRUSTED_SOURCE ||
    input.trustLabel === ArtifactTrustLabel.MEASURED_EVIDENCE;
  const isExfil = EXFILTRATION_EFFECTS.has(input.attemptedEffect);

  // Absolute: credential / secret effects never leave the broker boundary.
  if (input.attemptedEffect === ExfiltrationEffect.CREDENTIAL_ACCESS) {
    return {
      allowed: false,
      code: "CREDENTIAL_ACCESS_DENIED",
      reason: `credential_access denied at broker boundary (channel=${input.channel})`,
      instructionEligible: false,
      externalEffects: "NONE",
    };
  }
  if (
    input.attemptedEffect === ExfiltrationEffect.SECRET_EXFILTRATION ||
    input.attemptedEffect === ExfiltrationEffect.BROKER_SECRET_READ
  ) {
    return {
      allowed: false,
      code: "EXFILTRATION_DENIED",
      reason: `${input.attemptedEffect} denied — secrets stay in broker; no exfiltration (channel=${input.channel})`,
      instructionEligible: false,
      externalEffects: "NONE",
    };
  }

  // Untrusted web/email/attachment content is evidence only — never instructions.
  if (isUntrusted) {
    return {
      allowed: false,
      code: "UNTRUSTED_SOURCE_NOT_INSTRUCTION",
      reason: `Untrusted ${input.channel} content is not instruction-eligible; indirect prompt injection cannot widen tools`,
      instructionEligible: false,
      externalEffects: "NONE",
    };
  }

  // Role-level forbid when a coerced role explicitly bans the effect.
  if (
    input.coercedRoleId &&
    isExfil &&
    roleForbidsEffect(input.coercedRoleId, input.attemptedEffect)
  ) {
    return {
      allowed: false,
      code: "EXFILTRATION_DENIED",
      reason: `${input.coercedRoleId} forbids ${input.attemptedEffect}`,
      instructionEligible: false,
      externalEffects: "NONE",
    };
  }

  // Trusted instruction + non-exfil operation: this boundary allows.
  if (input.trustLabel === ArtifactTrustLabel.TRUSTED_INSTRUCTION && !isExfil) {
    return {
      allowed: true,
      reason: "Trusted instruction with non-exfiltration effect passes injection boundary",
      instructionEligible: true,
      externalEffects: "NONE",
    };
  }

  return {
    allowed: false,
    code: "EXFILTRATION_DENIED",
    reason: "Indirect prompt-injection exfiltration boundary denies by default",
    instructionEligible: false,
    externalEffects: "NONE",
  };
}

/** True when an effect string is an absolute exfiltration/credential denial. */
export function isAbsoluteExfiltrationEffect(effect: string): boolean {
  return EXFILTRATION_EFFECTS.has(effect);
}
