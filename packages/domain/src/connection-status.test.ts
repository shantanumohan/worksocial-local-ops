import { describe, expect, it } from "vitest";
import {
  ConnectionState,
  VerificationState,
  WriteReadiness,
  buildProviderStatusView,
} from "./connection-status.js";

describe("buildProviderStatusView", () => {
  it("keeps connected / authorized / verified independent", () => {
    const view = buildProviderStatusView({
      providerId: "gbp",
      connectionState: ConnectionState.READ_READY,
      writeReadiness: WriteReadiness.NOT_AUTHORIZED,
      verificationState: VerificationState.NOT_VERIFIED,
    });
    expect(view.connected).toBe(true);
    expect(view.authorized).toBe(false);
    expect(view.verified).toBe(false);
  });

  it("never treats ACCEPTED_PENDING as verified", () => {
    const view = buildProviderStatusView({
      providerId: "cms",
      connectionState: ConnectionState.IDENTITY_BOUND,
      writeReadiness: WriteReadiness.WRITE_READY,
      verificationState: VerificationState.ACCEPTED_PENDING,
    });
    expect(view.authorized).toBe(true);
    expect(view.verified).toBe(false);
    expect(view.labels.verified).toContain("not verified");
  });

  it("does not fake connected for NOT_CONFIGURED", () => {
    const view = buildProviderStatusView({
      providerId: "zoho",
      connectionState: ConnectionState.NOT_CONFIGURED,
      writeReadiness: WriteReadiness.NOT_AUTHORIZED,
      verificationState: VerificationState.NOT_VERIFIED,
    });
    expect(view.connected).toBe(false);
    expect(view.labels.connected).toMatch(/^Not connected/);
  });
});
