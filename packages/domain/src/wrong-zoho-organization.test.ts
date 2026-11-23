import { describe, expect, it } from "vitest";
import {
  ZohoOrganizationDecisionCode,
  ZohoOrganizationEnvironment,
  validateZohoOrganizationBinding,
} from "./wrong-zoho-organization.js";

describe("wrong-zoho-organization (T-X051)", () => {
  it("blocks wrong organization with IDENTITY_MISMATCH", () => {
    const result = validateZohoOrganizationBinding({
      expectedOrganizationId: "zoho-org-fixture",
      observedOrganizationId: "zoho-org-other",
      environment: ZohoOrganizationEnvironment.FIXTURE,
      liveZohoWiring: "NOT_WIRED",
      operation: "crm_write",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(ZohoOrganizationDecisionCode.IDENTITY_MISMATCH);
      expect(result.allowCrmWrite).toBe(false);
    }
  });

  it("allows matching fixture org with NOT_WIRED", () => {
    const result = validateZohoOrganizationBinding({
      expectedOrganizationId: "zoho-org-fixture",
      observedOrganizationId: "zoho-org-fixture",
      environment: ZohoOrganizationEnvironment.FIXTURE,
      liveZohoWiring: "NOT_WIRED",
      operation: "bind",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.code).toBe(ZohoOrganizationDecisionCode.MATCHED_FIXTURE);
      expect(result.allowCrmWrite).toBe(true);
    }
  });

  it("refuses blank expected or observed org ids", () => {
    const missingExpected = validateZohoOrganizationBinding({
      expectedOrganizationId: "  ",
      observedOrganizationId: "zoho-org-fixture",
      environment: ZohoOrganizationEnvironment.FIXTURE,
      liveZohoWiring: "NOT_WIRED",
      operation: "bind",
    });
    expect(missingExpected.ok).toBe(false);
    if (!missingExpected.ok) {
      expect(missingExpected.code).toBe(
        ZohoOrganizationDecisionCode.MISSING_EXPECTED_ORG,
      );
    }

    const missingObserved = validateZohoOrganizationBinding({
      expectedOrganizationId: "zoho-org-fixture",
      observedOrganizationId: "",
      environment: ZohoOrganizationEnvironment.FIXTURE,
      liveZohoWiring: "NOT_WIRED",
      operation: "read_identity",
    });
    expect(missingObserved.ok).toBe(false);
    if (!missingObserved.ok) {
      expect(missingObserved.code).toBe(
        ZohoOrganizationDecisionCode.MISSING_OBSERVED_ORG,
      );
    }
  });

  it("refuses matching production org while transport NOT_WIRED", () => {
    const result = validateZohoOrganizationBinding({
      expectedOrganizationId: "zoho-org-prod",
      observedOrganizationId: "zoho-org-prod",
      environment: ZohoOrganizationEnvironment.PRODUCTION,
      liveZohoWiring: "NOT_WIRED",
      operation: "crm_write",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(
        ZohoOrganizationDecisionCode.LIVE_TRANSPORT_NOT_WIRED,
      );
      expect(result.allowCrmWrite).toBe(false);
    }
  });
});
