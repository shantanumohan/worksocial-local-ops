/**
 * T-X063 — Indirect prompt-injection exfiltration boundary.
 *
 * Untrusted web/email content that embeds instructions to exfiltrate secrets
 * is denied at the trust + effect boundary. Untrusted sources are never
 * instruction-eligible; secret_exfiltration / credential_access are absolute
 * denials. Pure — no network I/O. External effects: NONE.
 * Live provider wiring: NOT_WIRED (fixture honesty).
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

export const INDIRECT_PROMPT_INJECTION_RELATED_CASE_IDS = ["T-X063"] as const;

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
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
    }
  | {
      allowed: true;
      reason: string;
      instructionEligible: true;
      liveProviderWiring: "NOT_WIRED";
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
      liveProviderWiring: "NOT_WIRED",
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
      liveProviderWiring: "NOT_WIRED",
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
      liveProviderWiring: "NOT_WIRED",
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
      liveProviderWiring: "NOT_WIRED",
      externalEffects: "NONE",
    };
  }

  // Trusted instruction + non-exfil operation: this boundary allows.
  if (input.trustLabel === ArtifactTrustLabel.TRUSTED_INSTRUCTION && !isExfil) {
    return {
      allowed: true,
      reason: "Trusted instruction with non-exfiltration effect passes injection boundary",
      instructionEligible: true,
      liveProviderWiring: "NOT_WIRED",
      externalEffects: "NONE",
    };
  }

  return {
    allowed: false,
    code: "EXFILTRATION_DENIED",
    reason: "Indirect prompt-injection exfiltration boundary denies by default",
    instructionEligible: false,
    liveProviderWiring: "NOT_WIRED",
    externalEffects: "NONE",
  };
}

/** True when an effect string is an absolute exfiltration/credential denial. */
export function isAbsoluteExfiltrationEffect(effect: string): boolean {
  return EXFILTRATION_EFFECTS.has(effect);
}

/**
 * Hillclimb suite: every channel × every absolute exfil effect is denied with
 * fixture honesty fields. Used by domain tests and the T-X063 soak proof.
 */
export function evaluateIndirectPromptInjectionAttackSuite(): {
  passed: boolean;
  details: string[];
  decisions: IndirectPromptInjectionBoundaryDecision[];
} {
  const details: string[] = [];
  const decisions: IndirectPromptInjectionBoundaryDecision[] = [];
  let passed = true;

  const channels = Object.values(IndirectInjectionChannel);
  const effects = Object.values(ExfiltrationEffect);
  const trusts = [
    ArtifactTrustLabel.UNTRUSTED_SOURCE,
    ArtifactTrustLabel.MEASURED_EVIDENCE,
    ArtifactTrustLabel.TRUSTED_INSTRUCTION,
  ] as const;

  for (const channel of channels) {
    for (const effect of effects) {
      for (const trustLabel of trusts) {
        const decision = evaluateIndirectPromptInjectionBoundary({
          channel,
          trustLabel,
          attemptedEffect: effect,
          coercedRoleId: "A27",
        });
        decisions.push(decision);
        if (decision.allowed) {
          passed = false;
          details.push(
            `UNEXPECTED_ALLOW channel=${channel} trust=${trustLabel} effect=${effect}`,
          );
          continue;
        }
        if (decision.liveProviderWiring !== "NOT_WIRED") {
          passed = false;
          details.push(`liveProviderWiring elevated for ${effect}`);
        }
        if (decision.externalEffects !== "NONE") {
          passed = false;
          details.push(`externalEffects not NONE for ${effect}`);
        }
        if (decision.instructionEligible !== false) {
          passed = false;
          details.push(`instructionEligible unexpectedly true for ${effect}`);
        }
        const expectedCode =
          effect === ExfiltrationEffect.CREDENTIAL_ACCESS
            ? "CREDENTIAL_ACCESS_DENIED"
            : "EXFILTRATION_DENIED";
        if (decision.code !== expectedCode) {
          passed = false;
          details.push(
            `code=${decision.code} expected=${expectedCode} channel=${channel} trust=${trustLabel} effect=${effect}`,
          );
        }
      }
    }
  }

  if (passed) {
    details.push(
      `Absolute exfil denied across ${channels.length} channels × ${effects.length} effects × ${trusts.length} trust labels`,
    );
    details.push(
      "liveProviderWiring=NOT_WIRED externalEffects=NONE instructionEligible=false on every attack path",
    );
  }

  // MEASURED_EVIDENCE never becomes instructions (even for benign summarize).
  const measured = evaluateIndirectPromptInjectionBoundary({
    channel: IndirectInjectionChannel.WEB,
    trustLabel: ArtifactTrustLabel.MEASURED_EVIDENCE,
    attemptedEffect: "summarize_page",
  });
  decisions.push(measured);
  if (
    measured.allowed === false &&
    measured.code === "UNTRUSTED_SOURCE_NOT_INSTRUCTION" &&
    measured.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "MEASURED_EVIDENCE summarize_page → UNTRUSTED_SOURCE_NOT_INSTRUCTION (not instruction-eligible)",
    );
  } else {
    passed = false;
    details.push(`MEASURED_EVIDENCE summarize unexpectedly ${JSON.stringify(measured)}`);
  }

  // Positive control: trusted non-exfil still passes this boundary only.
  const trustedOk = evaluateIndirectPromptInjectionBoundary({
    channel: IndirectInjectionChannel.WEB,
    trustLabel: ArtifactTrustLabel.TRUSTED_INSTRUCTION,
    attemptedEffect: "summarize_faq",
    coercedRoleId: "A27",
  });
  decisions.push(trustedOk);
  if (
    trustedOk.allowed &&
    trustedOk.instructionEligible === true &&
    trustedOk.liveProviderWiring === "NOT_WIRED" &&
    trustedOk.externalEffects === "NONE"
  ) {
    details.push(
      "Trusted instruction + summarize_faq passes injection boundary (positive control)",
    );
  } else {
    passed = false;
    details.push(`Trusted positive control unexpectedly ${JSON.stringify(trustedOk)}`);
  }

  return { passed, details, decisions };
}

export type IndirectPromptInjectionAttackSuiteResult = ReturnType<
  typeof evaluateIndirectPromptInjectionAttackSuite
>;

/** Compare full attack-suite output (not details.length alone). */
export function indirectPromptInjectionAttackSuiteContentEqual(
  baseline: IndirectPromptInjectionAttackSuiteResult,
  other: IndirectPromptInjectionAttackSuiteResult,
): boolean {
  if (baseline.passed !== other.passed) {
    return false;
  }
  if (baseline.details.length !== other.details.length) {
    return false;
  }
  for (let i = 0; i < baseline.details.length; i++) {
    if (baseline.details[i] !== other.details[i]) {
      return false;
    }
  }
  if (baseline.decisions.length !== other.decisions.length) {
    return false;
  }
  for (let i = 0; i < baseline.decisions.length; i++) {
    if (
      JSON.stringify(baseline.decisions[i]) !==
      JSON.stringify(other.decisions[i])
    ) {
      return false;
    }
  }
  return true;
}
