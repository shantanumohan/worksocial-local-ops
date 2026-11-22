import { describe, expect, it } from "vitest";
import {
  DestinationCapabilityAction,
  DestinationCapabilityKind,
  evaluateUnsupportedDestinationCapability,
  evaluateUnsupportedDestinationCapabilityBatch,
} from "./unsupported-destination-capabilities.js";

const gbpMatrix = {
  destinationId: "dest-gbp-1",
  destinationKind: DestinationCapabilityKind.LOCAL_GBP,
  supportedCapabilities: [
    DestinationCapabilityAction.POST,
    DestinationCapabilityAction.REVIEW_READ,
    DestinationCapabilityAction.READ_BACK,
  ],
} as const;

describe("unsupported-destination-capabilities (T-US-022)", () => {
  it("allows supported capability attempts offline", () => {
    const result = evaluateUnsupportedDestinationCapability({
      destination: gbpMatrix,
      requestedAction: DestinationCapabilityAction.POST,
      claimSuccessDespiteUnsupported: false,
      requestLiveProviderWiring: false,
    });
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.code).toBe("SUPPORTED_CAPABILITY_ATTEMPT_ALLOWED");
      expect(result.capabilitiesRespected).toBe(true);
      expect(result.liveProviderWiring).toBe("NOT_WIRED");
      expect(result.externalEffects).toBe("NONE");
      expect(result.evidence.destinationId).toBe("dest-gbp-1");
    }
  });

  it("refuses unsupported destination capabilities", () => {
    const result = evaluateUnsupportedDestinationCapability({
      destination: gbpMatrix,
      requestedAction: DestinationCapabilityAction.MESSAGE_SEND,
      claimSuccessDespiteUnsupported: false,
      requestLiveProviderWiring: false,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("UNSUPPORTED_DESTINATION_CAPABILITY_REFUSED");
      expect(result.capabilitiesRespected).toBe(true);
      expect(result.externalEffects).toBe("NONE");
    }
  });

  it("refuses false success claims on unsupported actions", () => {
    const result = evaluateUnsupportedDestinationCapability({
      destination: gbpMatrix,
      requestedAction: DestinationCapabilityAction.ADS_MUTATE,
      claimSuccessDespiteUnsupported: true,
      requestLiveProviderWiring: false,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("FALSE_SUCCESS_CLAIM_REFUSED");
      expect(result.capabilitiesRespected).toBe(true);
    }
  });

  it("refuses live provider wiring", () => {
    const result = evaluateUnsupportedDestinationCapability({
      destination: gbpMatrix,
      requestedAction: DestinationCapabilityAction.POST,
      claimSuccessDespiteUnsupported: false,
      requestLiveProviderWiring: true,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
    }
  });

  it("requires a non-empty capability matrix", () => {
    const result = evaluateUnsupportedDestinationCapability({
      destination: {
        destinationId: "dest-empty",
        destinationKind: DestinationCapabilityKind.SOCIAL,
        supportedCapabilities: [],
      },
      requestedAction: DestinationCapabilityAction.POST,
      claimSuccessDespiteUnsupported: false,
      requestLiveProviderWiring: false,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("CAPABILITY_MATRIX_MISSING");
    }
  });

  it("batch respects mixed supported and unsupported attempts", () => {
    const social = {
      destinationId: "dest-social-1",
      destinationKind: DestinationCapabilityKind.SOCIAL,
      supportedCapabilities: [
        DestinationCapabilityAction.POST,
        DestinationCapabilityAction.MESSAGE_SEND,
        DestinationCapabilityAction.READ_BACK,
      ],
    } as const;
    const result = evaluateUnsupportedDestinationCapabilityBatch({
      destinations: [gbpMatrix, social],
      attempts: [
        {
          destinationId: "dest-gbp-1",
          requestedAction: DestinationCapabilityAction.POST,
        },
        {
          destinationId: "dest-gbp-1",
          requestedAction: DestinationCapabilityAction.MESSAGE_SEND,
        },
        {
          destinationId: "dest-social-1",
          requestedAction: DestinationCapabilityAction.ADS_MUTATE,
        },
        {
          destinationId: "dest-social-1",
          requestedAction: DestinationCapabilityAction.READ_BACK,
        },
      ],
      requestLiveProviderWiring: false,
    });
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.code).toBe("UNSUPPORTED_DESTINATION_CAPABILITIES_RESPECTED");
      expect(result.evidence.allowedAttempts).toEqual([
        "dest-gbp-1:POST",
        "dest-social-1:READ_BACK",
      ]);
      expect(result.evidence.refusedUnsupported).toEqual([
        "dest-gbp-1:MESSAGE_SEND",
        "dest-social-1:ADS_MUTATE",
      ]);
      expect(result.liveProviderWiring).toBe("NOT_WIRED");
      expect(result.externalEffects).toBe("NONE");
    }
  });
});
