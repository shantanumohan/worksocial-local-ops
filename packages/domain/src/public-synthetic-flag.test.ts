import { describe, expect, it } from "vitest";
import {
  SyntheticFlagDecisionCode,
  bindSyntheticFromServerGrant,
  parsePublicSyntheticClaim,
} from "./public-synthetic-flag.js";

describe("public synthetic flag (T-X050)", () => {
  it("parses ws_synthetic / is_synthetic public claims with whitespace normalize", () => {
    expect(parsePublicSyntheticClaim({ ws_synthetic: "true" })).toBe(true);
    expect(parsePublicSyntheticClaim({ is_synthetic: "1" })).toBe(true);
    expect(parsePublicSyntheticClaim({ ws_synthetic: "false" })).toBe(false);
    expect(parsePublicSyntheticClaim({})).toBeUndefined();
    expect(parsePublicSyntheticClaim({ ws_synthetic: "yes" })).toBe(true);
    expect(parsePublicSyntheticClaim({ ws_synthetic: " TRUE " })).toBe(true);
    expect(parsePublicSyntheticClaim({ ws_synthetic: "  " })).toBeUndefined();
    expect(parsePublicSyntheticClaim({ is_synthetic: "Yes" })).toBe(true);
  });

  it("OR-semantics: is_synthetic true is not masked by ws_synthetic false", () => {
    expect(
      parsePublicSyntheticClaim({
        ws_synthetic: "false",
        is_synthetic: "true",
      }),
    ).toBe(true);
    expect(
      parsePublicSyntheticClaim({
        ws_synthetic: "0",
        is_synthetic: "yes",
      }),
    ).toBe(true);
  });

  it("denies public synthetic claim without server canary grant", () => {
    const claimed = parsePublicSyntheticClaim({ ws_synthetic: "true" });
    const result = bindSyntheticFromServerGrant({
      clientClaimedSynthetic: claimed,
      serverCanaryGrantPresent: false,
    });
    expect(result.synthetic).toBe(false);
    expect(result.deniedAbuse).toBe(true);
    expect(result.code).toBe(SyntheticFlagDecisionCode.GRANT_MISSING);
    expect(result.liveProviderWiring).toBe("NOT_WIRED");
    expect(result.externalEffects).toBe("NONE");
  });

  it("denies is_synthetic alias abuse and dual-field mask without grant", () => {
    const alias = bindSyntheticFromServerGrant({
      clientClaimedSynthetic: parsePublicSyntheticClaim({
        is_synthetic: "true",
      }),
      serverCanaryGrantPresent: false,
    });
    expect(alias.code).toBe(SyntheticFlagDecisionCode.GRANT_MISSING);
    expect(alias.deniedAbuse).toBe(true);

    const masked = bindSyntheticFromServerGrant({
      clientClaimedSynthetic: parsePublicSyntheticClaim({
        ws_synthetic: "false",
        is_synthetic: "1",
      }),
      serverCanaryGrantPresent: false,
    });
    expect(masked.code).toBe(SyntheticFlagDecisionCode.GRANT_MISSING);
    expect(masked.synthetic).toBe(false);
  });

  it("authorizes synthetic when server canary grant is present", () => {
    const withClaim = bindSyntheticFromServerGrant({
      clientClaimedSynthetic: true,
      serverCanaryGrantPresent: true,
    });
    expect(withClaim.synthetic).toBe(true);
    expect(withClaim.deniedAbuse).toBe(false);
    expect(withClaim.code).toBe(SyntheticFlagDecisionCode.AUTHORIZED);
    expect(withClaim.liveProviderWiring).toBe("NOT_WIRED");
    expect(withClaim.externalEffects).toBe("NONE");

    const hostOnly = bindSyntheticFromServerGrant({
      clientClaimedSynthetic: undefined,
      serverCanaryGrantPresent: true,
    });
    expect(hostOnly.synthetic).toBe(true);
    expect(hostOnly.code).toBe(SyntheticFlagDecisionCode.AUTHORIZED);

    // Client false cannot override a server grant.
    const clientFalse = bindSyntheticFromServerGrant({
      clientClaimedSynthetic: false,
      serverCanaryGrantPresent: true,
    });
    expect(clientFalse.synthetic).toBe(true);
    expect(clientFalse.code).toBe(SyntheticFlagDecisionCode.AUTHORIZED);
  });

  it("does not mark synthetic when neither claim nor grant is present", () => {
    const result = bindSyntheticFromServerGrant({
      clientClaimedSynthetic: undefined,
      serverCanaryGrantPresent: false,
    });
    expect(result.synthetic).toBe(false);
    expect(result.deniedAbuse).toBe(false);
    expect(result.code).toBe(SyntheticFlagDecisionCode.NO_CLAIM);
    expect(result.externalEffects).toBe("NONE");
  });

  it("counterfactual: trusting public flag alone would mark synthetic", () => {
    const publicClaim = parsePublicSyntheticClaim({
      ws_synthetic: "true",
      is_synthetic: "true",
    });
    expect(publicClaim).toBe(true);
    const bound = bindSyntheticFromServerGrant({
      clientClaimedSynthetic: publicClaim,
      serverCanaryGrantPresent: false,
    });
    // Abuse denied — effective synthetic stays false.
    expect(bound.synthetic).toBe(false);
    // Counterfactual trust of the public flag would have marked synthetic.
    expect(publicClaim === true && bound.synthetic === false).toBe(true);
  });
});
