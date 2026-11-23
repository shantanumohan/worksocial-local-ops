import { describe, expect, it } from "vitest";
import {
  ContactReceiptDecisionCode,
  HostContactLiveness,
  HostedContactPathStatus,
  PublicChatCoverage,
  evaluateHonestOutageHostedContact,
  resolveFixtureHostedContactPath,
} from "./honest-outage-hosted-contact.js";

const now = "2026-11-22T21:00:00.000Z";

const fixturePath = resolveFixtureHostedContactPath({
  hostedFormPath: "/contact",
  durableReceiverKind: "website_form",
});

describe("honest-outage-hosted-contact", () => {
  it("fail-closes hosted path when fixture check lacks path/kind", () => {
    const missing = resolveFixtureHostedContactPath({
      hostedFormPath: null,
      durableReceiverKind: "website_form",
    });
    expect(missing.available).toBe(false);
    expect(missing.status).toBe(HostedContactPathStatus.UNAVAILABLE);
  });

  it("marks honest outage + durable hosted path when host is offline", () => {
    expect(fixturePath.available).toBe(true);
    const obs = evaluateHonestOutageHostedContact({
      observationId: "obs-offline-1",
      hostLiveness: HostContactLiveness.OFFLINE,
      nowIso: now,
      hostedContactPathAvailable: fixturePath.available,
    });
    expect(obs.publicChatCoverage).toBe(PublicChatCoverage.UNAVAILABLE);
    expect(obs.unavailableReason).toBe("HOST_OFFLINE");
    expect(obs.hostedContactPath).toBe(
      HostedContactPathStatus.DURABLE_AVAILABLE,
    );
    expect(obs.receiptAcknowledged).toBe(false);
    expect(obs.pretendedLocalHostReceipt).toBe(false);
    expect(obs.code).toBe(ContactReceiptDecisionCode.HOST_OFFLINE_HONEST_OUTAGE);
    expect(obs.externalEffects).toBe("NONE");
    expect(obs.liveInboxWiring).toBe("NOT_WIRED");
  });

  it("defaults omitted hostedContactPathAvailable to UNAVAILABLE", () => {
    const obs = evaluateHonestOutageHostedContact({
      observationId: "obs-default",
      hostLiveness: HostContactLiveness.OFFLINE,
      nowIso: now,
    });
    expect(obs.hostedContactPath).toBe(HostedContactPathStatus.UNAVAILABLE);
    expect(obs.code).toBe(
      ContactReceiptDecisionCode.HOSTED_CONTACT_PATH_UNAVAILABLE,
    );
    expect(obs.receiptAcknowledged).toBe(false);
  });

  it("refuses pretend local-host receipt while offline", () => {
    const obs = evaluateHonestOutageHostedContact({
      observationId: "obs-pretend",
      hostLiveness: HostContactLiveness.OFFLINE,
      nowIso: now,
      claimLocalHostReceipt: true,
      hostedContactPathAvailable: fixturePath.available,
    });
    expect(obs.code).toBe(
      ContactReceiptDecisionCode.PRETEND_RECEIPT_WHILE_OFFLINE_REFUSED,
    );
    expect(obs.receiptAcknowledged).toBe(false);
    expect(obs.pretendedLocalHostReceipt).toBe(false);
    expect(obs.localHostClaimRefused).toBe(true);
    expect(obs.publicChatCoverage).toBe(PublicChatCoverage.UNAVAILABLE);
  });

  it("preserves durable receipt when refusing a local-host claim", () => {
    const obs = evaluateHonestOutageHostedContact({
      observationId: "obs-both",
      hostLiveness: HostContactLiveness.OFFLINE,
      nowIso: now,
      claimLocalHostReceipt: true,
      durableReceiverAccepted: true,
      hostedContactPathAvailable: fixturePath.available,
    });
    expect(obs.code).toBe(ContactReceiptDecisionCode.DURABLE_RECEIVER_ACCEPTED);
    expect(obs.receiptAcknowledged).toBe(true);
    expect(obs.localHostClaimRefused).toBe(true);
    expect(obs.pretendedLocalHostReceipt).toBe(false);
  });

  it("allows receipt only after durable hosted receiver accepts", () => {
    const obs = evaluateHonestOutageHostedContact({
      observationId: "obs-durable",
      hostLiveness: HostContactLiveness.OFFLINE,
      nowIso: now,
      durableReceiverAccepted: true,
      hostedContactPathAvailable: fixturePath.available,
    });
    expect(obs.code).toBe(ContactReceiptDecisionCode.DURABLE_RECEIVER_ACCEPTED);
    expect(obs.receiptAcknowledged).toBe(true);
    expect(obs.publicChatCoverage).toBe(PublicChatCoverage.UNAVAILABLE);
    expect(obs.hostedContactPath).toBe(
      HostedContactPathStatus.DURABLE_AVAILABLE,
    );
  });

  it("keeps chat available when host is online without inventing receipt", () => {
    const obs = evaluateHonestOutageHostedContact({
      observationId: "obs-online",
      hostLiveness: HostContactLiveness.ONLINE,
      nowIso: now,
      hostedContactPathAvailable: fixturePath.available,
    });
    expect(obs.publicChatCoverage).toBe(PublicChatCoverage.AVAILABLE);
    expect(obs.unavailableReason).toBeNull();
    expect(obs.receiptAcknowledged).toBe(false);
    expect(obs.code).toBe(ContactReceiptDecisionCode.HOST_ONLINE_CHAT_AVAILABLE);
  });
});
