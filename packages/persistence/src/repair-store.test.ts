import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  IncidentSeverity,
  RepairClass,
  createIncident,
  createRepairTicket,
} from "@worksocial/domain";
import { createFileRepairStore } from "./repair-store.js";

const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

describe("repair store", () => {
  it("persists incidents and tickets; live CMS stays NOT_WIRED", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-repair-store-"));
    dirs.push(dir);
    const store = createFileRepairStore(dir);
    const now = "2026-11-20T04:00:00.000Z";
    const incident = createIncident({
      incidentId: "inc-1",
      title: "Broken CTA",
      summary: "href dead",
      severity: IncidentSeverity.P2,
      assetId: "page-home-cta",
      siteId: "worksocial-pilot",
      failingProbeId: "probe-cta",
      businessImpact: "lost clicks",
      fixtureOnly: true,
      createdAtIso: now,
    });
    store.upsertIncident(incident);
    store.upsertTicket(
      createRepairTicket({
        ticketId: "tkt-1",
        incident,
        repairClass: RepairClass.RESTORE_CTA,
        worktreeRef: "worktrees/tkt-1",
        sourceRevision: "rev-1",
        fixtureOnly: true,
        createdAtIso: now,
      }),
    );
    const again = createFileRepairStore(dir);
    expect(again.read().incidents).toHaveLength(1);
    expect(again.read().tickets).toHaveLength(1);
    expect(again.status().liveCmsRepairWiring).toBe("NOT_WIRED");
  });
});
