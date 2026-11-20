import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AuditDimension,
  AuditSeverity,
  createPageAudit,
  createSeoProposal,
  SeoChangeKind,
} from "@worksocial/domain";
import { createFileSeoStore } from "./seo-store.js";

const now = "2026-11-18T15:30:00.000Z";

describe("seo file store", () => {
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
