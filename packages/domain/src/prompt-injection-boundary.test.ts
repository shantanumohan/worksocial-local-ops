import { describe, expect, it } from "vitest";
import { ArtifactTrustLabel } from "./input-package.js";
import {
  ExfiltrationEffect,
  INDIRECT_PROMPT_INJECTION_RELATED_CASE_IDS,
  IndirectInjectionChannel,
  evaluateIndirectPromptInjectionAttackSuite,
  evaluateIndirectPromptInjectionBoundary,
  isAbsoluteExfiltrationEffect,
} from "./prompt-injection-boundary.js";

describe("evaluateIndirectPromptInjectionBoundary (T-X063)", () => {
  it("denies untrusted web/email content as instructions", () => {
    for (const channel of [
      IndirectInjectionChannel.WEB,
      IndirectInjectionChannel.EMAIL,
      IndirectInjectionChannel.ATTACHMENT,
    ] as const) {
      const decision = evaluateIndirectPromptInjectionBoundary({
        channel,
        trustLabel: ArtifactTrustLabel.UNTRUSTED_SOURCE,
        attemptedEffect: "summarize_page",
      });
      expect(decision.allowed).toBe(false);
      if (!decision.allowed) {
        expect(decision.code).toBe("UNTRUSTED_SOURCE_NOT_INSTRUCTION");
        expect(decision.instructionEligible).toBe(false);
        expect(decision.liveProviderWiring).toBe("NOT_WIRED");
        expect(decision.externalEffects).toBe("NONE");
      }
    }
  });

  it("denies MEASURED_EVIDENCE as instructions even for benign summarize", () => {
    const decision = evaluateIndirectPromptInjectionBoundary({
      channel: IndirectInjectionChannel.EMAIL,
      trustLabel: ArtifactTrustLabel.MEASURED_EVIDENCE,
      attemptedEffect: "summarize_page",
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.code).toBe("UNTRUSTED_SOURCE_NOT_INSTRUCTION");
      expect(decision.liveProviderWiring).toBe("NOT_WIRED");
    }
  });

  it("denies secret_exfiltration and credential_access absolutely", () => {
    const secret = evaluateIndirectPromptInjectionBoundary({
      channel: IndirectInjectionChannel.WEB,
      trustLabel: ArtifactTrustLabel.TRUSTED_INSTRUCTION,
      attemptedEffect: ExfiltrationEffect.SECRET_EXFILTRATION,
      coercedRoleId: "A27",
    });
    expect(secret.allowed).toBe(false);
    if (!secret.allowed) {
      expect(secret.code).toBe("EXFILTRATION_DENIED");
      expect(secret.liveProviderWiring).toBe("NOT_WIRED");
      expect(secret.externalEffects).toBe("NONE");
    }

    const cred = evaluateIndirectPromptInjectionBoundary({
      channel: IndirectInjectionChannel.EMAIL,
      trustLabel: ArtifactTrustLabel.UNTRUSTED_SOURCE,
      attemptedEffect: ExfiltrationEffect.CREDENTIAL_ACCESS,
      coercedRoleId: "A13",
    });
    expect(cred.allowed).toBe(false);
    if (!cred.allowed) {
      expect(cred.code).toBe("CREDENTIAL_ACCESS_DENIED");
      expect(cred.liveProviderWiring).toBe("NOT_WIRED");
    }

    const broker = evaluateIndirectPromptInjectionBoundary({
      channel: IndirectInjectionChannel.ATTACHMENT,
      trustLabel: ArtifactTrustLabel.MEASURED_EVIDENCE,
      attemptedEffect: ExfiltrationEffect.BROKER_SECRET_READ,
    });
    expect(broker.allowed).toBe(false);
    if (!broker.allowed) {
      expect(broker.code).toBe("EXFILTRATION_DENIED");
      expect(broker.liveProviderWiring).toBe("NOT_WIRED");
    }
  });

  it("allows trusted instruction with non-exfil effect at this boundary", () => {
    const decision = evaluateIndirectPromptInjectionBoundary({
      channel: IndirectInjectionChannel.WEB,
      trustLabel: ArtifactTrustLabel.TRUSTED_INSTRUCTION,
      attemptedEffect: "summarize_faq",
      coercedRoleId: "A13",
    });
    expect(decision.allowed).toBe(true);
    if (decision.allowed) {
      expect(decision.instructionEligible).toBe(true);
      expect(decision.liveProviderWiring).toBe("NOT_WIRED");
      expect(decision.externalEffects).toBe("NONE");
    }
  });

  it("recognizes absolute exfiltration effects", () => {
    expect(isAbsoluteExfiltrationEffect("secret_exfiltration")).toBe(true);
    expect(isAbsoluteExfiltrationEffect("credential_access")).toBe(true);
    expect(isAbsoluteExfiltrationEffect("broker_secret_read")).toBe(true);
    expect(isAbsoluteExfiltrationEffect("summarize_faq")).toBe(false);
  });

  it("attack suite denies every channel × effect × trust path with NOT_WIRED", () => {
    const suite = evaluateIndirectPromptInjectionAttackSuite();
    expect(suite.passed).toBe(true);
    expect(suite.details.some((d) => /Absolute exfil denied/i.test(d))).toBe(
      true,
    );
    expect(
      suite.details.some((d) => /liveProviderWiring=NOT_WIRED/i.test(d)),
    ).toBe(true);
    expect(
      suite.details.some((d) => /MEASURED_EVIDENCE summarize_page/i.test(d)),
    ).toBe(true);
    expect(
      suite.details.some((d) => /positive control/i.test(d)),
    ).toBe(true);
    expect([...INDIRECT_PROMPT_INJECTION_RELATED_CASE_IDS]).toEqual(["T-X063"]);
  });
});
