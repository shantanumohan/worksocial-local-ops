import { describe, expect, it } from "vitest";
import { AnalyticsEnvironment } from "./analytics.js";
import { ConnectionState, WriteReadiness } from "./connection-status.js";
import { PaidMediaWiring } from "./paid-media.js";
import {
  CHATGPT_ADS_IDENTITY_MISMATCH_RELATED_CASE_IDS,
  CONNECT_CHATGPT_ADS_READ_READY_RELATED_CASE_IDS,
  CONNECT_CHATGPT_ADS_RELATED_CASE_IDS,
  ChatGptAdsCapability,
  ChatGptAdsCredentialKind,
  ChatGptAdsIntegrationType,
  createChatGptAdsAnalyzeOnlyFixtureStore,
  evaluateChatGptAdsIdentityBind,
  evaluateConnectChatGptAds,
  fixtureChatGptAdsAnalyzeOnlyInput,
  fixtureConnectChatGptAdsInput,
  loadChatGptAdsAnalyzeOnlyBinding,
  persistChatGptAdsAnalyzeOnlyBinding,
  saveChatGptAdsAnalyzeOnlyConnection,
} from "./connect-chatgpt-ads.js";

describe("evaluateConnectChatGptAds (T-F07)", () => {
  it("records complete F07 evidence package", () => {
    const decision = evaluateConnectChatGptAds(fixtureConnectChatGptAdsInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.code).toBe("CONNECT_CHATGPT_ADS_EVIDENCE_RECORDED");
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.fixtureOnly).toBe(true);
    expect(decision.evidence.integrationType).toBe("CHATGPT_ADS");
    expect(decision.evidence.credentialKind).toBe("ADS_API_KEY");
    expect(decision.evidence.writeAuthorized).toBe(false);
    expect(decision.evidence.spendingAuthorityEnabled).toBe(false);
    expect(decision.evidence.adsVerifiedLive).toBe(false);
    expect(decision.evidence.measurementChecklistComplete).toBe(true);
    expect(decision.evidence.pendingMetricLabels.length).toBeGreaterThan(0);
    expect(decision.evidence.blockingDecision).toBe(
      "F07_EVIDENCE_PACKAGE_COMPLETE",
    );
    expect(CONNECT_CHATGPT_ADS_RELATED_CASE_IDS).toEqual([
      "T-F07",
      "T-US-013",
      "T-US-014",
    ]);
  });

  it("blocks when transport/entitlement/auth missing", () => {
    const noTransport = evaluateConnectChatGptAds(
      fixtureConnectChatGptAdsInput({ localTransportVerified: false }),
    );
    expect(noTransport.allowed).toBe(false);
    if (noTransport.allowed) return;
    expect(noTransport.code).toBe("ADS_TRANSPORT_UNVERIFIED");

    const noEntitlement = evaluateConnectChatGptAds(
      fixtureConnectChatGptAdsInput({ entitlementVerified: false }),
    );
    expect(noEntitlement.allowed).toBe(false);
    if (!noEntitlement.allowed) {
      expect(noEntitlement.code).toBe("ADS_ENTITLEMENT_UNVERIFIED");
    }
  });

  it("refuses organic and model API integrations", () => {
    const organic = evaluateConnectChatGptAds(
      fixtureConnectChatGptAdsInput({
        integrationType: ChatGptAdsIntegrationType.CHATGPT_ORGANIC,
      }),
    );
    expect(organic.allowed).toBe(false);
    if (!organic.allowed) expect(organic.code).toBe("ORGANIC_INTEGRATION_REFUSED");

    const model = evaluateConnectChatGptAds(
      fixtureConnectChatGptAdsInput({
        integrationType: ChatGptAdsIntegrationType.MODEL_API,
      }),
    );
    expect(model.allowed).toBe(false);
    if (!model.allowed) expect(model.code).toBe("MODEL_API_INTEGRATION_REFUSED");
  });

  it("refuses model API key and identity mismatch", () => {
    const modelKey = evaluateConnectChatGptAds(
      fixtureConnectChatGptAdsInput({
        credentialKind: ChatGptAdsCredentialKind.MODEL_API_KEY,
      }),
    );
    expect(modelKey.allowed).toBe(false);
    if (!modelKey.allowed) expect(modelKey.code).toBe("MODEL_API_KEY_REFUSED");

    const mismatch = evaluateConnectChatGptAds(
      fixtureConnectChatGptAdsInput({
        intendedAccountId: "intended-a",
        returnedAccountId: "returned-b",
      }),
    );
    expect(mismatch.allowed).toBe(false);
    if (!mismatch.allowed) {
      expect(mismatch.code).toBe("ADS_ACCOUNT_IDENTITY_MISMATCH");
    }
  });

  it("refuses write save, live claims, and live wiring", () => {
    const write = evaluateConnectChatGptAds(
      fixtureConnectChatGptAdsInput({ attemptWriteSave: true }),
    );
    expect(write.allowed).toBe(false);
    if (!write.allowed) expect(write.code).toBe("WRITE_SAVE_REFUSED");

    const liveClaim = evaluateConnectChatGptAds(
      fixtureConnectChatGptAdsInput({ claimLiveVerifiedAds: true }),
    );
    expect(liveClaim.allowed).toBe(false);
    if (!liveClaim.allowed) {
      expect(liveClaim.code).toBe("FALSE_LIVE_VERIFIED_ADS_REFUSED");
    }

    const liveWire = evaluateConnectChatGptAds(
      fixtureConnectChatGptAdsInput({ requestLiveProviderWiring: true }),
    );
    expect(liveWire.allowed).toBe(false);
    if (!liveWire.allowed) {
      expect(liveWire.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
    }
  });
});

