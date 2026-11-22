/**
 * Fixture proof for T-US-022 — Unsupported destination capabilities respected.
 * Per-destination capability matrices; unsupported actions refused; false
 * success claims refused; live provider wiring NOT_WIRED. Distinct from
 * T-US-021 / T-X045 / T-X046. External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  DestinationCapabilityAction,
  DestinationCapabilityKind,
  SoakProofKind,
  evaluateUnsupportedDestinationCapability,
  evaluateUnsupportedDestinationCapabilityBatch,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-US-022 fixture ACCEPTED.
 */
export function proofUnsupportedDestinationCapabilitiesRespected(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const gbp = {
    destinationId: "dest-gbp-fixture-1",
    destinationKind: DestinationCapabilityKind.LOCAL_GBP,
    supportedCapabilities: [
      DestinationCapabilityAction.POST,
      DestinationCapabilityAction.REVIEW_READ,
      DestinationCapabilityAction.READ_BACK,
    ],
  } as const;
  const social = {
    destinationId: "dest-social-fixture-1",
    destinationKind: DestinationCapabilityKind.SOCIAL,
    supportedCapabilities: [
      DestinationCapabilityAction.POST,
      DestinationCapabilityAction.MESSAGE_SEND,
      DestinationCapabilityAction.READ_BACK,
    ],
  } as const;
  const inbox = {
    destinationId: "dest-inbox-fixture-1",
    destinationKind: DestinationCapabilityKind.INBOX,
    supportedCapabilities: [
      DestinationCapabilityAction.MESSAGE_SEND,
      DestinationCapabilityAction.READ_BACK,
    ],
  } as const;

  const batch = evaluateUnsupportedDestinationCapabilityBatch({
    destinations: [gbp, social, inbox],
    attempts: [
      {
        destinationId: gbp.destinationId,
        requestedAction: DestinationCapabilityAction.POST,
      },
      {
        destinationId: gbp.destinationId,
        requestedAction: DestinationCapabilityAction.MESSAGE_SEND,
      },
      {
        destinationId: social.destinationId,
        requestedAction: DestinationCapabilityAction.ADS_MUTATE,
      },
      {
        destinationId: inbox.destinationId,
        requestedAction: DestinationCapabilityAction.READ_BACK,
      },
      {
        destinationId: inbox.destinationId,
        requestedAction: DestinationCapabilityAction.POST,
      },
    ],
    requestLiveProviderWiring: false,
  });
  if (
    batch.allowed &&
    batch.code === "UNSUPPORTED_DESTINATION_CAPABILITIES_RESPECTED" &&
    batch.capabilitiesRespected &&
    batch.liveProviderWiring === "NOT_WIRED" &&
    batch.externalEffects === "NONE" &&
    batch.evidence.allowedAttempts.length === 2 &&
    batch.evidence.refusedUnsupported.length === 3
  ) {
    details.push(
      "Batch → UNSUPPORTED_DESTINATION_CAPABILITIES_RESPECTED; 2 allowed / 3 unsupported refused; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Batch unexpectedly ${JSON.stringify(batch)}`);
  }

  const supported = evaluateUnsupportedDestinationCapability({
    destination: gbp,
    requestedAction: DestinationCapabilityAction.REVIEW_READ,
    claimSuccessDespiteUnsupported: false,
    requestLiveProviderWiring: false,
  });
  if (
    supported.allowed &&
    supported.code === "SUPPORTED_CAPABILITY_ATTEMPT_ALLOWED"
  ) {
    details.push("Supported REVIEW_READ → SUPPORTED_CAPABILITY_ATTEMPT_ALLOWED");
  } else {
    passed = false;
    details.push(`Supported unexpectedly ${JSON.stringify(supported)}`);
  }

  const unsupported = evaluateUnsupportedDestinationCapability({
    destination: gbp,
    requestedAction: DestinationCapabilityAction.MESSAGE_SEND,
    claimSuccessDespiteUnsupported: false,
    requestLiveProviderWiring: false,
  });
  if (
    !unsupported.allowed &&
    unsupported.code === "UNSUPPORTED_DESTINATION_CAPABILITY_REFUSED" &&
    unsupported.capabilitiesRespected
  ) {
    details.push(
      "GBP MESSAGE_SEND → UNSUPPORTED_DESTINATION_CAPABILITY_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Unsupported unexpectedly ${JSON.stringify(unsupported)}`);
  }

  const falseClaim = evaluateUnsupportedDestinationCapability({
    destination: social,
    requestedAction: DestinationCapabilityAction.ADS_MUTATE,
    claimSuccessDespiteUnsupported: true,
    requestLiveProviderWiring: false,
  });
  if (
    !falseClaim.allowed &&
    falseClaim.code === "FALSE_SUCCESS_CLAIM_REFUSED"
  ) {
    details.push("False success on ADS_MUTATE → FALSE_SUCCESS_CLAIM_REFUSED");
  } else {
    passed = false;
    details.push(`False claim unexpectedly ${JSON.stringify(falseClaim)}`);
  }

  const live = evaluateUnsupportedDestinationCapability({
    destination: inbox,
    requestedAction: DestinationCapabilityAction.MESSAGE_SEND,
    claimSuccessDespiteUnsupported: false,
    requestLiveProviderWiring: true,
  });
  if (!live.allowed && live.code === "LIVE_PROVIDER_WIRING_NOT_WIRED") {
    details.push("requestLiveProviderWiring → LIVE_PROVIDER_WIRING_NOT_WIRED");
  } else {
    passed = false;
    details.push(`Live refuse unexpectedly ${JSON.stringify(live)}`);
  }

  const emptyMatrix = evaluateUnsupportedDestinationCapability({
    destination: {
      destinationId: "dest-empty",
      destinationKind: DestinationCapabilityKind.CMS,
      supportedCapabilities: [],
    },
    requestedAction: DestinationCapabilityAction.POST,
    claimSuccessDespiteUnsupported: false,
    requestLiveProviderWiring: false,
  });
  if (
    !emptyMatrix.allowed &&
    emptyMatrix.code === "CAPABILITY_MATRIX_MISSING"
  ) {
    details.push("Empty matrix → CAPABILITY_MATRIX_MISSING");
  } else {
    passed = false;
    details.push(`Empty matrix unexpectedly ${JSON.stringify(emptyMatrix)}`);
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");
  details.push(
    "Distinct from T-US-021 (connect test artifact), T-X045 (partial destinations), T-X046 (unsupported blog)",
  );

  return {
    proofId: `proof-unsupported-dest-caps-${randomUUID()}`,
    kind: SoakProofKind.UNSUPPORTED_DESTINATION_CAPABILITIES_RESPECTED,
    passed,
    details,
    applyAttemptCount: 0,
    operationId: `op-us022-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
