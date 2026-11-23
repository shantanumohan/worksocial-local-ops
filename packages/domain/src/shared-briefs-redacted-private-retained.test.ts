import { describe, expect, it } from "vitest";
import {
  BriefAudience,
  PrivateEvidenceRetentionStore,
  PrivateFieldKind,
  evaluateSharedBriefsRedactedPrivateRetained,
  type SharedBriefsRedactedPrivateRetainedInput,
} from "./shared-briefs-redacted-private-retained.js";

function validInput(
  overrides: Partial<SharedBriefsRedactedPrivateRetainedInput> = {},
): SharedBriefsRedactedPrivateRetainedInput {
  return {
    shareId: "share-059-brief",
    brief: {
      briefId: "brief-shared-059",
      audience: BriefAudience.SHARED,
      redacted: true,
      privateFieldKinds: [],
    },
    privateEvidence: {
      evidenceId: "ev-private-059",
      retained: true,
      retentionStore: PrivateEvidenceRetentionStore.PRIVATE_VAULT,
      containsRawPii: true,
    },
    attemptShareUnredactedBrief: false,
    attemptDiscardPrivateEvidenceOnShare: false,
    claimLiveVerifiedShare: false,
    requestLiveProviderWiring: false,
    ...overrides,
  };
}

describe("evaluateSharedBriefsRedactedPrivateRetained (T-US-059)", () => {
  it("records redacted shared brief with private evidence retained", () => {
    const decision = evaluateSharedBriefsRedactedPrivateRetained(validInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) throw new Error("expected allowed");
    expect(decision.code).toBe("SHARED_BRIEFS_REDACTED_PRIVATE_RETAINED");
    expect(decision.evidence.sharedBriefRedacted).toBe(true);
    expect(decision.evidence.privateFieldCountInSharedBrief).toBe(0);
    expect(decision.evidence.privateEvidenceRetained).toBe(true);
    expect(decision.evidence.privateEvidenceStore).toBe("private_vault");
    expect(decision.evidence.shareVerifiedLive).toBe(false);
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
  });

  it("requires a complete share package", () => {
    const decision = evaluateSharedBriefsRedactedPrivateRetained(
      validInput({ shareId: "" }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected denied");
    expect(decision.code).toBe("SHARE_PACKAGE_REQUIRED");
  });

  it("refuses unredacted shared brief export attempt", () => {
    const decision = evaluateSharedBriefsRedactedPrivateRetained(
      validInput({ attemptShareUnredactedBrief: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected denied");
    expect(decision.code).toBe("UNREDACTED_SHARED_BRIEF_REFUSED");
  });

  it("refuses shared brief marked not redacted", () => {
    const decision = evaluateSharedBriefsRedactedPrivateRetained(
      validInput({
        brief: {
          briefId: "brief-shared-059",
          audience: BriefAudience.SHARED,
          redacted: false,
          privateFieldKinds: [],
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected denied");
    expect(decision.code).toBe("UNREDACTED_SHARED_BRIEF_REFUSED");
  });

  it("refuses private fields in shared brief", () => {
    const decision = evaluateSharedBriefsRedactedPrivateRetained(
      validInput({
        brief: {
          briefId: "brief-shared-059",
          audience: BriefAudience.SHARED,
          redacted: true,
          privateFieldKinds: [PrivateFieldKind.RAW_PII],
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected denied");
    expect(decision.code).toBe("PRIVATE_FIELDS_IN_SHARED_BRIEF_REFUSED");
  });

  it("refuses discarded private evidence", () => {
    const decision = evaluateSharedBriefsRedactedPrivateRetained(
      validInput({
        privateEvidence: {
          evidenceId: "ev-private-059",
          retained: false,
          retentionStore: PrivateEvidenceRetentionStore.DISCARDED,
          containsRawPii: true,
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected denied");
    expect(decision.code).toBe("PRIVATE_EVIDENCE_NOT_RETAINED_REFUSED");
  });

  it("refuses private evidence in shared export", () => {
    const decision = evaluateSharedBriefsRedactedPrivateRetained(
      validInput({
        privateEvidence: {
          evidenceId: "ev-private-059",
          retained: true,
          retentionStore: PrivateEvidenceRetentionStore.SHARED_EXPORT,
          containsRawPii: true,
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected denied");
    expect(decision.code).toBe("PRIVATE_EVIDENCE_IN_SHARED_EXPORT_REFUSED");
  });

  it("refuses discard-on-share attempt", () => {
    const decision = evaluateSharedBriefsRedactedPrivateRetained(
      validInput({ attemptDiscardPrivateEvidenceOnShare: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected denied");
    expect(decision.code).toBe("DISCARD_PRIVATE_EVIDENCE_ON_SHARE_REFUSED");
  });

  it("refuses false live-verified share claim", () => {
    const decision = evaluateSharedBriefsRedactedPrivateRetained(
      validInput({ claimLiveVerifiedShare: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected denied");
    expect(decision.code).toBe("FALSE_LIVE_VERIFIED_SHARE_REFUSED");
  });

  it("refuses live provider wiring", () => {
    const decision = evaluateSharedBriefsRedactedPrivateRetained(
      validInput({ requestLiveProviderWiring: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected denied");
    expect(decision.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
  });
});
