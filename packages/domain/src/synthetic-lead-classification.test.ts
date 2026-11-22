import { describe, expect, it } from "vitest";
import { evaluateSyntheticLeadClassification } from "./synthetic-lead-classification.js";

describe("synthetic-lead-classification (T-US-020)", () => {
  const happy = {
    synthetic: true,
    wsSyntheticField: "true",
    correlationId: "corr-canary-1",
    wsCorrelationIdField: "corr-canary-1",
    countInCommerce: false,
    requestLiveZohoWiring: false,
  };

  it("classifies synthetic lead and excludes from commerce", () => {
    const d = evaluateSyntheticLeadClassification(happy);
    expect(d.allowed).toBe(true);
    if (!d.allowed) return;
    expect(d.code).toBe("SYNTHETIC_LEAD_CLASSIFIED_COMMERCIAL_EXCLUDED");
    expect(d.classified).toBe(true);
    expect(d.commercialExcluded).toBe(true);
    expect(d.liveZohoWiring).toBe("NOT_WIRED");
    expect(d.externalEffects).toBe("NONE");
  });

  it("refuses unclassified leads", () => {
    const d = evaluateSyntheticLeadClassification({
      ...happy,
      synthetic: false,
      wsSyntheticField: "false",
    });
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.code).toBe("NOT_CLASSIFIED_AS_SYNTHETIC");
    expect(d.classified).toBe(false);
  });

  it("refuses correlation mismatch", () => {
    const d = evaluateSyntheticLeadClassification({
      ...happy,
      wsCorrelationIdField: "other",
    });
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.code).toBe("CORRELATION_MISMATCH");
    expect(d.classified).toBe(true);
  });

  it("refuses commerce pollution", () => {
    const d = evaluateSyntheticLeadClassification({
      ...happy,
      countInCommerce: true,
    });
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.code).toBe("COMMERCE_POLLUTION_REFUSED");
    expect(d.commercialExcluded).toBe(true);
  });

  it("refuses live Zoho wiring", () => {
    const d = evaluateSyntheticLeadClassification({
      ...happy,
      requestLiveZohoWiring: true,
    });
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.code).toBe("LIVE_ZOHO_WIRING_NOT_WIRED");
    expect(d.liveZohoWiring).toBe("NOT_WIRED");
  });
});
