import { describe, expect, it } from "vitest";
import { SoakProofKind } from "@worksocial/domain";
import { proofIndirectPromptInjectionExfilDenied } from "./indirect-prompt-injection-exfil-proof.js";

describe("proofIndirectPromptInjectionExfilDenied (T-X063)", () => {
  it("passes R26 triple-channel boundary and runner repeat gates", () => {
    const proof = proofIndirectPromptInjectionExfilDenied(
      "2026-11-21T19:14:00.000Z",
    );
    expect(proof.kind).toBe(SoakProofKind.INDIRECT_PROMPT_INJECTION_EXFIL_DENIED);
    expect(proof.passed).toBe(true);
    expect(proof.fixtureOnly).toBe(true);
    expect(proof.applyAttemptCount).toBe(1);
    expect(
      proof.details.some((d) =>
        d.includes("T-X063 R26: web secret_exfiltration deny repeat gate idempotent"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("T-X063 R26: proposeEffect(secret_exfiltration) repeat gate idempotent"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("T-X063 R27: attack suite repeat gate idempotent"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("T-X063 R28: compileInputPackage repeat gate idempotent"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("T-X063 R29: trusted+secret_exfiltration boundary repeat gate idempotent"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("T-X063 R30: validateRoleStructuredOutput repeat gate idempotent"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("T-X063 R31: MEASURED_EVIDENCE not-instruction repeat gate idempotent"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("T-X063 R32: attack suite triple repeat gate idempotent"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("T-X063 R33: attack suite quad repeat gate idempotent"),
      ),
    ).toBe(true);
    expect(proof.details.some((d) => d.includes("externalEffects=NONE"))).toBe(
      true,
    );
  });
});