describe("saveChatGptAdsAnalyzeOnlyConnection (T-US-013)", () => {
  it("saves analyze-only connection as READ_READY with write denial", () => {
    const nowIso = "2026-11-22T20:00:00.000Z";
    const saved = saveChatGptAdsAnalyzeOnlyConnection(
      fixtureChatGptAdsAnalyzeOnlyInput({ nowIso }),
    );
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.connectionState).toBe(ConnectionState.READ_READY);
    expect(saved.writeReadiness).toBe(WriteReadiness.NOT_AUTHORIZED);
    expect(saved.writeDisabled).toBe(true);
    expect(saved.spendingAuthorityEnabled).toBe(false);
    expect(saved.capability).toBe(ChatGptAdsCapability.ANALYZE_ONLY);
    expect(saved.wiring).toBe(PaidMediaWiring.FIXTURE);
    expect(saved.liveMutationWiring).toBe("NOT_WIRED");
    expect(saved.readReceiptAtIso).toBe(nowIso);
    expect(saved.pendingMetricLabels.length).toBeGreaterThan(0);
    expect(CONNECT_CHATGPT_ADS_READ_READY_RELATED_CASE_IDS).toContain(
      "T-US-013",
    );
  });

  it("persists and reloads the binding from the fixture store", () => {
    const saved = saveChatGptAdsAnalyzeOnlyConnection(
      fixtureChatGptAdsAnalyzeOnlyInput({
        connectionId: "chatgpt-ads-persist-1",
      }),
    );
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const store = createChatGptAdsAnalyzeOnlyFixtureStore();
    persistChatGptAdsAnalyzeOnlyBinding(store, saved);
    const loaded = loadChatGptAdsAnalyzeOnlyBinding(
      store,
      "chatgpt-ads-persist-1",
    );
    expect(loaded).not.toBeNull();
    expect(loaded?.connectionId).toBe(saved.connectionId);
    expect(loaded?.accountId).toBe(saved.accountId);
    expect(loaded?.writeDisabled).toBe(true);
    expect(
      loadChatGptAdsAnalyzeOnlyBinding(store, "missing"),
    ).toBeNull();
  });

  it("refuses WRITE and missing transport gate", () => {
    const write = saveChatGptAdsAnalyzeOnlyConnection(
      fixtureChatGptAdsAnalyzeOnlyInput({
        capability: ChatGptAdsCapability.WRITE,
      }),
    );
    expect(write.ok).toBe(false);
    if (!write.ok) expect(write.code).toBe("WRITE_CAPABILITY_REFUSED");

    const gate = saveChatGptAdsAnalyzeOnlyConnection(
      fixtureChatGptAdsAnalyzeOnlyInput({ localTransportVerified: false }),
    );
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.code).toBe("ADS_TRANSPORT_UNVERIFIED");
  });
});

describe("evaluateChatGptAdsIdentityBind (T-US-014)", () => {
  it("refuses bind on intended vs returned account mismatch", () => {
    const decision = evaluateChatGptAdsIdentityBind({
      localTransportVerified: true,
      entitlementVerified: true,
      authVerified: true,
      credentialKind: ChatGptAdsCredentialKind.ADS_API_KEY,
      intendedAccountId: "acct-intended",
      returnedAccountId: "acct-other",
      environment: AnalyticsEnvironment.FIXTURE,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.bindRefused).toBe(true);
    if (!decision.allowed) {
      expect(decision.code).toBe("ADS_ACCOUNT_IDENTITY_MISMATCH");
    }
    expect(CHATGPT_ADS_IDENTITY_MISMATCH_RELATED_CASE_IDS).toContain(
      "T-US-014",
    );
  });

  it("allows fixture bind receipt on identity match", () => {
    const decision = evaluateChatGptAdsIdentityBind({
      localTransportVerified: true,
      entitlementVerified: true,
      authVerified: true,
      credentialKind: ChatGptAdsCredentialKind.ADS_API_KEY,
      intendedAccountId: "acct-same",
      returnedAccountId: "acct-same",
      environment: AnalyticsEnvironment.FIXTURE,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.bindRefused).toBe(false);
    if (decision.allowed) {
      expect(decision.code).toBe("ADS_ACCOUNT_IDENTITY_MATCH_FIXTURE_BIND");
    }
  });

  it("refuses model API key bind", () => {
    const decision = evaluateChatGptAdsIdentityBind({
      localTransportVerified: true,
      entitlementVerified: true,
      authVerified: true,
      credentialKind: ChatGptAdsCredentialKind.MODEL_API_KEY,
      intendedAccountId: "acct-same",
      returnedAccountId: "acct-same",
      environment: AnalyticsEnvironment.FIXTURE,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.code).toBe("MODEL_API_KEY_REFUSED");
  });
});
