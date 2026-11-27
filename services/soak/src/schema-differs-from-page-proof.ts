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

    // S1 (AA-305 idle): boolean schema claim absent from visible copy → mismatch.
    const boolMismatch = validateSchemaOrg({
      validationId: `val-tx042-bool-${randomUUID().slice(0, 8)}`,
      pageAssetId: "page-home",
      nodes: [
        {
          nodeId: "n1",
          schemaType: "LocalBusiness",
          properties: { name: matchName, servesAlcohol: true },
          citedFactIds: ["fact-ok"],
        },
      ],
      visibleContent: matchVisible,
      factLabels,
      fixtureOnly: true,
      createdAtIso: nowIso,
    });
    if (
      boolMismatch.verdict === SchemaValidationVerdict.PARTIAL &&
      !boolMismatch.agreesWithVisibleContent &&
      boolMismatch.issues.some((i) => i.code === "SCHEMA_VISIBLE_MISMATCH") &&
      boolMismatch.externalEffects === "NONE"
    ) {
      details.push(
        "Boolean schema property (servesAlcohol=true) absent from visible → SCHEMA_VISIBLE_MISMATCH / PARTIAL",
      );
    } else {
      passed = false;
      details.push(`Boolean mismatch unexpectedly ${JSON.stringify(boolMismatch)}`);
    }

    // S2 (Wipe15): empty nodes → SCHEMA_EMPTY; no silent PASS or invented approve.
    const emptyNodes = validateSchemaOrg({
      validationId: `val-tx042-empty-nodes-${randomUUID().slice(0, 8)}`,
      pageAssetId: "page-home",
      nodes: [],
      visibleContent: matchVisible,
      factLabels,
      fixtureOnly: true,
      createdAtIso: nowIso,
    });
    if (
      emptyNodes.verdict === SchemaValidationVerdict.FAIL &&
      emptyNodes.issues.some((i) => i.code === "SCHEMA_EMPTY") &&
      emptyNodes.externalEffects === "NONE"
    ) {
      details.push(
        "Empty schema.org nodes[] → SCHEMA_EMPTY / FAIL (hard refuse; no approve path)",
      );
    } else {
      passed = false;
      details.push(`Empty nodes unexpectedly ${JSON.stringify(emptyNodes)}`);
    }

    // S3 (Wipe15): UNKNOWN cited fact cannot back schema truth → soft refuse.
    const unknownFact = validateSchemaOrg({
      validationId: `val-tx042-unknown-fact-${randomUUID().slice(0, 8)}`,
      pageAssetId: "page-home",
      nodes: [
        {
          nodeId: "n1",
          schemaType: "LocalBusiness",
          properties: { name: matchName },
          citedFactIds: ["fact-unknown"],
        },
      ],
      visibleContent: matchVisible,
      factLabels: new Map([["fact-unknown", SupportLabel.UNKNOWN]]),
      fixtureOnly: true,
      createdAtIso: nowIso,
    });
    if (
      unknownFact.verdict === SchemaValidationVerdict.PARTIAL &&
      unknownFact.issues.some((i) => i.code === "SCHEMA_UNKNOWN_FACT") &&
      unknownFact.externalEffects === "NONE"
    ) {
      details.push(
        "UNKNOWN cited fact → SCHEMA_UNKNOWN_FACT / PARTIAL (no schema truth from unresolved fact)",
      );
    } else {
      passed = false;
      details.push(`UNKNOWN fact unexpectedly ${JSON.stringify(unknownFact)}`);
    }

    // S4 (Wipe15): whitespace-only schemaType → SCHEMA_TYPE_MISSING / hard FAIL.
    const typeMissing = validateSchemaOrg({
      validationId: `val-tx042-type-missing-${randomUUID().slice(0, 8)}`,
      pageAssetId: "page-home",
      nodes: [
        {
          nodeId: "n1",
          schemaType: "   ",
          properties: { name: matchName },
          citedFactIds: ["fact-ok"],
        },
      ],
      visibleContent: matchVisible,
      factLabels,
      fixtureOnly: true,
      createdAtIso: nowIso,
    });
    if (
      typeMissing.verdict === SchemaValidationVerdict.FAIL &&
      typeMissing.issues.some((i) => i.code === "SCHEMA_TYPE_MISSING") &&
      typeMissing.externalEffects === "NONE"
    ) {
      details.push(
        "Whitespace-only schemaType → SCHEMA_TYPE_MISSING / FAIL (hard refuse)",
      );
    } else {
      passed = false;
      details.push(`Type missing unexpectedly ${JSON.stringify(typeMissing)}`);
    }

    // S5 (Wipe15): cited fact absent from registry → SCHEMA_FACT_UNKNOWN / hard FAIL.
    const factUnknown = validateSchemaOrg({
      validationId: `val-tx042-fact-unknown-${randomUUID().slice(0, 8)}`,
      pageAssetId: "page-home",
      nodes: [
        {
          nodeId: "n1",
          schemaType: "LocalBusiness",
          properties: { name: matchName },
          citedFactIds: ["fact-not-in-registry"],
        },
      ],
      visibleContent: matchVisible,
      factLabels,
      fixtureOnly: true,
      createdAtIso: nowIso,
    });
    if (
      factUnknown.verdict === SchemaValidationVerdict.FAIL &&
      factUnknown.issues.some((i) => i.code === "SCHEMA_FACT_UNKNOWN") &&
      factUnknown.externalEffects === "NONE"
    ) {
      details.push(
        "Cited fact not in registry → SCHEMA_FACT_UNKNOWN / FAIL (hard refuse)",
      );
    } else {
      passed = false;
      details.push(`Fact unknown unexpectedly ${JSON.stringify(factUnknown)}`);
    }

    // S6 (Wipe15): HYPOTHESIS cited fact cannot back schema truth → hard FAIL.
    const hypothesisFact = validateSchemaOrg({
      validationId: `val-tx042-hypothesis-${randomUUID().slice(0, 8)}`,
      pageAssetId: "page-home",
      nodes: [
        {
          nodeId: "n1",
          schemaType: "LocalBusiness",
          properties: { name: matchName },
          citedFactIds: ["fact-hypothesis"],
        },
      ],
      visibleContent: matchVisible,
      factLabels: new Map([["fact-hypothesis", SupportLabel.HYPOTHESIS]]),
      fixtureOnly: true,
      createdAtIso: nowIso,
    });
    if (
      hypothesisFact.verdict === SchemaValidationVerdict.FAIL &&
      hypothesisFact.issues.some((i) => i.code === "SCHEMA_HYPOTHESIS_NOT_TRUTH") &&
      hypothesisFact.externalEffects === "NONE"
    ) {
      details.push(
        "HYPOTHESIS cited fact → SCHEMA_HYPOTHESIS_NOT_TRUTH / FAIL (no schema truth from hypothesis)",
      );
    } else {
      passed = false;
      details.push(
        `Hypothesis fact unexpectedly ${JSON.stringify(hypothesisFact)}`,
      );
    }

    // S7 (Wipe15 retrain): numeric property absent from visible → SCHEMA_VISIBLE_MISMATCH.
    const numericMismatch = validateSchemaOrg({
      validationId: `val-tx042-numeric-${randomUUID().slice(0, 8)}`,
      pageAssetId: "page-home",
      nodes: [
        {
          nodeId: "n1",
          schemaType: "LocalBusiness",
          properties: { name: matchName, employeeCount: 99999 },
          citedFactIds: ["fact-ok"],
        },
      ],
      visibleContent: matchVisible,
      factLabels,
      fixtureOnly: true,
      createdAtIso: nowIso,
    });
    if (
      numericMismatch.verdict === SchemaValidationVerdict.PARTIAL &&
      !numericMismatch.agreesWithVisibleContent &&
      numericMismatch.issues.some((i) => i.code === "SCHEMA_VISIBLE_MISMATCH") &&
      numericMismatch.externalEffects === "NONE"
    ) {
      details.push(
        "Numeric schema property (employeeCount=99999) absent from visible → SCHEMA_VISIBLE_MISMATCH / PARTIAL",
      );
    } else {
      passed = false;
      details.push(
        `Numeric mismatch unexpectedly ${JSON.stringify(numericMismatch)}`,
      );
    }

    // S8 (Wipe15 retrain): padded name not in visible after trim → mismatch.
    const paddedMismatch = validateSchemaOrg({
      validationId: `val-tx042-padded-${randomUUID().slice(0, 8)}`,
      pageAssetId: "page-home",
      nodes: [
        {
          nodeId: "n1",
          schemaType: "LocalBusiness",
          properties: { name: "  Phantom Venue  " },
          citedFactIds: ["fact-ok"],
        },
      ],
      visibleContent: matchVisible,
      factLabels,
      fixtureOnly: true,
      createdAtIso: nowIso,
    });
    if (
      paddedMismatch.verdict === SchemaValidationVerdict.PARTIAL &&
      !paddedMismatch.agreesWithVisibleContent &&
      paddedMismatch.issues.some((i) => i.code === "SCHEMA_VISIBLE_MISMATCH") &&
      paddedMismatch.externalEffects === "NONE"
    ) {
      details.push(
        "Padded schema name absent from visible (post-trim) → SCHEMA_VISIBLE_MISMATCH / PARTIAL",
      );
    } else {
      passed = false;
      details.push(
        `Padded mismatch unexpectedly ${JSON.stringify(paddedMismatch)}`,
      );
    }

    // S9 (Wipe15 retrain): intentional case-fold match → PASS (not silent mismatch).
    const caseFoldPass = validateSchemaOrg({
      validationId: `val-tx042-case-s9-${randomUUID().slice(0, 8)}`,
      pageAssetId: "page-home",
      nodes: [
        {
          nodeId: "n1",
          schemaType: "LocalBusiness",
          properties: { name: matchName.toUpperCase() },
          citedFactIds: ["fact-ok"],
        },
      ],
      visibleContent: matchVisible.toLowerCase(),
      factLabels,
      fixtureOnly: true,
      createdAtIso: nowIso,
    });
    if (
      caseFoldPass.verdict === SchemaValidationVerdict.PASS &&
      caseFoldPass.agreesWithVisibleContent &&
      caseFoldPass.externalEffects === "NONE"
    ) {
      details.push(
        "Case-folded schema name matches visible → PASS (intentional fold; fixture NOT_WIRED)",
      );
    } else {
      passed = false;
      details.push(`Case-fold PASS unexpectedly ${JSON.stringify(caseFoldPass)}`);
    }

    // S10 (Wipe15 retrain): whitespace-trimmed name matches visible → PASS.
    const trimPass = validateSchemaOrg({
      validationId: `val-tx042-trim-s10-${randomUUID().slice(0, 8)}`,
      pageAssetId: "page-home",
      nodes: [
        {
          nodeId: "n1",
          schemaType: "LocalBusiness",
          properties: { name: `  ${matchName}  ` },
          citedFactIds: ["fact-ok"],
        },
      ],
      visibleContent: matchVisible,
      factLabels,
      fixtureOnly: true,
      createdAtIso: nowIso,
    });
    if (
      trimPass.verdict === SchemaValidationVerdict.PASS &&
      trimPass.agreesWithVisibleContent &&
      trimPass.externalEffects === "NONE"
    ) {
      details.push(
        "Whitespace-trimmed schema name matches visible → PASS (S10 retrain)",
      );
    } else {
      passed = false;
      details.push(`Trim PASS unexpectedly ${JSON.stringify(trimPass)}`);
    }

    // S11 (Wipe15 retrain): multi-property visible mismatch → multiple issues.
    const multiS11 = validateSchemaOrg({
      validationId: `val-tx042-multi-s11-${randomUUID().slice(0, 8)}`,
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
      visibleContent: matchVisible,
      factLabels,
      fixtureOnly: true,
      createdAtIso: nowIso,
    });
    const multiS11Count = multiS11.issues.filter(
      (i) => i.code === "SCHEMA_VISIBLE_MISMATCH",
    ).length;
    if (
      multiS11.verdict === SchemaValidationVerdict.PARTIAL &&
      !multiS11.agreesWithVisibleContent &&
      multiS11Count >= 2 &&
      multiS11.externalEffects === "NONE"
    ) {
      details.push(
        `S11 multi-property mismatch → ${multiS11Count} SCHEMA_VISIBLE_MISMATCH / PARTIAL`,
      );
    } else {
      passed = false;
      details.push(`Multi S11 unexpectedly ${JSON.stringify(multiS11)}`);
    }

    // S12 (Wipe15 retrain): non-fixture matched schema → LIVE_TRANSPORT_NOT_WIRED.
    const nonFixtureS12 = validateSchemaOrg({
      validationId: `val-tx042-nonfix-s12-${randomUUID().slice(0, 8)}`,
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
      nonFixtureS12.verdict === SchemaValidationVerdict.PARTIAL &&
      nonFixtureS12.issues.some((i) => i.code === "LIVE_TRANSPORT_NOT_WIRED") &&
      nonFixtureS12.liveProviderWiring === "NOT_WIRED" &&
      nonFixtureS12.externalEffects === "NONE"
    ) {
      details.push(
        "S12 fixtureOnly=false matched schema → LIVE_TRANSPORT_NOT_WIRED (no invented live CMS)",
      );
    } else {
      passed = false;
      details.push(
        `Non-fixture S12 unexpectedly ${JSON.stringify(nonFixtureS12)}`,
      );
    }

    // S13 (Wipe15): fixture + liveCmsWiring=WIRED → LIVE_TRANSPORT_NOT_WIRED.
    const wiredS13 = validateSchemaOrg({
      validationId: `val-tx042-wired-s13-${randomUUID().slice(0, 8)}`,
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
      wiredS13.verdict === SchemaValidationVerdict.PARTIAL &&
      wiredS13.issues.some((i) => i.code === "LIVE_TRANSPORT_NOT_WIRED") &&
      wiredS13.liveProviderWiring === "NOT_WIRED" &&
      wiredS13.externalEffects === "NONE"
    ) {
      details.push(
        "S13 fixture liveCmsWiring=WIRED → LIVE_TRANSPORT_NOT_WIRED (no invented CMS publish)",
      );
    } else {
      passed = false;
      details.push(`WIRED S13 unexpectedly ${JSON.stringify(wiredS13)}`);
    }

    // S19 (tip-moved-273): SCHEMA_EMPTY FAIL — agreesWithVisibleContent stays true (no false visible claim).
    const emptyAgreesS19 = validateSchemaOrg({
      validationId: `val-tx042-empty-s19-${randomUUID().slice(0, 8)}`,
      pageAssetId: "page-home",
      nodes: [],
      visibleContent: matchVisible,
      factLabels,
      fixtureOnly: true,
      createdAtIso: nowIso,
    });
    if (
      emptyAgreesS19.verdict === SchemaValidationVerdict.FAIL &&
      emptyAgreesS19.issues.some((i) => i.code === "SCHEMA_EMPTY") &&
      emptyAgreesS19.agreesWithVisibleContent &&
      emptyAgreesS19.externalEffects === "NONE"
    ) {
      details.push(
        "S19 SCHEMA_EMPTY / FAIL with agreesWithVisibleContent=true (no invented visible mismatch)",
      );
    } else {
      passed = false;
      details.push(`Empty agrees S19 unexpectedly ${JSON.stringify(emptyAgreesS19)}`);
    }

    // S18 (tip-moved-272 FULL wipe+retip+train): UNKNOWN fact + matching visible → PARTIAL, visible agrees.
    const unknownVisibleOkS18 = validateSchemaOrg({
      validationId: `val-tx042-unknown-s18-${randomUUID().slice(0, 8)}`,
      pageAssetId: "page-home",
      nodes: [
        {
          nodeId: "n1",
          schemaType: "LocalBusiness",
          properties: { name: matchName },
          citedFactIds: ["fact-unknown"],
        },
      ],
      visibleContent: matchVisible,
      factLabels: new Map([["fact-unknown", SupportLabel.UNKNOWN]]),
      fixtureOnly: true,
      createdAtIso: nowIso,
    });
    if (
      unknownVisibleOkS18.verdict === SchemaValidationVerdict.PARTIAL &&
      unknownVisibleOkS18.issues.some((i) => i.code === "SCHEMA_UNKNOWN_FACT") &&
      unknownVisibleOkS18.agreesWithVisibleContent &&
      unknownVisibleOkS18.externalEffects === "NONE"
    ) {
      details.push(
        "S18 UNKNOWN fact + matching visible name → PARTIAL; agreesWithVisibleContent=true",
      );
    } else {
      passed = false;
      details.push(
        `Unknown visible OK S18 unexpectedly ${JSON.stringify(unknownVisibleOkS18)}`,
      );
    }

    // S17 (Wipe15 timer FULL train): null property skipped — matching name PASS.
    const nullSkipS17 = validateSchemaOrg({
      validationId: `val-tx042-null-s17-${randomUUID().slice(0, 8)}`,
      pageAssetId: "page-home",
      nodes: [
        {
          nodeId: "n1",
          schemaType: "LocalBusiness",
          properties: {
            name: matchName,
            description: null,
          },
          citedFactIds: ["fact-ok"],
        },
      ],
      visibleContent: matchVisible,
      factLabels,
      fixtureOnly: true,
      createdAtIso: nowIso,
    });
    if (
      nullSkipS17.verdict === SchemaValidationVerdict.PASS &&
      nullSkipS17.agreesWithVisibleContent &&
      nullSkipS17.externalEffects === "NONE" &&
      nullSkipS17.liveProviderWiring === "NOT_WIRED"
    ) {
      details.push(
        "S17 null property skipped → visible agreement PASS (no invented claim)",
      );
    } else {
      passed = false;
      details.push(`Null skip S17 unexpectedly ${JSON.stringify(nullSkipS17)}`);
    }

    // S16 (Wipe15 FULL wipe+train): unknown fact hard FAIL precedence over visible mismatch.
    const factUnknownPrecedenceS16 = validateSchemaOrg({
      validationId: `val-tx042-unknown-s16-${randomUUID().slice(0, 8)}`,
      pageAssetId: "page-home",
      nodes: [
        {
          nodeId: "n1",
          schemaType: "LocalBusiness",
          properties: { name: "Phantom Venue" },
          citedFactIds: ["fact-not-in-registry"],
        },
      ],
      visibleContent: matchVisible,
      factLabels,
      fixtureOnly: true,
      createdAtIso: nowIso,
    });
    if (
      factUnknownPrecedenceS16.verdict === SchemaValidationVerdict.FAIL &&
      factUnknownPrecedenceS16.issues.some(
        (i) => i.code === "SCHEMA_FACT_UNKNOWN",
      ) &&
      factUnknownPrecedenceS16.issues.some(
        (i) => i.code === "SCHEMA_VISIBLE_MISMATCH",
      ) &&
      factUnknownPrecedenceS16.externalEffects === "NONE"
    ) {
      details.push(
        "S16 hard FAIL precedence: SCHEMA_FACT_UNKNOWN + visible mismatch → FAIL (not PARTIAL)",
      );
    } else {
      passed = false;
      details.push(
        `Fact-unknown precedence S16 unexpectedly ${JSON.stringify(factUnknownPrecedenceS16)}`,
      );
    }

    // S15 (Wipe15 FULL wipe+train): HYPOTHESIS hard FAIL precedence over visible mismatch.
    const hypothesisPrecedenceS15 = validateSchemaOrg({
      validationId: `val-tx042-hyp-s15-${randomUUID().slice(0, 8)}`,
      pageAssetId: "page-home",
      nodes: [
        {
          nodeId: "n1",
          schemaType: "LocalBusiness",
          properties: { name: "Phantom Venue" },
          citedFactIds: ["fact-hypothesis"],
        },
      ],
      visibleContent: matchVisible,
      factLabels: new Map([["fact-hypothesis", SupportLabel.HYPOTHESIS]]),
      fixtureOnly: true,
      createdAtIso: nowIso,
    });
    if (
      hypothesisPrecedenceS15.verdict === SchemaValidationVerdict.FAIL &&
      hypothesisPrecedenceS15.issues.some(
        (i) => i.code === "SCHEMA_HYPOTHESIS_NOT_TRUTH",
      ) &&
      hypothesisPrecedenceS15.issues.some(
        (i) => i.code === "SCHEMA_VISIBLE_MISMATCH",
      ) &&
      hypothesisPrecedenceS15.externalEffects === "NONE"
    ) {
      details.push(
        "S15 hard FAIL precedence: HYPOTHESIS fact + visible mismatch → FAIL (not PARTIAL)",
      );
    } else {
      passed = false;
      details.push(
        `Hypothesis precedence S15 unexpectedly ${JSON.stringify(hypothesisPrecedenceS15)}`,
      );
    }

    // S14 (Wipe15 FULL wipe+train): hard FAIL precedence over visible mismatch.
    const hardPrecedenceS14 = validateSchemaOrg({
      validationId: `val-tx042-hard-s14-${randomUUID().slice(0, 8)}`,
      pageAssetId: "page-home",
      nodes: [
        {
          nodeId: "n1",
          schemaType: "   ",
          properties: { name: "Phantom Venue" },
          citedFactIds: ["fact-ok"],
        },
      ],
      visibleContent: matchVisible,
      factLabels,
      fixtureOnly: true,
      createdAtIso: nowIso,
    });
    if (
      hardPrecedenceS14.verdict === SchemaValidationVerdict.FAIL &&
      hardPrecedenceS14.issues.some((i) => i.code === "SCHEMA_TYPE_MISSING") &&
      hardPrecedenceS14.issues.some((i) => i.code === "SCHEMA_VISIBLE_MISMATCH") &&
      hardPrecedenceS14.externalEffects === "NONE"
    ) {
      details.push(
        "S14 hard FAIL precedence: SCHEMA_TYPE_MISSING + visible mismatch → FAIL (not PARTIAL)",
      );
    } else {
      passed = false;
      details.push(
        `Hard precedence S14 unexpectedly ${JSON.stringify(hardPrecedenceS14)}`,
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
