/**
 * Fixture proof for T-US-056 — Honest outage; durable hosted contact path.
 *
 * Host OFFLINE → public chat UNAVAILABLE (HOST_OFFLINE); hosted form path
 * availability comes from resolveFixtureHostedContactPath (fail-closed);
 * pretend local receipt refused independently; durable accept may still
 * acknowledge. External effects: NONE. Never invents live VERIFIED.
 * Distinct from T-X001 sleep gaps and T-X071 public-discovery unavailability.
 */

import { randomUUID } from "node:crypto";
import {
  ContactReceiptDecisionCode,
  HostContactLiveness,
  HostedContactPathStatus,
  PublicChatCoverage,
  SoakProofKind,
  evaluateHonestOutageHostedContact,
  resolveFixtureHostedContactPath,
  type SoakProofRecord,
} from "@worksocial/domain";

/** Fixture website/form contact path — not a live route probe. */
const FIXTURE_HOSTED_CONTACT = {
  hostedFormPath: "/contact",
  durableReceiverKind: "website_form" as const,
};

/**
 * Complete expected proof set for T-US-056 fixture ACCEPTED.
 */
export function proofHonestOutageHostedContact(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  // 0. Fixture contact-path check (fail-closed when path/kind missing).
  const pathCheck = resolveFixtureHostedContactPath(FIXTURE_HOSTED_CONTACT);
  const missingCheck = resolveFixtureHostedContactPath({
    hostedFormPath: null,
    durableReceiverKind: null,
  });
  if (pathCheck.available && !missingCheck.available) {
    details.push(
      `Fixture hosted contact path check: available=${pathCheck.available} (${FIXTURE_HOSTED_CONTACT.hostedFormPath}); missing→UNAVAILABLE`,
    );
  } else {
    passed = false;
    details.push(
      `Fixture path check failed available=${pathCheck.available} missing=${missingCheck.available}`,
    );
  }

  // 1. Offline → honest outage + durable hosted contact path (explicit).
  const offline = evaluateHonestOutageHostedContact({
    observationId: `obs-outage-${randomUUID().slice(0, 8)}`,
    hostLiveness: HostContactLiveness.OFFLINE,
    nowIso,
    hostedContactPathAvailable: pathCheck.available,
  });
  if (
    offline.publicChatCoverage === PublicChatCoverage.UNAVAILABLE &&
    offline.unavailableReason === "HOST_OFFLINE" &&
    offline.hostedContactPath === HostedContactPathStatus.DURABLE_AVAILABLE &&
    offline.receiptAcknowledged === false &&
    offline.code === ContactReceiptDecisionCode.HOST_OFFLINE_HONEST_OUTAGE
  ) {
    details.push(
      "Host OFFLINE → public chat UNAVAILABLE (HOST_OFFLINE); hosted contact path DURABLE_AVAILABLE",
    );
  } else {
    passed = false;
    details.push(`Honest outage unexpectedly ${JSON.stringify(offline)}`);
  }

  // 2. Omitted availability fail-closes (never invent DURABLE_AVAILABLE).
  const omitted = evaluateHonestOutageHostedContact({
    observationId: `obs-omit-${randomUUID().slice(0, 8)}`,
    hostLiveness: HostContactLiveness.OFFLINE,
    nowIso,
  });
  if (
    omitted.hostedContactPath === HostedContactPathStatus.UNAVAILABLE &&
    omitted.code === ContactReceiptDecisionCode.HOSTED_CONTACT_PATH_UNAVAILABLE &&
    omitted.receiptAcknowledged === false
  ) {
    details.push(
      "Omitted hostedContactPathAvailable → UNAVAILABLE (fail-closed)",
    );
  } else {
    passed = false;
    details.push(`Fail-closed default unexpectedly ${JSON.stringify(omitted)}`);
  }

  // 3. Pretend local-host receipt while offline refused (no durable accept).
  const pretend = evaluateHonestOutageHostedContact({
    observationId: `obs-pretend-${randomUUID().slice(0, 8)}`,
    hostLiveness: HostContactLiveness.OFFLINE,
    nowIso,
    claimLocalHostReceipt: true,
    hostedContactPathAvailable: pathCheck.available,
  });
  if (
    pretend.code ===
      ContactReceiptDecisionCode.PRETEND_RECEIPT_WHILE_OFFLINE_REFUSED &&
    pretend.receiptAcknowledged === false &&
    pretend.pretendedLocalHostReceipt === false &&
    pretend.localHostClaimRefused === true
  ) {
    details.push(
      "Pretend local-host receipt while offline refused (receiptAcknowledged=false)",
    );
  } else {
    passed = false;
    details.push(`Pretend receipt unexpectedly ${JSON.stringify(pretend)}`);
  }

  // 4. Durable accept + local claim: refuse claim, preserve durable receipt.
  const both = evaluateHonestOutageHostedContact({
    observationId: `obs-both-${randomUUID().slice(0, 8)}`,
    hostLiveness: HostContactLiveness.OFFLINE,
    nowIso,
    claimLocalHostReceipt: true,
    durableReceiverAccepted: true,
    hostedContactPathAvailable: pathCheck.available,
  });
  if (
    both.code === ContactReceiptDecisionCode.DURABLE_RECEIVER_ACCEPTED &&
    both.receiptAcknowledged === true &&
    both.localHostClaimRefused === true &&
    both.pretendedLocalHostReceipt === false
  ) {
    details.push(
      "Local claim refused independently; durable receiver accept still acknowledges",
    );
  } else {
    passed = false;
    details.push(`Durable+local unexpectedly ${JSON.stringify(both)}`);
  }

  // 5. Durable hosted receiver accept → receipt; chat still UNAVAILABLE.
  const durable = evaluateHonestOutageHostedContact({
    observationId: `obs-durable-${randomUUID().slice(0, 8)}`,
    hostLiveness: HostContactLiveness.OFFLINE,
    nowIso,
    durableReceiverAccepted: true,
    hostedContactPathAvailable: pathCheck.available,
  });
  if (
    durable.code === ContactReceiptDecisionCode.DURABLE_RECEIVER_ACCEPTED &&
    durable.receiptAcknowledged === true &&
    durable.publicChatCoverage === PublicChatCoverage.UNAVAILABLE &&
    durable.hostedContactPath === HostedContactPathStatus.DURABLE_AVAILABLE
  ) {
    details.push(
      "Durable hosted receiver accepted → receiptAcknowledged=true; chat remains UNAVAILABLE",
    );
  } else {
    passed = false;
    details.push(`Durable accept unexpectedly ${JSON.stringify(durable)}`);
  }

  // 6. Positive control: ONLINE chat AVAILABLE without inventing receipt.
  const online = evaluateHonestOutageHostedContact({
    observationId: `obs-online-${randomUUID().slice(0, 8)}`,
    hostLiveness: HostContactLiveness.ONLINE,
    nowIso,
    hostedContactPathAvailable: pathCheck.available,
  });
  if (
    online.publicChatCoverage === PublicChatCoverage.AVAILABLE &&
    online.unavailableReason === null &&
    online.receiptAcknowledged === false &&
    online.code === ContactReceiptDecisionCode.HOST_ONLINE_CHAT_AVAILABLE
  ) {
    details.push(
      "Host ONLINE → public chat AVAILABLE; receipt still waits for durable accept",
    );
  } else {
    passed = false;
    details.push(`Online control unexpectedly ${JSON.stringify(online)}`);
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-honest-outage-contact-${randomUUID()}`,
    kind: SoakProofKind.HONEST_OUTAGE_HOSTED_CONTACT_PATH,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-us056-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
