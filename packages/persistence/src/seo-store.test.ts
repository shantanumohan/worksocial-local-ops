import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AuditDimension,
  AuditSeverity,
  createPageAudit,
  createSeoProposal,
  emptySeoState,
  SchemaValidationVerdict,
  SeoChangeKind,
} from "@worksocial/domain";
import { createFileSeoStore } from "./seo-store.js";

const now = "2026-11-18T15:30:00.000Z";

describe("seo file store", () => {
  it("backfills honesty fields on legacy schema validations", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-seo-legacy-"));
    try {
      const seoDir = join(dir, "seo");
      mkdirSync(seoDir, { recursive: true });
      const legacy = emptySeoState(now);
      // Simulate pre-hillclimb persisted validation missing honesty fields.
      const withoutHonesty = {
        validationId: "val-legacy",
        pageAssetId: "page-home",
        proposalId: null,
        nodes: [],
        payloadDigest: "digest",
        verdict: SchemaValidationVerdict.PASS,
        issues: [],
        agreesWithVisibleContent: true,
        fixtureOnly: true,
        createdAtIso: now,
      };
      writeFileSync(
        join(seoDir, "seo-state.json"),
        JSON.stringify(
          {
            ...legacy,
            schemaValidations: [withoutHonesty],
          },
          null,
          2,
        ),
        "utf8",
      );
      const store = createFileSeoStore(dir);
      const [v] = store.listSchemaValidations();
      expect(v?.externalEffects).toBe("NONE");
      expect(v?.liveProviderWiring).toBe("NOT_WIRED");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("persists audits and proposals", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-seo-store-"));
    try {
      const store = createFileSeoStore(dir);
      const audit = createPageAudit({
        pageAuditId: "a1",
        pageAssetId: "page-home",
        siteId: "site",
        pagePath: "/",
        displayName: "Home",
        findings: [
          {
            findingId: "f1",
            dimension: AuditDimension.METADATA,
            severity: AuditSeverity.WARNING,
            code: "TITLE_SHORT",
            message: "Title is short",
            relatedFactId: null,
          },
        ],
        fixtureOnly: true,
        createdAtIso: now,
      });
      store.upsertAudit(audit);
      const proposal = createSeoProposal({
        proposalId: "p1",
        pageAssetId: "page-home",
        pageAuditId: "a1",
        changeKind: SeoChangeKind.METADATA,
        title: "Lengthen title",
        summary: "Improve SERP title",
        proposedFields: { title: "WorkSocial Jersey City coworking" },
        fixtureOnly: true,
        createdAtIso: now,
      });
      store.upsertProposal(proposal);

      const status = store.status();
      expect(status.auditCount).toBe(1);
      expect(status.proposalCount).toBe(1);
      expect(status.liveCmsPublishWiring).toBe("NOT_WIRED");
      expect(store.listAudits()[0]?.pageAuditId).toBe("a1");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
