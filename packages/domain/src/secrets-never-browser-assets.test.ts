import { describe, expect, it } from "vitest";
import {
  BrowserAssetKind,
  SecretMaterialKind,
  evaluateSecretsNeverBrowserAssets,
  type BrowserAssetSample,
  type SecretsNeverBrowserAssetsInput,
} from "./secrets-never-browser-assets.js";

function cleanBrowserAssets(): BrowserAssetSample[] {
  return [
    {
      assetId: "app.bundle.js",
      kind: BrowserAssetKind.JS_BUNDLE,
      browserServed: true,
      embeddedSecretKinds: [],
      publicConfigOnly: true,
    },
    {
      assetId: "index.html",
      kind: BrowserAssetKind.HTML_DOCUMENT,
      browserServed: true,
      embeddedSecretKinds: [],
      publicConfigOnly: true,
    },
    {
      assetId: "theme.css",
      kind: BrowserAssetKind.CSS_STYLESHEET,
      browserServed: true,
      embeddedSecretKinds: [],
      publicConfigOnly: true,
    },
    {
      assetId: "sw.js",
      kind: BrowserAssetKind.SERVICE_WORKER,
      browserServed: true,
      embeddedSecretKinds: [],
      publicConfigOnly: true,
    },
    {
      assetId: "public-env.json",
      kind: BrowserAssetKind.PUBLIC_ENV_EMBED,
      browserServed: true,
      embeddedSecretKinds: [],
      publicConfigOnly: true,
    },
    {
      assetId: "broker-vault.server",
      kind: BrowserAssetKind.JS_BUNDLE,
      browserServed: false,
      embeddedSecretKinds: [SecretMaterialKind.CREDENTIAL_BROKER_SECRET],
      publicConfigOnly: false,
    },
  ];
}

function validInput(
  overrides: Partial<SecretsNeverBrowserAssetsInput> = {},
): SecretsNeverBrowserAssetsInput {
  return {
    scanId: "scan-browser-assets-053",
    assets: cleanBrowserAssets(),
    attemptShipBrokerSecretToBrowser: false,
    claimLiveVerifiedScan: false,
    requestLiveProviderWiring: false,
    ...overrides,
  };
}

describe("evaluateSecretsNeverBrowserAssets (T-US-053)", () => {
  it("records secret-free browser assets on happy path", () => {
    const decision = evaluateSecretsNeverBrowserAssets(validInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) throw new Error("expected allowed");
    expect(decision.code).toBe("SECRETS_NEVER_IN_BROWSER_ASSETS_RECORDED");
    expect(decision.evidence.secretBearingBrowserAssetCount).toBe(0);
    expect(decision.evidence.publicEnvSecretCount).toBe(0);
    expect(decision.evidence.scanVerifiedLive).toBe(false);
    expect(decision.evidence.browserServedCount).toBe(5);
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
  });

  it("requires asset scan samples", () => {
    const decision = evaluateSecretsNeverBrowserAssets(
      validInput({ assets: [] }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected denied");
    expect(decision.code).toBe("ASSET_SCAN_REQUIRED");
  });

  it("refuses secret in browser-served JS bundle", () => {
    const decision = evaluateSecretsNeverBrowserAssets(
      validInput({
        assets: [
          {
            assetId: "leaky.bundle.js",
            kind: BrowserAssetKind.JS_BUNDLE,
            browserServed: true,
            embeddedSecretKinds: [SecretMaterialKind.API_KEY],
            publicConfigOnly: false,
          },
        ],
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected denied");
    expect(decision.code).toBe("SECRET_IN_BROWSER_ASSET_REFUSED");
  });

  it("refuses public env embed carrying oauth client secret", () => {
    const decision = evaluateSecretsNeverBrowserAssets(
      validInput({
        assets: [
          {
            assetId: "public-env.json",
            kind: BrowserAssetKind.PUBLIC_ENV_EMBED,
            browserServed: true,
            embeddedSecretKinds: [SecretMaterialKind.OAUTH_CLIENT_SECRET],
            publicConfigOnly: false,
          },
        ],
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected denied");
    expect(decision.code).toBe("PUBLIC_ENV_SECRET_REFUSED");
  });

  it("refuses shipping credential-broker secret to browser", () => {
    const decision = evaluateSecretsNeverBrowserAssets(
      validInput({ attemptShipBrokerSecretToBrowser: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected denied");
    expect(decision.code).toBe("BROKER_SECRET_TO_BROWSER_REFUSED");
  });

  it("refuses false live-verified scan claim", () => {
    const decision = evaluateSecretsNeverBrowserAssets(
      validInput({ claimLiveVerifiedScan: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected denied");
    expect(decision.code).toBe("FALSE_LIVE_VERIFIED_SCAN_REFUSED");
  });

  it("keeps live provider wiring NOT_WIRED", () => {
    const decision = evaluateSecretsNeverBrowserAssets(
      validInput({ requestLiveProviderWiring: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected denied");
    expect(decision.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("allows server-only assets to hold secrets when not browser-served", () => {
    const decision = evaluateSecretsNeverBrowserAssets(
      validInput({
        assets: [
          {
            assetId: "ui.js",
            kind: BrowserAssetKind.JS_BUNDLE,
            browserServed: true,
            embeddedSecretKinds: [],
            publicConfigOnly: true,
          },
          {
            assetId: "broker.server",
            kind: BrowserAssetKind.JS_BUNDLE,
            browserServed: false,
            embeddedSecretKinds: [
              SecretMaterialKind.REFRESH_TOKEN,
              SecretMaterialKind.PRIVATE_KEY,
            ],
            publicConfigOnly: false,
          },
        ],
      }),
    );
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) throw new Error("expected allowed");
    expect(decision.code).toBe("SECRETS_NEVER_IN_BROWSER_ASSETS_RECORDED");
  });
});
