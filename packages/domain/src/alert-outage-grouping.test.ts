import { describe, expect, it } from "vitest";
import {
  AlertSeverity,
  createProbeAlert,
  groupAlertsIntoIncidents,
  normalizeOutageKey,
} from "./alert-outage-grouping.js";

const now = "2026-11-22T18:00:00.000Z";

function alertAt(
  n: number,
  outageKey: string,
  offsetMs: number,
  severity: (typeof AlertSeverity)[keyof typeof AlertSeverity] = AlertSeverity.P1,
  source?: string,
) {
  return createProbeAlert({
    alertId: `alert-${String(n).padStart(2, "0")}`,
    outageKey,
    source: source ?? `probe-${n % 5}`,
    raisedAtIso: new Date(Date.parse(now) + offsetMs).toISOString(),
    severity,
    message: `Fixture probe failure ${n}`,
  });
}

describe("alert outage grouping (T-X068)", () => {
  it("collapses thirty alerts for one outage into a single incident", () => {
    const alerts = Array.from({ length: 30 }, (_, i) =>
      alertAt(i + 1, "host:local-1", i * 1000),
    );
    const incidents = groupAlertsIntoIncidents({
      alerts,
      incidentIdForOutageKey: (k) => `inc-${k}`,
    });
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.outageKey).toBe("host:local-1");
    expect(incidents[0]!.alertCount).toBe(30);
    expect(incidents[0]!.alertIds).toHaveLength(30);
    expect(incidents[0]!.alertIds).toEqual(
      alerts.map((a) => a.alertId),
    );
    expect(incidents[0]!.uniqueSourceCount).toBeGreaterThan(1);
    expect(incidents[0]!.status).toBe("open");
    expect(incidents[0]!.liveProviderWiring).toBe("NOT_WIRED");
    expect(incidents[0]!.externalEffects).toBe("NONE");
    expect(incidents[0]!.firstRaisedAtIso).toBe(alerts[0]!.raisedAtIso);
    expect(incidents[0]!.lastRaisedAtIso).toBe(alerts[29]!.raisedAtIso);
  });

  it("emits chronological alertIds even when input arrives out of order", () => {
    const chronological = Array.from({ length: 10 }, (_, i) =>
      alertAt(i + 1, "host:local-1", i * 1000),
    );
    const shuffled = [
      ...chronological.slice(5),
      ...chronological.slice(0, 5).reverse(),
    ];
    const incidents = groupAlertsIntoIncidents({
      alerts: shuffled,
      incidentIdForOutageKey: (k) => `inc-${k}`,
    });
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.alertIds).toEqual(
      chronological.map((a) => a.alertId),
    );
    expect(incidents[0]!.firstRaisedAtIso).toBe(
      chronological[0]!.raisedAtIso,
    );
    expect(incidents[0]!.lastRaisedAtIso).toBe(
      chronological[9]!.raisedAtIso,
    );
  });

  it("keeps distinct outage keys as separate incidents", () => {
    const alerts = [
      ...Array.from({ length: 30 }, (_, i) =>
        alertAt(i + 1, "host:local-1", i * 1000),
      ),
      alertAt(31, "provider:zoho", 31_000, AlertSeverity.P0),
      alertAt(32, "provider:zoho", 32_000, AlertSeverity.P2),
    ];
    const incidents = groupAlertsIntoIncidents({
      alerts,
      incidentIdForOutageKey: (k) => `inc-${k}`,
    });
    expect(incidents).toHaveLength(2);
    const host = incidents.find((i) => i.outageKey === "host:local-1");
    const zoho = incidents.find((i) => i.outageKey === "provider:zoho");
    expect(host?.alertCount).toBe(30);
    expect(zoho?.alertCount).toBe(2);
    expect(zoho?.severity).toBe(AlertSeverity.P0);
    expect(zoho?.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("collapses whitespace-padded outageKey variants into one incident", () => {
    expect(normalizeOutageKey("  host:local-1 ")).toBe("host:local-1");
    const alerts = [
      alertAt(1, "host:local-1", 0),
      alertAt(2, "  host:local-1", 1000),
      alertAt(3, "host:local-1  ", 2000, AlertSeverity.P0),
    ];
    const incidents = groupAlertsIntoIncidents({
      alerts,
      incidentIdForOutageKey: (k) => `inc-${k}`,
    });
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.outageKey).toBe("host:local-1");
    expect(incidents[0]!.alertCount).toBe(3);
    expect(incidents[0]!.severity).toBe(AlertSeverity.P0);
  });

  it("takes max severity across mixed alerts in one outage", () => {
    const alerts = [
      alertAt(1, "host:edge", 0, AlertSeverity.P3),
      alertAt(2, "host:edge", 1000, AlertSeverity.P2),
      alertAt(3, "host:edge", 2000, AlertSeverity.P0),
      alertAt(4, "host:edge", 3000, AlertSeverity.P1),
    ];
    const incidents = groupAlertsIntoIncidents({
      alerts,
      incidentIdForOutageKey: (k) => `inc-${k}`,
    });
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.severity).toBe(AlertSeverity.P0);
    expect(incidents[0]!.uniqueSources).toEqual([
      "probe-1",
      "probe-2",
      "probe-3",
      "probe-4",
    ]);
  });

  it("keeps three distinct outage keys as three incidents (no silent merge)", () => {
    const alerts = [
      alertAt(1, "host:a", 0),
      alertAt(2, "host:b", 1000),
      alertAt(3, "host:c", 2000),
      alertAt(4, "host:a", 3000),
    ];
    const incidents = groupAlertsIntoIncidents({
      alerts,
      incidentIdForOutageKey: (k) => `inc-${k}`,
    });
    expect(incidents.map((i) => i.outageKey)).toEqual([
      "host:a",
      "host:b",
      "host:c",
    ]);
    expect(incidents.find((i) => i.outageKey === "host:a")?.alertCount).toBe(2);
  });

  it("returns no incidents for empty alerts", () => {
    expect(
      groupAlertsIntoIncidents({
        alerts: [],
        incidentIdForOutageKey: (k) => `inc-${k}`,
      }),
    ).toEqual([]);
  });

  it("refuses blank outageKey", () => {
    expect(() =>
      createProbeAlert({
        alertId: "a1",
        outageKey: "   ",
        source: "probe",
        raisedAtIso: now,
        severity: AlertSeverity.P1,
        message: "x",
      }),
    ).toThrow(/outageKey/);
  });
});
