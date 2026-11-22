import { describe, expect, it } from "vitest";
import { evaluateKeywordProliferationGate } from "./keyword-proliferation-gate.js";

function thinPages(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    proposedPageId: `thin-${i + 1}`,
    keywordSlug: `keyword-slug-${i + 1}`,
    thinOutline: `Thin outline for keyword ${i + 1}`,
  }));
}

function preferred() {
  return {
    pageId: "page-acoustic-guide",
    pagePath: "/guides/acoustic-privacy",
    editableVerified: true,
    usefulUpdateSummary:
      "Expand acoustic privacy FAQ with measured booth attenuation",
  };
}

describe("keyword-proliferation-gate (T-US-028)", () => {
  it("prefers one useful page update when proliferation is not requested", () => {
    const decision = evaluateKeywordProliferationGate({
      demandLabel: "private office acoustic privacy",
      proposedKeywordPages: [],
      preferredUpdate: preferred(),
      requestKeywordProliferation: false,
      claimSuccessDespiteProliferation: false,
      requestLiveProviderWiring: false,
    });
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) throw new Error("expected allowed");
    expect(decision.code).toBe("ONE_USEFUL_PAGE_UPDATE_PREFERRED");
    expect(decision.proliferationRefused).toBe(true);
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.evidence.preferredPageId).toBe("page-acoustic-guide");
    expect(decision.evidence.recoveryPath).toBe(
      "COLLAPSE_TO_ONE_USEFUL_PAGE_UPDATE",
    );
    expect(decision.evidence.blockingDecision).toBe(
      "KEYWORD_PROLIFERATION_REFUSED",
    );
  });

  it("refuses keyword proliferation with preserved inputs and recovery path", () => {
    const decision = evaluateKeywordProliferationGate({
      demandLabel: "private office acoustic privacy",
      proposedKeywordPages: thinPages(4),
      preferredUpdate: preferred(),
      requestKeywordProliferation: true,
      claimSuccessDespiteProliferation: false,
      requestLiveProviderWiring: false,
    });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected refuse");
    expect(decision.code).toBe("KEYWORD_PROLIFERATION_REFUSED");
    expect(decision.proliferationRefused).toBe(true);
    expect(decision.evidence?.currentState).toBe("BLOCKED");
    expect(decision.evidence?.refusedProposedPageIds).toEqual([
      "thin-1",
      "thin-2",
      "thin-3",
      "thin-4",
    ]);
    expect(decision.evidence?.recoveryPath).toBe(
      "COLLAPSE_TO_ONE_USEFUL_PAGE_UPDATE",
    );
    expect(decision.evidence?.preservedInputCount).toBeGreaterThan(0);
  });

  it("refuses false success claims and live wiring; blocks incomplete preferred update", () => {
    const falseClaim = evaluateKeywordProliferationGate({
      demandLabel: "wifi speed",
      proposedKeywordPages: thinPages(3),
      preferredUpdate: preferred(),
      requestKeywordProliferation: true,
      claimSuccessDespiteProliferation: true,
      requestLiveProviderWiring: false,
    });
    expect(falseClaim.allowed).toBe(false);
    if (!falseClaim.allowed)
      expect(falseClaim.code).toBe("FALSE_SUCCESS_CLAIM_REFUSED");

    const live = evaluateKeywordProliferationGate({
      demandLabel: "wifi speed",
      proposedKeywordPages: [],
      preferredUpdate: preferred(),
      requestKeywordProliferation: false,
      claimSuccessDespiteProliferation: false,
      requestLiveProviderWiring: true,
    });
    expect(live.allowed).toBe(false);
    if (!live.allowed)
      expect(live.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");

    const incomplete = evaluateKeywordProliferationGate({
      demandLabel: "wifi speed",
      proposedKeywordPages: [],
      preferredUpdate: {
        pageId: "page-wifi",
        pagePath: "/guides/wifi",
        editableVerified: false,
        usefulUpdateSummary: "",
      },
      requestKeywordProliferation: false,
      claimSuccessDespiteProliferation: false,
      requestLiveProviderWiring: false,
    });
    expect(incomplete.allowed).toBe(false);
    if (!incomplete.allowed)
      expect(incomplete.code).toBe("PREFERRED_UPDATE_INCOMPLETE");

    const noDemand = evaluateKeywordProliferationGate({
      demandLabel: "  ",
      proposedKeywordPages: [],
      preferredUpdate: preferred(),
      requestKeywordProliferation: false,
      claimSuccessDespiteProliferation: false,
      requestLiveProviderWiring: false,
    });
    expect(noDemand.allowed).toBe(false);
    if (!noDemand.allowed) expect(noDemand.code).toBe("DEMAND_LABEL_REQUIRED");
  });
});
