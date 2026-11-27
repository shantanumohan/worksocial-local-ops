/**
 * Fixture proof for T-X042 — schema differs from page → gate fails.
 * Exercises the persisted SEO service path: createProposal → validateSchema →
 * approveProposal / releasePilotPage. Schema.org values absent from visible
 * page content yield SCHEMA_VISIBLE_MISMATCH; approval and release are
 * rejected with no gateway decision. External effects: NONE.
 *
 * Additive hillclimb edges: honesty fields on every validation; trim match;
 * case-fold match; empty/whitespace refuse; multi-property mismatch;
 * fixture+WIRED / non-fixture matched → LIVE_TRANSPORT_NOT_WIRED.
 * ACCEPTED ≠ VERIFIED. Live CMS NOT_WIRED.
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
  validateSchemaOrg,
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
      ) &&
      mismatchValidation.validation.externalEffects === "NONE" &&
      mismatchValidation.validation.liveProviderWiring === "NOT_WIRED"
    ) {
      details.push(
        "Persisted validateSchema: name absent from visible content → SCHEMA_VISIBLE_MISMATCH / PARTIAL; liveProviderWiring=NOT_WIRED externalEffects=NONE",
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
      matchValidation.validation.externalEffects === "NONE" &&
      matchValidation.validation.liveProviderWiring === "NOT_WIRED" &&
      matchApprove.ok &&
      matchApprove.proposal?.status === SeoProposalStatus.APPROVED
    ) {
      details.push(
        "Positive control: matching schema → validateSchema PASS + approveProposal APPROVED; honesty externalEffects=NONE liveProviderWiring=NOT_WIRED",
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

    // Additive domain edges (trim / case / empty / multi / WIRED / non-fixture).
    const trimMatch = validateSchemaOrg({
      validationId: `val-tx042-trim-${randomUUID().slice(0, 8)}`,
      pageAssetId: "page-home",
      nodes: [
        {
          nodeId: "n1",
          schemaType: "LocalBusiness",
          properties: { name: "  WorkSocial  " },
          citedFactIds: ["fact-ok"],
        },
      ],
      visibleContent: "  Welcome to WorkSocial Hudson boardroom  ",
      factLabels,
      fixtureOnly: true,
      createdAtIso: nowIso,
    });
    if (
      trimMatch.verdict === SchemaValidationVerdict.PASS &&
      trimMatch.agreesWithVisibleContent &&
      trimMatch.externalEffects === "NONE" &&
      trimMatch.liveProviderWiring === "NOT_WIRED"
    ) {
      details.push(
        "Whitespace-trimmed schema name matches visible content → PASS (fixture NOT_WIRED)",
      );
    } else {
      passed = false;
      details.push(`Trim match unexpectedly ${JSON.stringify(trimMatch)}`);
    }

    const caseMatch = validateSchemaOrg({
      validationId: `val-tx042-case-${randomUUID().slice(0, 8)}`,
      pageAssetId: "page-home",
      nodes: [
        {
          nodeId: "n1",
          schemaType: "LocalBusiness",
          properties: { name: "WORKSOCIAL" },
          citedFactIds: ["fact-ok"],
        },
      ],
      visibleContent: "welcome to worksocial hudson",
      factLabels,
      fixtureOnly: true,
      createdAtIso: nowIso,
    });
    if (
      caseMatch.verdict === SchemaValidationVerdict.PASS &&
      caseMatch.agreesWithVisibleContent
    ) {
      details.push(
        "Case-fold schema name matches visible content → PASS (intentional fold)",
      );
    } else {
      passed = false;
      details.push(`Case match unexpectedly ${JSON.stringify(caseMatch)}`);
    }

    const emptyName = validateSchemaOrg({
      validationId: `val-tx042-empty-${randomUUID().slice(0, 8)}`,
      pageAssetId: "page-home",
      nodes: [
        {
          nodeId: "n1",
          schemaType: "LocalBusiness",
          properties: { name: "   " },
          citedFactIds: ["fact-ok"],
        },
      ],
      visibleContent,
      factLabels,
      fixtureOnly: true,
      createdAtIso: nowIso,
    });
    if (
      emptyName.verdict === SchemaValidationVerdict.PARTIAL &&
      !emptyName.agreesWithVisibleContent &&
      emptyName.issues.some((i) => i.code === "SCHEMA_VISIBLE_MISMATCH") &&
      emptyName.liveProviderWiring === "NOT_WIRED"
    ) {
      details.push(
        "Empty/whitespace schema name → SCHEMA_VISIBLE_MISMATCH / PARTIAL (no silent PASS)",
      );
    } else {
      passed = false;
      details.push(`Empty name unexpectedly ${JSON.stringify(emptyName)}`);
    }

    const multiMismatch = validateSchemaOrg({
      validationId: `val-tx042-multi-${randomUUID().slice(0, 8)}`,
      pageAssetId: "page-home",
      nodes: [
        {
          nodeId: "n1",
          schemaType: "LocalBusiness",
          properties: {
            name: "Phantom Sky Lounge",
            address: "999 Nowhere Ave",
            telephone: "+1-555-0100",
          },
          citedFactIds: ["fact-ok"],
        },
      ],
      visibleContent,
      factLabels,
      fixtureOnly: true,
      createdAtIso: nowIso,
    });
    const multiCount = multiMismatch.issues.filter(
      (i) => i.code === "SCHEMA_VISIBLE_MISMATCH",
    ).length;
    if (
      multiMismatch.verdict === SchemaValidationVerdict.PARTIAL &&
      multiCount >= 2 &&
      multiMismatch.externalEffects === "NONE"
    ) {
      details.push(
        `Multi-property mismatch (name+address+telephone) → ${multiCount} SCHEMA_VISIBLE_MISMATCH issues / PARTIAL`,
      );
    } else {
      passed = false;
      details.push(
        `Multi-property mismatch unexpectedly ${JSON.stringify(multiMismatch)}`,
      );
    }

    const wiredRefuse = validateSchemaOrg({
      validationId: `val-tx042-wired-${randomUUID().slice(0, 8)}`,
      pageAssetId: "page-home",
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
      liveCmsWiring: "WIRED",
      createdAtIso: nowIso,
    });
    if (
      wiredRefuse.verdict === SchemaValidationVerdict.PARTIAL &&
      wiredRefuse.issues.some((i) => i.code === "LIVE_TRANSPORT_NOT_WIRED") &&
      wiredRefuse.liveProviderWiring === "NOT_WIRED" &&
      wiredRefuse.externalEffects === "NONE"
    ) {
      details.push(
        "Fixture match with liveCmsWiring=WIRED → LIVE_TRANSPORT_NOT_WIRED; no invented live CMS publish",
      );
    } else {
      passed = false;
      details.push(`WIRED refuse unexpectedly ${JSON.stringify(wiredRefuse)}`);
    }

    const nonFixtureRefuse = validateSchemaOrg({
      validationId: `val-tx042-nonfix-${randomUUID().slice(0, 8)}`,
      pageAssetId: "page-home",
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
      fixtureOnly: false,
      createdAtIso: nowIso,
    });
    if (
      nonFixtureRefuse.verdict === SchemaValidationVerdict.PARTIAL &&
      nonFixtureRefuse.issues.some(
        (i) => i.code === "LIVE_TRANSPORT_NOT_WIRED",
      ) &&
      nonFixtureRefuse.liveProviderWiring === "NOT_WIRED"
    ) {
      details.push(
        "Matching schema with fixtureOnly=false → LIVE_TRANSPORT_NOT_WIRED; no invented live success",
      );
    } else {
      passed = false;
      details.push(
        `Non-fixture refuse unexpectedly ${JSON.stringify(nonFixtureRefuse)}`,
      );
    }

    details.push(
      "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE ACCEPTED≠VERIFIED",
    );
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
