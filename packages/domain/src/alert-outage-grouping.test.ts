import { describe, expect, it } from "vitest";
import {
  AlertSeverity,
  createProbeAlert,
  groupAlertsIntoIncidents,
} from "./alert-outage-grouping.js";

const now = "2026-11-22T18:00:00.000Z";

function alertAt(
  n: number,
  outageKey: string,
  offsetMs: number,
  severity: (typeof AlertSeverity)[keyof typeof AlertSeverity] = AlertSeverity.P1,
) {
  return createProbeAlert({
    alertId: `alert-${String(n).padStart(2, "0")}`,
    outageKey,
    source: `probe-${n % 5}`,
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
    expect(incidents[0]!.status).toBe("open");
    expect(incidents[0]!.externalEffects).toBe("NONE");
    expect(incidents[0]!.firstRaisedAtIso).toBe(alerts[0]!.raisedAtIso);
    expect(incidents[0]!.lastRaisedAtIso).toBe(alerts[29]!.raisedAtIso);
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
  });

  it("returns no incidents for empty alerts", () => {
    expect(
      groupAlertsIntoIncidents({
        alerts: [],
        incidentIdForOutageKey: (k) => `inc-${k}`,
      }),
    ).toEqual([]);
  });
});
