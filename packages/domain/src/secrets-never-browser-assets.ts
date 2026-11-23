/**
 * T-US-053 — Secrets never in browser assets.
 *
 * Offline fixture gate (happy-path family): browser-served assets (JS
 * bundles, HTML, CSS, service workers, public env embeds) must not carry
 * secret material (API keys, refresh tokens, credential-broker secrets,
 * private keys, OAuth client secrets). A clean asset scan records the
 * proof. Secret-bearing browser assets, public-env secret embeds, and
 * attempts to ship broker secrets to the client are refused. Live
 * provider wiring stays NOT_WIRED. Pure domain — no network I/O.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 *
 * Distinct from T-X065 (worker browser auth state OS deny), T-X005
 * (forged browser role ignored), T-F24/T-US-047 (rotation
 * secretsExported=false), and T-X063 (indirect prompt-injection exfil
 * denied).
 */

export const BrowserAssetKind = {
  JS_BUNDLE: "js_bundle",
  HTML_DOCUMENT: "html_document",
  CSS_STYLESHEET: "css_stylesheet",
  SERVICE_WORKER: "service_worker",
  PUBLIC_ENV_EMBED: "public_env_embed",
} as const;

export type BrowserAssetKindValue =
  (typeof BrowserAssetKind)[keyof typeof BrowserAssetKind];

export const SecretMaterialKind = {
  API_KEY: "api_key",
  REFRESH_TOKEN: "refresh_token",
  CREDENTIAL_BROKER_SECRET: "credential_broker_secret",
  PRIVATE_KEY: "private_key",
  OAUTH_CLIENT_SECRET: "oauth_client_secret",
} as const;

export type SecretMaterialKindValue =
  (typeof SecretMaterialKind)[keyof typeof SecretMaterialKind];

export type BrowserAssetSample = {
  assetId: string;
  kind: BrowserAssetKindValue;
  /** True when the asset is served to a browser / client surface. */
  browserServed: boolean;
  /**
   * Declared secret materials present in the asset body (fixture oracle).
   * Empty for a clean browser asset.
   */
  embeddedSecretKinds: readonly SecretMaterialKindValue[];
  /** Public non-secret config only (feature flags, public analytics ids). */
  publicConfigOnly: boolean;
};

