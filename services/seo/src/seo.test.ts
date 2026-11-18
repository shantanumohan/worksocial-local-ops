import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ActionClass,
  LocalRole,
  OperatingMode,
  SchemaValidationVerdict,
  SeoChangeKind,
  SeoProposalStatus,
  SupportLabel,
} from "@worksocial/domain";
import {
  createDemoPublishGrant,
  createFileSeoStore,
} from "@worksocial/persistence";
import { createActionGateway } from "@worksocial/action-gateway";
import { createSeoService } from "./service.js";
import {
  SEO_GOLDEN_VISIBLE_CONTENT,
  SEO_PILOT_PAGE_ASSET_ID,
  createFixtureSeoPilotMapping,
} from "./fixtures.js";

const now = "2026-11-18T16:00:00.000Z";

const labels = new Map<string, (typeof SupportLabel)[keyof typeof SupportLabel]>([
  ["fixture-fact-hours", SupportLabel.SUPPORTED],
  ["fixture-fact-hypothesis", SupportLabel.HYPOTHESIS],
]);

describe("seo service", () => {
  it("seeds golden audits, proposals, and search index without clobbering progressed", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-seo-svc-"));
    try {
      const svc = createSeoService(createFileSeoStore(dir));
      const seed = svc.seedFixtures(now);
      expect(seed.audits.length).toBeGreaterThanOrEqual(3);
      expect(seed.proposals.length).toBeGreaterThanOrEqual(2);
      expect(seed.searchIndexVersion).toBe(1);

      const approved = svc.approveProposal({
        proposalId: "golden-prop-title",
        factLabels: labels,
        nowIso: now,
      });
      expect(approved.ok).toBe(true);

      const reseed = svc.seedFixtures(now);
      expect(reseed.skippedProgressedProposalIds).toContain("golden-prop-title");
      const kept = svc.listProposals().find((p) => p.proposalId === "golden-prop-title");
      expect(kept?.status).toBe(SeoProposalStatus.APPROVED);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("creates proposals as draft only", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-seo-draft-"));
    try {
      const svc = createSeoService(createFileSeoStore(dir));
      const proposal = svc.createProposal({
        pageAssetId: SEO_PILOT_PAGE_ASSET_ID,
        changeKind: SeoChangeKind.METADATA,
        title: "t",
        summary: "s",
        proposedFields: { title: "T" },
        nowIso: now,
      });
      expect(proposal.status).toBe(SeoProposalStatus.DRAFT);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails schema validation when hypothesis facts are cited as truth", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-seo-schema-"));
    try {
      const svc = createSeoService(createFileSeoStore(dir));
      const result = svc.validateSchema({
        pageAssetId: SEO_PILOT_PAGE_ASSET_ID,
        nodes: [
          {
            nodeId: "n1",
            schemaType: "LocalBusiness",
            properties: { name: "WorkSocial" },
            citedFactIds: ["fixture-fact-hypothesis"],
          },
        ],
        visibleContent: SEO_GOLDEN_VISIBLE_CONTENT,
        factLabels: labels,
        nowIso: now,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.validation.verdict).toBe(SchemaValidationVerdict.FAIL);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("runs semantic search against fixture corpus with honest no-match", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-seo-search-"));
    try {
      const svc = createSeoService(createFileSeoStore(dir));
      svc.seedFixtures(now);
      const ok = svc.semanticSearch({
        rawQuery: "Meeting for 8 with a display in Jersey City",
        nowIso: now,
      });
      expect(ok.ok).toBe(true);
      if (ok.ok) {
        expect(ok.result.hits.length).toBeGreaterThan(0);
      }
      const no = svc.semanticSearch({
        rawQuery: "Accessible room with parking",
        nowIso: now,
      });
      expect(no.ok).toBe(true);
      if (no.ok) {
        expect(no.result.hits).toHaveLength(0);
        expect(no.result.noMatchReason).toMatch(/Unsupported/);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("releases via shared gateway; VERIFIED only after matching read-back", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-seo-release-"));
    try {
      const gateway = createActionGateway();
      const svc = createSeoService(createFileSeoStore(dir), { gateway });
      svc.seedFixtures(now);
      const { mapping } = svc.seedAndProveSeoMapping(now);
      const demo = createDemoPublishGrant(now);

      const draft = svc.createProposal({
        proposalId: "prop-release-meta",
        pageAssetId: SEO_PILOT_PAGE_ASSET_ID,
        changeKind: SeoChangeKind.METADATA,
        title: "Title improvement",
        summary: "Supported metadata change",
        proposedFields: {
          title: "WorkSocial Jersey City | Day pass coworking & meeting rooms",
        },
        citedFactIds: ["fixture-fact-hours"],
        nowIso: now,
      });
      const approved = svc.approveProposal({
        proposalId: draft.proposalId,
        factLabels: labels,
        nowIso: now,
      });
      expect(approved.ok).toBe(true);

      const authority = {
        outboundStopped: false,
        operatingMode: OperatingMode.OPERATE,
        policies: [
          {
            ...demo.policy,
            actorRole: LocalRole.ADMINISTRATOR,
            actionClass: ActionClass.ROUTINE_PUBLISH,
          },
        ],
        grants: [demo.grant],
      };

      const pending = svc.releasePilotPage({
        proposalId: draft.proposalId,
        authority,
        productionMapping: mapping,
        factLabels: labels,
        nowIso: now,
      });

      expect(pending.gatewayDecision?.allowed).toBe(true);
      expect(pending.gatewayDecision?.outcome).toBe("ACCEPTED_PENDING");
      expect(pending.proposal?.status).toBe(SeoProposalStatus.RELEASED_PENDING);
      expect(pending.outcome).toBeNull();
      expect(gateway.getDecision(pending.gatewayDecision!.operationId)?.outcome).toBe(
        "ACCEPTED_PENDING",
      );

      const verified = svc.verifyPilotRelease({
        proposalId: draft.proposalId,
        observedFields: {
          title: "WorkSocial Jersey City | Day pass coworking & meeting rooms",
        },
        nowIso: now,
      });
      expect(verified.gatewayDecision?.outcome).toBe("VERIFIED");
      expect(verified.proposal?.status).toBe(SeoProposalStatus.VERIFIED);
      expect(verified.outcome?.label).toBe("SUCCESS");
      expect(verified.outcome?.fixtureOnly).toBe(true);
      expect(svc.listLearningOutcomes(true)).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("denies release without ownership/read evidence", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-seo-deny-"));
    try {
      const svc = createSeoService(createFileSeoStore(dir));
      const demo = createDemoPublishGrant(now);
      const mapping = createFixtureSeoPilotMapping(now).state;

      const draft = svc.createProposal({
        proposalId: "prop-deny",
        pageAssetId: SEO_PILOT_PAGE_ASSET_ID,
        changeKind: SeoChangeKind.METADATA,
        title: "Blocked",
        summary: "No evidence",
        proposedFields: { title: "x" },
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
        productionMapping: mapping,
        factLabels: labels,
        nowIso: now,
      });

      expect(denied.gatewayDecision?.allowed).toBe(false);
      expect(denied.proposal?.status).toBe(SeoProposalStatus.FAILED);
      expect(denied.outcome?.label).toBe("FAILURE");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
