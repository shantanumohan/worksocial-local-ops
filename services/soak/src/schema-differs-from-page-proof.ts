/**
 * Fixture proof for T-X042 — schema differs from page → gate fails.
 * Exercises the persisted SEO service path: createProposal → validateSchema →
 * approveProposal / releasePilotPage. Schema.org values absent from visible
 * page content yield SCHEMA_VISIBLE_MISMATCH; approval and release are
 * rejected with no gateway decision. External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  OperatingMode,
  SchemaValidationVerdict,
  SeoChangeKind,
  SeoProposalStatus,
  SoakProofKind,
  SupportLabel,
  emptyProductionMappingState,
  type SoakProofRecord,
} from "@worksocial/domain";
import { createFileSeoStore } from "@worksocial/persistence";
import { createSeoService } from "@worksocial/seo";

/**
 * Complete expected proof set for T-X042 fixture ACCEPTED.
 */
export function proofSchemaDiffersFromPageGateFails(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;
  const dir = mkdtempSync(join(tmpdir(), "ws-soak-tx042-"));

  try {
    const svc = createSeoService(createFileSeoStore(dir));
    const factLabels = new Map([["fact-ok", SupportLabel.SUPPORTED]]);
    const mismatchName = "Phantom Sky Lounge";
    const visibleContent = "Welcome to WorkSocial Hudson boardroom coworking";

    const mismatchDraft = svc.createProposal({
      proposalId: `prop-tx042-mismatch-${randomUUID().slice(0, 8)}`,
      pageAssetId: "page-home",
      changeKind: SeoChangeKind.SCHEMA,
      title: "Emit mismatched LocalBusiness schema",
      summary: "Schema name not on page",
      proposedFields: {
        "@type": "LocalBusiness",
        name: mismatchName,
      },
      citedFactIds: ["fact-ok"],
      fixtureOnly: true,
      nowIso,
    });
    if (mismatchDraft.status !== SeoProposalStatus.DRAFT) {
      passed = false;
      details.push(`Mismatch draft unexpectedly ${mismatchDraft.status}`);
    }

    const mismatchValidation = svc.validateSchema({
      validationId: `val-tx042-mismatch-${randomUUID().slice(0, 8)}`,
      pageAssetId: mismatchDraft.pageAssetId,
      proposalId: mismatchDraft.proposalId,
      nodes: [
        {
          nodeId: "n1",
          schemaType: "LocalBusiness",
          properties: { name: mismatchName },
          citedFactIds: ["fact-ok"],
        },
      ],
      visibleContent,
      factLabels,
      fixtureOnly: true,
      nowIso,
    });
    if (
      mismatchValidation.ok &&
      mismatchValidation.validation.verdict === SchemaValidationVerdict.PARTIAL &&
      mismatchValidation.validation.agreesWithVisibleContent === false &&
      mismatchValidation.validation.issues.some(
        (i) => i.code === "SCHEMA_VISIBLE_MISMATCH",
      )
    ) {
      details.push(
        "Persisted validateSchema: name absent from visible content → SCHEMA_VISIBLE_MISMATCH / PARTIAL",
      );
    } else {
      passed = false;
      details.push(
        `Mismatch validateSchema unexpectedly ${JSON.stringify(mismatchValidation)}`,
      );
    }

    const mismatchApprove = svc.approveProposal({
      proposalId: mismatchDraft.proposalId,
      factLabels,
      nowIso,
    });
    if (
      !mismatchApprove.ok &&
      mismatchApprove.proposal?.status === SeoProposalStatus.DRAFT &&
      mismatchApprove.reasons.some((r) => /PARTIAL|visible mismatch/i.test(r))
    ) {
      details.push(
        "Persisted approveProposal rejected (PROPOSAL_GATE_FAILED / PARTIAL) — stays DRAFT",
      );
    } else {
      passed = false;
      details.push(
        `Mismatch approve unexpectedly ${JSON.stringify({
          ok: mismatchApprove.ok,
          status: mismatchApprove.proposal?.status,
          reasons: mismatchApprove.reasons,
        })}`,
      );
    }

    const mismatchRelease = svc.releasePilotPage({
      proposalId: mismatchDraft.proposalId,
      authority: {
        outboundStopped: false,
        operatingMode: OperatingMode.OPERATE,
        policies: [],
        grants: [],
      },
      productionMapping: emptyProductionMappingState(nowIso),
      factLabels,
      nowIso,
    });
    if (
      mismatchRelease.gatewayDecision === null &&
      mismatchRelease.outcome === null &&
      mismatchRelease.proposal?.status === SeoProposalStatus.DRAFT &&
      mismatchRelease.details.some((d) => /APPROVED|status/i.test(d))
    ) {
      details.push(
        "Persisted releasePilotPage: no gateway decision (still DRAFT after gate fail)",
      );
    } else {
      passed = false;
      details.push(
        `Mismatch release unexpectedly gateway=${mismatchRelease.gatewayDecision != null} status=${mismatchRelease.proposal?.status} details=${JSON.stringify(mismatchRelease.details)}`,
      );
    }

    const matchName = "WorkSocial";
    const matchVisible = "Welcome to WorkSocial Hudson boardroom coworking";
    const matchDraft = svc.createProposal({
      proposalId: `prop-tx042-match-${randomUUID().slice(0, 8)}`,
      pageAssetId: "page-home",
      changeKind: SeoChangeKind.SCHEMA,
      title: "Emit matching LocalBusiness schema",
      summary: "Schema name on page",
      proposedFields: {
        "@type": "LocalBusiness",
        name: matchName,
      },
      citedFactIds: ["fact-ok"],
      fixtureOnly: true,
      nowIso,
    });

    const matchValidation = svc.validateSchema({
      validationId: `val-tx042-match-${randomUUID().slice(0, 8)}`,
      pageAssetId: matchDraft.pageAssetId,
      proposalId: matchDraft.proposalId,
      nodes: [
        {
          nodeId: "n1",
          schemaType: "LocalBusiness",
          properties: { name: matchName },
          citedFactIds: ["fact-ok"],
        },
      ],
      visibleContent: matchVisible,
      factLabels,
      fixtureOnly: true,
      nowIso,
    });
    const matchApprove = svc.approveProposal({
      proposalId: matchDraft.proposalId,
      factLabels,
      nowIso,
    });
    if (
      matchValidation.ok &&
      matchValidation.validation.verdict === SchemaValidationVerdict.PASS &&
      matchValidation.validation.agreesWithVisibleContent === true &&
      matchApprove.ok &&
      matchApprove.proposal?.status === SeoProposalStatus.APPROVED
    ) {
      details.push(
        "Positive control: matching schema → validateSchema PASS + approveProposal APPROVED",
      );
    } else {
      passed = false;
      details.push(
        `Match path unexpectedly validation=${JSON.stringify(matchValidation)} approve=${JSON.stringify({
          ok: matchApprove.ok,
          status: matchApprove.proposal?.status,
          reasons: matchApprove.reasons,
        })}`,
      );
    }

    details.push("liveProviderSuccessClaimed=false externalEffects=NONE");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  return {
    proofId: `proof-schema-differs-page-${randomUUID()}`,
    kind: SoakProofKind.SCHEMA_DIFFERS_FROM_PAGE_GATE_FAILS,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-tx042-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
