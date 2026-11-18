/**
 * Contract: R1-07 SEO and search — schema validation rejects HYPOTHESIS as
 * truth; proposal gates enforce SUPPORTED citations; pilot page release goes
 * through the shared gateway with persisted ownership + read evidence;
 * acceptance ≠ verified until fixture read-back.
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
  createSeoProposal,
  digestSeoSchemaPayload,
  evaluateProposalGate,
  validateSchemaOrg,
} from "@worksocial/domain";
import {
  createDemoPublishGrant,
  createFileSeoStore,
} from "@worksocial/persistence";
import { createActionGateway } from "@worksocial/action-gateway";
import {
  SEO_GOLDEN_VISIBLE_CONTENT,
  SEO_PILOT_PAGE_ASSET_ID,
  createSeoService,
  createFixtureSeoPilotMapping,
  proveFixtureSeoWritePath,
} from "@worksocial/seo";

const now = "2026-11-18T17:00:00.000Z";
const labels = new Map([
  ["fixture-fact-hours", SupportLabel.SUPPORTED],
  ["fixture-fact-hypothesis", SupportLabel.HYPOTHESIS],
]);

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
    const base = createSeoProposal({
      proposalId: "c-prop",
      pageAssetId: SEO_PILOT_PAGE_ASSET_ID,
      changeKind: SeoChangeKind.CONTENT,
      title: "Bad cite",
      summary: "Uses hypothesis as truth",
      proposedFields: { body: "claim" },
      citedFactIds: ["hyp-1"],
      fixtureOnly: true,
      createdAtIso: now,
    });
    const gate = evaluateProposalGate({
      proposal: { ...base, status: SeoProposalStatus.APPROVED },
      factLabels: new Map([["hyp-1", SupportLabel.HYPOTHESIS]]),
    });
    expect(gate.allowed).toBe(false);
    expect(gate.code).toBe("PROPOSAL_GATE_FAILED");
  });

  it("binds schema validation to proposal page + payload digest", () => {
    const proposal = {
      ...createSeoProposal({
        proposalId: "c-schema",
        pageAssetId: SEO_PILOT_PAGE_ASSET_ID,
        changeKind: SeoChangeKind.SCHEMA,
        title: "Schema",
        summary: "LocalBusiness",
        proposedFields: { "@type": "LocalBusiness", name: "WorkSocial" },
        citedFactIds: ["fixture-fact-hours"],
        fixtureOnly: true,
        createdAtIso: now,
      }),
      status: SeoProposalStatus.APPROVED,
    };
    const wrongPage = validateSchemaOrg({
      validationId: "c-val-wrong",
      pageAssetId: "page-other",
      proposalId: proposal.proposalId,
      nodes: [
        {
          nodeId: "n1",
          schemaType: "LocalBusiness",
          properties: { name: "WorkSocial" },
          citedFactIds: ["fixture-fact-hours"],
        },
      ],
      visibleContent: SEO_GOLDEN_VISIBLE_CONTENT,
      factLabels: labels,
      fixtureOnly: true,
      createdAtIso: now,
    });
    const blocked = evaluateProposalGate({
      proposal,
      factLabels: labels,
      schemaValidation: wrongPage,
    });
    expect(blocked.allowed).toBe(false);

    const matched = validateSchemaOrg({
      validationId: "c-val-ok",
      pageAssetId: SEO_PILOT_PAGE_ASSET_ID,
      proposalId: proposal.proposalId,
      nodes: [
        {
          nodeId: "n1",
          schemaType: "LocalBusiness",
          properties: { name: "WorkSocial" },
          citedFactIds: ["fixture-fact-hours"],
        },
      ],
      visibleContent: SEO_GOLDEN_VISIBLE_CONTENT,
      factLabels: labels,
      fixtureOnly: true,
      createdAtIso: now,
    });
    expect(matched.payloadDigest).toBe(proposal.schemaPayloadDigest);
    expect(matched.payloadDigest).toBe(
      digestSeoSchemaPayload(SEO_PILOT_PAGE_ASSET_ID, {
        "@type": "LocalBusiness",
        name: "WorkSocial",
      }),
    );
    const ok = evaluateProposalGate({
      proposal,
      factLabels: labels,
      schemaValidation: matched,
    });
    expect(ok.allowed).toBe(true);
  });
});

describe("contract: verified pilot page release path", () => {
  it("requires mapping ownership + read evidence; acceptance ≠ verified until read-back; CMS NOT_WIRED", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-seo-contract-"));
    try {
      const gateway = createActionGateway();
      const svc = createSeoService(createFileSeoStore(dir), { gateway });
      const demo = createDemoPublishGrant(now);

      const unproven = createFixtureSeoPilotMapping(now).state;
      const proven = proveFixtureSeoWritePath(unproven, now);

      const draft = svc.createProposal({
        proposalId: "c-release",
        pageAssetId: SEO_PILOT_PAGE_ASSET_ID,
        changeKind: SeoChangeKind.METADATA,
        title: "Pilot title",
        summary: "Gateway-gated release",
        proposedFields: {
          title: "WorkSocial Jersey City | Day pass coworking & meeting rooms",
        },
        citedFactIds: ["fixture-fact-hours"],
        nowIso: now,
      });
      expect(
        svc.approveProposal({
          proposalId: draft.proposalId,
          factLabels: labels,
          nowIso: now,
        }).ok,
      ).toBe(true);

      const denied = svc.releasePilotPage({
        proposalId: draft.proposalId,
        authority: {
          outboundStopped: false,
          operatingMode: OperatingMode.OPERATE,
          policies: [demo.policy],
          grants: [demo.grant],
        },
        productionMapping: unproven,
        factLabels: labels,
        nowIso: now,
      });
      expect(denied.gatewayDecision?.allowed).toBe(false);
      expect(denied.liveCmsPublishWiring).toBe("NOT_WIRED");
      expect(denied.acceptanceEqualsVerified).toBe(false);

      const draft2 = svc.createProposal({
        proposalId: "c-release-2",
        pageAssetId: SEO_PILOT_PAGE_ASSET_ID,
        changeKind: SeoChangeKind.METADATA,
        title: "Pilot title verified path",
        summary: "Gateway-gated release with evidence",
        proposedFields: {
          title: "WorkSocial Jersey City | Day pass coworking & meeting rooms",
        },
        citedFactIds: ["fixture-fact-hours"],
        nowIso: now,
      });
      expect(
        svc.approveProposal({
          proposalId: draft2.proposalId,
          factLabels: labels,
          nowIso: now,
        }).ok,
      ).toBe(true);

      const pending = svc.releasePilotPage({
        proposalId: draft2.proposalId,
        authority: {
          outboundStopped: false,
          operatingMode: OperatingMode.OPERATE,
          policies: [demo.policy],
          grants: [demo.grant],
        },
        productionMapping: proven,
        factLabels: labels,
        nowIso: now,
      });
      expect(pending.gatewayDecision?.allowed).toBe(true);
      expect(pending.gatewayDecision?.outcome).toBe("ACCEPTED_PENDING");
      expect(pending.proposal?.status).toBe(SeoProposalStatus.RELEASED_PENDING);
      expect(pending.outcome).toBeNull();

      const verified = svc.verifyPilotRelease({
        proposalId: draft2.proposalId,
        observedFields: {
          title: "WorkSocial Jersey City | Day pass coworking & meeting rooms",
        },
        nowIso: now,
      });
      expect(verified.gatewayDecision?.outcome).toBe("VERIFIED");
      expect(verified.proposal?.status).toBe(SeoProposalStatus.VERIFIED);
      expect(verified.outcome?.label).toBe("SUCCESS");
      expect(verified.outcome?.fixtureOnly).toBe(true);
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
