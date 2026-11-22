/**
 * Fixture proof for T-US-028 — Prefer one useful page update over keyword
 * proliferation. Blocking decision + preserved inputs + recovery path when
 * many thin keyword pages are proposed; one useful update preferred when
 * collapsed; false success claims refused; live NOT_WIRED.
 * Distinct from T-US-027 (release receipt + experiment window).
 * External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  evaluateKeywordProliferationGate,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-US-028 fixture ACCEPTED.
 */
export function proofKeywordProliferationOneUsefulUpdate(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const preferred = {
    pageId: "page-acoustic-guide",
    pagePath: "/guides/acoustic-privacy",
    editableVerified: true,
    usefulUpdateSummary:
      "Expand acoustic privacy FAQ with measured booth attenuation",
  } as const;

  const thinPages = [
    {
      proposedPageId: "thin-acoustic-booth",
      keywordSlug: "acoustic-booth-nyc",
      thinOutline: "Thin keyword page for acoustic booth nyc",
    },
    {
      proposedPageId: "thin-phone-booth-quiet",
      keywordSlug: "quiet-phone-booth",
      thinOutline: "Thin keyword page for quiet phone booth",
    },
    {
      proposedPageId: "thin-private-office-sound",
      keywordSlug: "private-office-soundproof",
      thinOutline: "Thin keyword page for private office soundproof",
    },
  ] as const;

  const preferredPath = evaluateKeywordProliferationGate({
    demandLabel: "private office acoustic privacy",
    proposedKeywordPages: [],
    preferredUpdate: preferred,
    requestKeywordProliferation: false,
    claimSuccessDespiteProliferation: false,
    requestLiveProviderWiring: false,
  });
  if (
    preferredPath.allowed &&
    preferredPath.code === "ONE_USEFUL_PAGE_UPDATE_PREFERRED" &&
    preferredPath.proliferationRefused &&
    preferredPath.liveProviderWiring === "NOT_WIRED" &&
    preferredPath.externalEffects === "NONE" &&
    preferredPath.evidence.preferredPageId === preferred.pageId &&
    preferredPath.evidence.recoveryPath ===
      "COLLAPSE_TO_ONE_USEFUL_PAGE_UPDATE"
  ) {
    details.push(
      "Preferred → ONE_USEFUL_PAGE_UPDATE_PREFERRED; proliferation refused; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Preferred unexpectedly ${JSON.stringify(preferredPath)}`);
  }

  const proliferation = evaluateKeywordProliferationGate({
    demandLabel: "private office acoustic privacy",
    proposedKeywordPages: thinPages,
    preferredUpdate: preferred,
    requestKeywordProliferation: true,
    claimSuccessDespiteProliferation: false,
    requestLiveProviderWiring: false,
  });
  if (
    !proliferation.allowed &&
    proliferation.code === "KEYWORD_PROLIFERATION_REFUSED" &&
    proliferation.evidence?.currentState === "BLOCKED" &&
    proliferation.evidence.refusedProposedPageIds.length === 3 &&
    proliferation.evidence.recoveryPath ===
      "COLLAPSE_TO_ONE_USEFUL_PAGE_UPDATE" &&
    proliferation.evidence.preservedInputCount > 0
  ) {
    details.push(
      "requestKeywordProliferation → KEYWORD_PROLIFERATION_REFUSED; preserved inputs + recovery path",
    );
  } else {
    passed = false;
    details.push(
      `Keyword proliferation unexpectedly ${JSON.stringify(proliferation)}`,
    );
  }

  const falseClaim = evaluateKeywordProliferationGate({
    demandLabel: "private office acoustic privacy",
    proposedKeywordPages: thinPages,
    preferredUpdate: preferred,
    requestKeywordProliferation: true,
    claimSuccessDespiteProliferation: true,
    requestLiveProviderWiring: false,
  });
  if (
    !falseClaim.allowed &&
    falseClaim.code === "FALSE_SUCCESS_CLAIM_REFUSED"
  ) {
    details.push(
      "claimSuccessDespiteProliferation → FALSE_SUCCESS_CLAIM_REFUSED",
    );
  } else {
    passed = false;
    details.push(`False claim unexpectedly ${JSON.stringify(falseClaim)}`);
  }

  const live = evaluateKeywordProliferationGate({
    demandLabel: "private office acoustic privacy",
    proposedKeywordPages: [],
    preferredUpdate: preferred,
    requestKeywordProliferation: false,
    claimSuccessDespiteProliferation: false,
    requestLiveProviderWiring: true,
  });
  if (!live.allowed && live.code === "LIVE_PROVIDER_WIRING_NOT_WIRED") {
    details.push("requestLiveProviderWiring → LIVE_PROVIDER_WIRING_NOT_WIRED");
  } else {
    passed = false;
    details.push(`Live wiring unexpectedly ${JSON.stringify(live)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
  );
  details.push(
    "Distinct from T-US-027 (demand page improvement release receipt + experiment window)",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: `proof-keyword-prolif-${randomUUID()}`,
    kind: SoakProofKind.KEYWORD_PROLIFERATION_ONE_USEFUL_UPDATE,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-keyword-prolif-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
