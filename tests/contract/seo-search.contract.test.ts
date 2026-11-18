/**
 * Contract: R1-07 SEO and search — schema validation rejects HYPOTHESIS as
 * truth; proposal gates enforce SUPPORTED citations; pilot page release goes
 * through the gateway with ownership + read evidence; acceptance ≠ verified;
 * live CMS publish stays NOT_WIRED.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  OperatingMode,
  SchemaValidationVerdict,
  SeoChangeKind,
  SeoProposalStatus,
  SupportLabel,
  evaluateProposalGate,
  validateSchemaOrg,
} from "@worksocial/domain";
import {
  createDemoPublishGrant,
  createFileSeoStore,
} from "@worksocial/persistence";
import {
  SEO_GOLDEN_VISIBLE_CONTENT,
  SEO_PILOT_PAGE_ASSET_ID,
  createSeoService,
  createFixtureSeoPilotMapping,
  proveFixtureSeoWritePath,
} from "@worksocial/seo";

const now = "2026-11-18T17:00:00.000Z";

describe("contract: SEO schema validation and proposal gates", () => {
  it("never treats HYPOTHESIS facts as schema truth", () => {
    const result = validateSchemaOrg({
      validationId: "c-val-hyp",
      pageAssetId: SEO_PILOT_PAGE_ASSET_ID,
      nodes: [
        {
          nodeId: "n1",
          schemaType: "LocalBusiness",
          properties: { name: "WorkSocial" },
          citedFactIds: ["hyp-1"],
        },
      ],
      visibleContent: SEO_GOLDEN_VISIBLE_CONTENT,
      factLabels: new Map([["hyp-1", SupportLabel.HYPOTHESIS]]),
      fixtureOnly: true,
      createdAtIso: now,
    });
    expect(result.verdict).toBe(SchemaValidationVerdict.FAIL);
    expect(
      result.issues.some((i) => i.code === "SCHEMA_HYPOTHESIS_NOT_TRUTH"),
    ).toBe(true);
  });

  it("blocks proposal release when cited facts are not SUPPORTED", () => {
    const gate = evaluateProposalGate({
      proposal: {
        proposalId: "c-prop",
        pageAssetId: SEO_PILOT_PAGE_ASSET_ID,
        pageAuditId: null,
        changeKind: SeoChangeKind.CONTENT,
        title: "Bad cite",
        summary: "Uses hypothesis as truth",
        proposedFields: { body: "claim" },
        citedFactIds: ["hyp-1"],
        hypothesisFactIds: [],
        status: SeoProposalStatus.APPROVED,
        fixtureOnly: true,
        gatewayOperationId: null,
        writePathId: null,
        createdAtIso: now,
        updatedAtIso: now,
      },
      factLabels: new Map([["hyp-1", SupportLabel.HYPOTHESIS]]),
    });
    expect(gate.allowed).toBe(false);
    expect(gate.code).toBe("PROPOSAL_GATE_FAILED");
  });
});

describe("contract: verified pilot page release path", () => {
  it("requires mapping ownership + read evidence; acceptance ≠ verified; CMS NOT_WIRED", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-seo-contract-"));
    try {
      const svc = createSeoService(createFileSeoStore(dir));
      const demo = createDemoPublishGrant(now);

      const unproven = createFixtureSeoPilotMapping(now).state;
      const proven = proveFixtureSeoWritePath(unproven, now);

      const proposal = svc.createProposal({
        proposalId: "c-release",
        pageAssetId: SEO_PILOT_PAGE_ASSET_ID,
        changeKind: SeoChangeKind.METADATA,
        title: "Pilot title",
        summary: "Gateway-gated release",
        proposedFields: {
          title: "WorkSocial Jersey City | Day pass coworking & meeting rooms",
        },
        citedFactIds: ["fixture-fact-hours"],
        status: SeoProposalStatus.APPROVED,
        nowIso: now,
      });

      const denied = svc.releasePilotPage({
        proposalId: proposal.proposalId,
        authority: {
          outboundStopped: false,
          operatingMode: OperatingMode.OPERATE,
          policies: [demo.policy],
          grants: [demo.grant],
        },
        productionMapping: unproven,
        nowIso: now,
      });
      expect(denied.gatewayDecision?.allowed).toBe(false);
      expect(denied.liveCmsPublishWiring).toBe("NOT_WIRED");
      expect(denied.acceptanceEqualsVerified).toBe(false);

      // Re-create approved proposal after failure
      const proposal2 = svc.createProposal({
        proposalId: "c-release-2",
        pageAssetId: SEO_PILOT_PAGE_ASSET_ID,
        changeKind: SeoChangeKind.METADATA,
        title: "Pilot title verified path",
        summary: "Gateway-gated release with evidence",
        proposedFields: {
          title: "WorkSocial Jersey City | Day pass coworking & meeting rooms",
        },
        citedFactIds: ["fixture-fact-hours"],
        status: SeoProposalStatus.APPROVED,
        nowIso: now,
      });

      const pending = svc.releasePilotPage({
        proposalId: proposal2.proposalId,
        authority: {
          outboundStopped: false,
          operatingMode: OperatingMode.OPERATE,
          policies: [demo.policy],
          grants: [demo.grant],
        },
        productionMapping: proven,
        skipVerification: true,
        nowIso: now,
      });
      expect(pending.gatewayDecision?.allowed).toBe(true);
      expect(pending.gatewayDecision?.outcome).toBe("ACCEPTED_PENDING");
      expect(pending.proposal?.status).toBe(SeoProposalStatus.RELEASED_PENDING);
      expect(pending.outcome).toBeNull();

      const proposal3 = svc.createProposal({
        proposalId: "c-release-3",
        pageAssetId: SEO_PILOT_PAGE_ASSET_ID,
        changeKind: SeoChangeKind.METADATA,
        title: "Pilot title full verify",
        summary: "Verified fixture release",
        proposedFields: {
          title: "WorkSocial Jersey City | Day pass coworking & meeting rooms",
        },
        citedFactIds: ["fixture-fact-hours"],
        status: SeoProposalStatus.APPROVED,
        nowIso: now,
      });

      const verified = svc.releasePilotPage({
        proposalId: proposal3.proposalId,
        authority: {
          outboundStopped: false,
          operatingMode: OperatingMode.OPERATE,
          policies: [demo.policy],
          grants: [demo.grant],
        },
        productionMapping: proven,
        nowIso: now,
      });
      expect(verified.gatewayDecision?.outcome).toBe("VERIFIED");
      expect(verified.proposal?.status).toBe(SeoProposalStatus.VERIFIED);
      expect(verified.outcome?.label).toBe("SUCCESS");
      expect(verified.outcome?.fixtureOnly).toBe(true);
      expect(verified.liveCmsPublishWiring).toBe("NOT_WIRED");
      expect(verified.acceptanceEqualsVerified).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("semantic search fixture corpus enforces hard constraints", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-seo-search-c-"));
    try {
      const svc = createSeoService(createFileSeoStore(dir));
      svc.seedFixtures(now);
      const hit = svc.semanticSearch({
        rawQuery: "Training room for 20 in Jersey City with video",
        nowIso: now,
      });
      expect(hit.ok).toBe(true);
      if (hit.ok) {
        expect(hit.result.hits.some((h) => h.name.includes("Training"))).toBe(
          true,
        );
      }
      const miss = svc.semanticSearch({
        rawQuery: "Room for 100 people",
        nowIso: now,
      });
      expect(miss.ok).toBe(true);
      if (miss.ok) {
        expect(miss.result.hits).toHaveLength(0);
        expect(miss.result.noMatchReason).toMatch(/No eligible/);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
