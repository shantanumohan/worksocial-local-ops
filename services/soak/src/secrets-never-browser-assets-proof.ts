/**
 * Fixture proof for T-US-053 — Secrets never in browser assets.
 * Clean browser-served asset scan records; secret-bearing bundles,
 * public-env secret embeds, and broker-secret ship attempts refused;
 * live NOT_WIRED. Distinct from T-X065 / T-X005 / T-F24/T-US-047 / T-X063.
 * External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  BrowserAssetKind,
  SecretMaterialKind,
  SoakProofKind,
  evaluateSecretsNeverBrowserAssets,
  type BrowserAssetSample,
  type SecretsNeverBrowserAssetsInput,
  type SoakProofRecord,
} from "@worksocial/domain";

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

function baseInput(
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

/**
 * Complete expected proof set for T-US-053 fixture ACCEPTED.
 */
export function proofSecretsNeverBrowserAssets(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateSecretsNeverBrowserAssets(baseInput());
  if (
    happy.allowed &&
    happy.code === "SECRETS_NEVER_IN_BROWSER_ASSETS_RECORDED" &&
    happy.evidence.secretBearingBrowserAssetCount === 0 &&
    happy.evidence.publicEnvSecretCount === 0 &&
    happy.evidence.scanVerifiedLive === false &&
    happy.evidence.browserServedCount === 5 &&
    happy.liveProviderWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE"
  ) {
    details.push(
      "clean browser assets + server-only broker vault → SECRETS_NEVER_IN_BROWSER_ASSETS_RECORDED; scanVerifiedLive=false; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy path unexpectedly ${JSON.stringify(happy)}`);
  }

  const noAssets = evaluateSecretsNeverBrowserAssets(
    baseInput({ assets: [] }),
  );
  if (!noAssets.allowed && noAssets.code === "ASSET_SCAN_REQUIRED") {
    details.push("empty assets → ASSET_SCAN_REQUIRED");
  } else {
    passed = false;
    details.push(`No assets unexpectedly ${JSON.stringify(noAssets)}`);
  }

  const leakyBundle = evaluateSecretsNeverBrowserAssets(
    baseInput({
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
  if (
    !leakyBundle.allowed &&
    leakyBundle.code === "SECRET_IN_BROWSER_ASSET_REFUSED"
  ) {
    details.push(
      "API key in JS bundle → SECRET_IN_BROWSER_ASSET_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Leaky bundle unexpectedly ${JSON.stringify(leakyBundle)}`);
  }

  const publicEnv = evaluateSecretsNeverBrowserAssets(
    baseInput({
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
  if (!publicEnv.allowed && publicEnv.code === "PUBLIC_ENV_SECRET_REFUSED") {
    details.push(
      "oauth client secret in public env embed → PUBLIC_ENV_SECRET_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Public env unexpectedly ${JSON.stringify(publicEnv)}`);
  }

  const brokerShip = evaluateSecretsNeverBrowserAssets(
    baseInput({ attemptShipBrokerSecretToBrowser: true }),
  );
  if (
    !brokerShip.allowed &&
    brokerShip.code === "BROKER_SECRET_TO_BROWSER_REFUSED"
  ) {
    details.push(
      "attemptShipBrokerSecretToBrowser → BROKER_SECRET_TO_BROWSER_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Broker ship unexpectedly ${JSON.stringify(brokerShip)}`);
  }

  const liveClaim = evaluateSecretsNeverBrowserAssets(
    baseInput({ claimLiveVerifiedScan: true }),
  );
  if (
    !liveClaim.allowed &&
    liveClaim.code === "FALSE_LIVE_VERIFIED_SCAN_REFUSED"
  ) {
    details.push(
      "claimLiveVerifiedScan → FALSE_LIVE_VERIFIED_SCAN_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Live claim unexpectedly ${JSON.stringify(liveClaim)}`);
  }

  const liveWire = evaluateSecretsNeverBrowserAssets(
    baseInput({ requestLiveProviderWiring: true }),
  );
  if (
    !liveWire.allowed &&
    liveWire.code === "LIVE_PROVIDER_WIRING_NOT_WIRED"
  ) {
    details.push("requestLiveProviderWiring → LIVE_PROVIDER_WIRING_NOT_WIRED");
  } else {
    passed = false;
    details.push(`Live wiring unexpectedly ${JSON.stringify(liveWire)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
  );
  details.push(
    "Distinct from T-X065 (worker browser auth OS deny), T-X005 (forged browser role), T-F24/T-US-047 (rotation secretsExported), T-X063 (prompt-injection exfil)",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: `proof-secrets-never-browser-assets-${randomUUID()}`,
    kind: SoakProofKind.SECRETS_NEVER_IN_BROWSER_ASSETS,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-secrets-never-browser-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