export type SecretsNeverBrowserAssetsInput = {
  scanId: string;
  assets: readonly BrowserAssetSample[];
  /**
   * Attempt to ship credential-broker secret material into a browser
   * asset — must refuse.
   */
  attemptShipBrokerSecretToBrowser: boolean;
  /** Claim the scan is live-verified — must refuse offline. */
  claimLiveVerifiedScan: boolean;
  /** Request live provider wiring — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
};

export type SecretsNeverBrowserAssetsDecision =
  | {
      allowed: true;
      code: "SECRETS_NEVER_IN_BROWSER_ASSETS_RECORDED";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        scanId: string;
        assetCount: number;
        browserServedCount: number;
        secretBearingBrowserAssetCount: 0;
        publicEnvSecretCount: 0;
        brokerSecretShipAttempted: false;
        scanVerifiedLive: false;
        productionWrites: false;
        blockingDecision: "BROWSER_ASSETS_SECRET_FREE";
        currentState: "SECRETS_NEVER_IN_BROWSER_ASSETS_RECORDED";
        recoveryPath: "KEEP_SECRETS_SERVER_SIDE";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "ASSET_SCAN_REQUIRED"
        | "SECRET_IN_BROWSER_ASSET_REFUSED"
        | "PUBLIC_ENV_SECRET_REFUSED"
        | "BROKER_SECRET_TO_BROWSER_REFUSED"
        | "FALSE_LIVE_VERIFIED_SCAN_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        scanId: string | null;
        assetCount: number;
        browserServedCount: number;
        secretBearingBrowserAssetCount: number;
        publicEnvSecretCount: number;
        brokerSecretShipAttempted: boolean;
        scanVerifiedLive: false;
        productionWrites: false;
        blockingDecision: string;
        currentState:
          | "BLOCKED"
          | "AWAITING_ASSET_SCAN"
          | "AWAITING_SECRET_FREE_ASSETS";
        recoveryPath:
          | "PROVIDE_BROWSER_ASSET_SAMPLES"
          | "STRIP_SECRETS_FROM_BROWSER_ASSETS"
          | "KEEP_SECRETS_IN_CREDENTIAL_BROKER";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const SECRETS_NEVER_BROWSER_ASSETS_RELATED_CASE_IDS = [
  "T-US-053",
] as const;

function preservedInputCount(input: SecretsNeverBrowserAssetsInput): number {
  return (
    (input.scanId.trim() ? 1 : 0) +
    (input.assets.length > 0 ? 1 : 0) +
    input.assets.filter((a) => a.assetId.trim()).length
  );
}

function isSecretBearing(asset: BrowserAssetSample): boolean {
  return asset.embeddedSecretKinds.length > 0;
}

function publicEnvSecretCount(assets: readonly BrowserAssetSample[]): number {
  return assets.filter(
    (a) =>
      a.browserServed &&
      a.kind === BrowserAssetKind.PUBLIC_ENV_EMBED &&
      isSecretBearing(a),
  ).length;
}

/**
 * Evaluate the T-US-053 secrets-never-in-browser-assets path offline.
 * Clean browser-served assets → SECRETS_NEVER_IN_BROWSER_ASSETS_RECORDED;
 * live stays NOT_WIRED; secret-bearing client assets refused.
 */
export function evaluateSecretsNeverBrowserAssets(
  input: SecretsNeverBrowserAssetsInput,
): SecretsNeverBrowserAssetsDecision {
  const base = {
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    productionWrites: false as const,
  };
  const preserved = preservedInputCount(input);
  const browserServed = input.assets.filter((a) => a.browserServed);
  const secretBearingBrowser = browserServed.filter(isSecretBearing);
  const publicEnvSecrets = publicEnvSecretCount(input.assets);

  const blockedEvidence = (
    blockingDecision: string,
    currentState:
      | "BLOCKED"
      | "AWAITING_ASSET_SCAN"
      | "AWAITING_SECRET_FREE_ASSETS",
    recoveryPath:
      | "PROVIDE_BROWSER_ASSET_SAMPLES"
      | "STRIP_SECRETS_FROM_BROWSER_ASSETS"
      | "KEEP_SECRETS_IN_CREDENTIAL_BROKER",
  ): NonNullable<
    Extract<SecretsNeverBrowserAssetsDecision, { allowed: false }>["evidence"]
  > => ({
    scanId: input.scanId.trim() || null,
    assetCount: input.assets.length,
    browserServedCount: browserServed.length,
    secretBearingBrowserAssetCount: secretBearingBrowser.length,
    publicEnvSecretCount: publicEnvSecrets,
    brokerSecretShipAttempted: input.attemptShipBrokerSecretToBrowser,
    scanVerifiedLive: false,
    productionWrites: false,
    blockingDecision,
    currentState,
    recoveryPath,
    preservedInputCount: preserved,
  });

  if (input.requestLiveProviderWiring) {
    return {
      allowed: false,
      code: "LIVE_PROVIDER_WIRING_NOT_WIRED",
      ...base,
      evidence: null,
      reasons: [
        "Live secrets-in-browser-assets provider wiring remains NOT_WIRED — refuse live wiring (T-US-053)",
      ],
    };
  }

  if (input.claimLiveVerifiedScan) {
    return {
      allowed: false,
      code: "FALSE_LIVE_VERIFIED_SCAN_REFUSED",
      ...base,
      evidence: null,
      reasons: [
        "Refused false live-verified browser-asset secret scan claim offline (T-US-053) — fixture ACCEPTED ≠ VERIFIED",
      ],
    };
  }

  if (input.attemptShipBrokerSecretToBrowser) {
    return {
      allowed: false,
      code: "BROKER_SECRET_TO_BROWSER_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "CREDENTIAL_BROKER_SECRET_SHIP_TO_BROWSER_REFUSED",
        "BLOCKED",
        "KEEP_SECRETS_IN_CREDENTIAL_BROKER",
      ),
      reasons: [
        "Credential-broker secrets must not ship into browser assets (T-US-053)",
      ],
    };
  }

  if (
    !input.scanId.trim() ||
    input.assets.length === 0 ||
    input.assets.some((a) => !a.assetId.trim()) ||
    browserServed.length === 0
  ) {
    return {
      allowed: false,
      code: "ASSET_SCAN_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "BROWSER_ASSET_SAMPLES_MISSING",
        "AWAITING_ASSET_SCAN",
        "PROVIDE_BROWSER_ASSET_SAMPLES",
      ),
      reasons: [
        "Browser asset secret scan requires scan id and at least one browser-served asset sample (T-US-053)",
      ],
    };
  }

  if (publicEnvSecrets > 0) {
    return {
      allowed: false,
      code: "PUBLIC_ENV_SECRET_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "PUBLIC_ENV_EMBED_CONTAINS_SECRET",
        "AWAITING_SECRET_FREE_ASSETS",
        "STRIP_SECRETS_FROM_BROWSER_ASSETS",
      ),
      reasons: [
        "Public env embeds must not carry secret material into the browser (T-US-053)",
      ],
    };
  }

  if (secretBearingBrowser.length > 0) {
    return {
      allowed: false,
      code: "SECRET_IN_BROWSER_ASSET_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "BROWSER_SERVED_ASSET_CONTAINS_SECRET",
        "AWAITING_SECRET_FREE_ASSETS",
        "STRIP_SECRETS_FROM_BROWSER_ASSETS",
      ),
      reasons: [
        "Browser-served assets must not embed API keys, tokens, private keys, or client secrets (T-US-053)",
      ],
    };
  }

  // Browser-served assets that claim publicConfigOnly=false without secrets
  // are still allowed only when no secrets are present; require honest flag.
  const dishonestPublicFlag = browserServed.some(
    (a) => !a.publicConfigOnly && a.embeddedSecretKinds.length === 0,
  );
  if (dishonestPublicFlag) {
    // Treat as incomplete scan honesty — public browser assets should be
    // labeled publicConfigOnly when secret-free.
    return {
      allowed: false,
      code: "ASSET_SCAN_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "BROWSER_ASSET_PUBLIC_CONFIG_FLAG_INCONSISTENT",
        "AWAITING_ASSET_SCAN",
        "PROVIDE_BROWSER_ASSET_SAMPLES",
      ),
      reasons: [
        "Secret-free browser assets must be labeled publicConfigOnly (T-US-053)",
      ],
    };
  }

  return {
    allowed: true,
    code: "SECRETS_NEVER_IN_BROWSER_ASSETS_RECORDED",
    ...base,
    evidence: {
      scanId: input.scanId.trim(),
      assetCount: input.assets.length,
      browserServedCount: browserServed.length,
      secretBearingBrowserAssetCount: 0,
      publicEnvSecretCount: 0,
      brokerSecretShipAttempted: false,
      scanVerifiedLive: false,
      productionWrites: false,
      blockingDecision: "BROWSER_ASSETS_SECRET_FREE",
      currentState: "SECRETS_NEVER_IN_BROWSER_ASSETS_RECORDED",
      recoveryPath: "KEEP_SECRETS_SERVER_SIDE",
      preservedInputCount: preserved,
    },
    reasons: [
      "Browser-served assets contain no secret material (T-US-053); live NOT_WIRED; externalEffects NONE",
    ],
  };
}
