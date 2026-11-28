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

  it("collapses ZWSP- and BOM-wrapped outageKey into one incident (T-X068 J28)", () => {
    const key = "host:local-1";
    expect(normalizeOutageKey(`\u200b${key}\u200b`)).toBe(key);
    expect(normalizeOutageKey(`\ufeff${key}`)).toBe(key);
    const alerts = [
      alertAt(1, `\u200b${key}`, 0),
      alertAt(2, key, 1000),
      alertAt(3, `${key}\ufeff`, 2000, AlertSeverity.P0),
    ];
    const incidents = groupAlertsIntoIncidents({
      alerts,
      incidentIdForOutageKey: (k) => `inc-${k}`,
    });
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.outageKey).toBe(key);
    expect(incidents[0]!.alertCount).toBe(3);
    expect(incidents[0]!.severity).toBe(AlertSeverity.P0);
    expect(incidents[0]!.externalEffects).toBe("NONE");
  });

  it("collapses soft-hyphen-split outageKey into one incident (T-X068 J29)", () => {
    const canonical = "provider:fixture-crm";
    const withHyphen = `provider:fix\u00adture-crm`;
    expect(normalizeOutageKey(withHyphen)).toBe(canonical);
    const alerts = [
      alertAt(1, canonical, 0),
      alertAt(2, withHyphen, 1000, AlertSeverity.P2),
    ];
    const incidents = groupAlertsIntoIncidents({
      alerts,
      incidentIdForOutageKey: (k) => `inc-${k}`,
    });
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.outageKey).toBe(canonical);
    expect(incidents[0]!.alertCount).toBe(2);
  });

  it("collapses bidi-mark-wrapped outageKey into one incident (T-X068 J30)", () => {
    const key = "host:local-1";
    expect(normalizeOutageKey(`\u200e${key}\u200f`)).toBe(key);
    const alerts = [
      alertAt(1, `\u200e${key}`, 0),
      alertAt(2, key, 1000),
    ];
    const incidents = groupAlertsIntoIncidents({
      alerts,
      incidentIdForOutageKey: (k) => `inc-${k}`,
    });
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.alertCount).toBe(2);
  });

  it("collapses line/paragraph separator splits in outageKey (T-X068 J31)", () => {
    const key = "host:local-1";
    const split = `host:local\u2028-\u20291`;
    expect(normalizeOutageKey(split)).toBe(key);
    const alerts = [
      alertAt(1, split, 0),
      alertAt(2, key, 1000),
    ];
    const incidents = groupAlertsIntoIncidents({
      alerts,
      incidentIdForOutageKey: (k) => `inc-${k}`,
    });
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.outageKey).toBe(key);
    expect(incidents[0]!.alertCount).toBe(2);
  });

  it("collapses word-joiner split outageKey into one incident (T-X068 J32)", () => {
    const key = "capability:gsc-fetch";
    const split = `capability:gsc\u2060-fetch`;
    expect(normalizeOutageKey(split)).toBe(key);
    const alerts = [
      alertAt(1, split, 0),
      alertAt(2, key, 1000, AlertSeverity.P0),
    ];
    const incidents = groupAlertsIntoIncidents({
      alerts,
      incidentIdForOutageKey: (k) => `inc-${k}`,
    });
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.outageKey).toBe(key);
    expect(incidents[0]!.severity).toBe(AlertSeverity.P0);
  });

  it("collapses narrow/figure space splits in outageKey (T-X068 J33)", () => {
    const key = "provider:fixture-crm";
    const split = `provider:\u202ffix\u2007ture-crm`;
    expect(normalizeOutageKey(split)).toBe(key);
    const alerts = [
      alertAt(1, split, 0),
      alertAt(2, key, 1000),
    ];
    const incidents = groupAlertsIntoIncidents({
      alerts,
      incidentIdForOutageKey: (k) => `inc-${k}`,
    });
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.outageKey).toBe(key);
    expect(incidents[0]!.alertCount).toBe(2);
  });

  it("collapses thin/hair/math space splits in outageKey (T-X068 J34)", () => {
    const key = "host:local-1";
    const split = `host:\u2009local\u200a-1`;
    expect(normalizeOutageKey(split)).toBe(key);
    const split2 = `ho\u205fst:local-1`;
    expect(normalizeOutageKey(split2)).toBe(key);
    const alerts = [
      alertAt(1, split, 0),
      alertAt(2, key, 1000, AlertSeverity.P0),
    ];
    const incidents = groupAlertsIntoIncidents({
      alerts,
      incidentIdForOutageKey: (k) => `inc-${k}`,
    });
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.outageKey).toBe(key);
    expect(incidents[0]!.severity).toBe(AlertSeverity.P0);
  });

  it("collapses en/em/ideographic space splits in outageKey (T-X068 J35)", () => {
    const key = "capability:gsc-fetch";
    const split = `capability:\u2002gsc\u2003-fetch`;
    expect(normalizeOutageKey(split)).toBe(key);
    const split2 = `capability:\u3000gsc-fetch`;
    expect(normalizeOutageKey(split2)).toBe(key);
    const alerts = [
      alertAt(1, split, 0),
      alertAt(2, key, 1000, AlertSeverity.P1),
    ];
    const incidents = groupAlertsIntoIncidents({
      alerts,
      incidentIdForOutageKey: (k) => `inc-${k}`,
    });
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.outageKey).toBe(key);
  });

  it("collapses four-per-em/punctuation space splits (T-X068 J36)", () => {
    const key = "provider:fixture-crm";
    const split = `provider:\u2005fix\u2008ture-crm`;
    expect(normalizeOutageKey(split)).toBe(key);
    const split2 = `pro\u2006vider:fixture-crm`;
    expect(normalizeOutageKey(split2)).toBe(key);
    const alerts = [
      alertAt(1, split, 0),
      alertAt(2, key, 1000),
    ];
    const incidents = groupAlertsIntoIncidents({
      alerts,
      incidentIdForOutageKey: (k) => `inc-${k}`,
    });
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.outageKey).toBe(key);
  });

  it("collapses invisible math-operator splits in outageKey (T-X068 J37)", () => {
    const key = "host:local-1";
    const split = `host:lo\u2063cal\u2064-1`;
    expect(normalizeOutageKey(split)).toBe(key);
    const split2 = `host:\u2062local-1`;
    expect(normalizeOutageKey(split2)).toBe(key);
    const alerts = [
      alertAt(1, split, 0),
      alertAt(2, key, 1000, AlertSeverity.P0),
    ];
    const incidents = groupAlertsIntoIncidents({
      alerts,
      incidentIdForOutageKey: (k) => `inc-${k}`,
    });
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.outageKey).toBe(key);
    expect(incidents[0]!.severity).toBe(AlertSeverity.P0);
  });

  it("collapses vertical-tab/CR/next-line splits (T-X068 J38)", () => {
    const key = "host:local-1";
    const split = `host:local\u000b-1`;
    expect(normalizeOutageKey(split)).toBe(key);
    const split2 = `host:\u000dlocal-1`;
    expect(normalizeOutageKey(split2)).toBe(key);
    const alerts = [
      alertAt(1, split, 0),
      alertAt(2, key, 1000),
    ];
    const incidents = groupAlertsIntoIncidents({
      alerts,
      incidentIdForOutageKey: (k) => `inc-${k}`,
    });
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.outageKey).toBe(key);
  });

  it("collapses en-quad/em-quad/three-per-em splits (T-X068 J39)", () => {
    const key = "provider:fixture-crm";
    const split = `provider:\u2000fix\u2001ture-crm`;
    expect(normalizeOutageKey(split)).toBe(key);
    const split2 = `pro\u2004vider:fixture-crm`;
    expect(normalizeOutageKey(split2)).toBe(key);
    const alerts = [
      alertAt(1, split, 0),
      alertAt(2, key, 1000, AlertSeverity.P0),
    ];
    const incidents = groupAlertsIntoIncidents({
      alerts,
      incidentIdForOutageKey: (k) => `inc-${k}`,
    });
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.outageKey).toBe(key);
    expect(incidents[0]!.severity).toBe(AlertSeverity.P0);
    expect(incidents[0]!.externalEffects).toBe("NONE");
  });

  it("collapses ogham/MVS/function-application splits (T-X068 J40)", () => {
    const key = "capability:gsc-fetch";
    const split = `capability:\u1680gsc\u180e-fetch`;
    expect(normalizeOutageKey(split)).toBe(key);
    const split2 = `capability:gsc\u2061-fetch`;
    expect(normalizeOutageKey(split2)).toBe(key);
    const alerts = [
      alertAt(1, split, 0),
      alertAt(2, key, 1000),
    ];
    const incidents = groupAlertsIntoIncidents({
      alerts,
      incidentIdForOutageKey: (k) => `inc-${k}`,
    });
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.outageKey).toBe(key);
    expect(incidents[0]!.alertCount).toBe(2);
    expect(incidents[0]!.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("collapses bidi embedding/override splits (T-X068 J41)", () => {
    const key = "host:local-1";
    const split = `host:\u202elocal\u202c-1`;
    expect(normalizeOutageKey(split)).toBe(key);
    const split2 = `\u202a${key}\u202b`;
    expect(normalizeOutageKey(split2)).toBe(key);
    const alerts = [
      alertAt(1, split, 0),
      alertAt(2, key, 1000, AlertSeverity.P0),
    ];
    const incidents = groupAlertsIntoIncidents({
      alerts,
      incidentIdForOutageKey: (k) => `inc-${k}`,
    });
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.outageKey).toBe(key);
    expect(incidents[0]!.severity).toBe(AlertSeverity.P0);
    expect(incidents[0]!.externalEffects).toBe("NONE");
  });

  it("collapses bidi format-character splits (T-X068 J43)", () => {
    const key = "host:local-1";
    const split = `host:\u206alocal\u206b-1`;
    expect(normalizeOutageKey(split)).toBe(key);
    const split2 = `host:lo\u206ccal\u206d-1`;
    expect(normalizeOutageKey(split2)).toBe(key);
    const split3 = `\u206e${key}\u206f`;
    expect(normalizeOutageKey(split3)).toBe(key);
    const alerts = [
      alertAt(1, split, 0),
      alertAt(2, key, 1000, AlertSeverity.P0),
    ];
    const incidents = groupAlertsIntoIncidents({
      alerts,
      incidentIdForOutageKey: (k) => `inc-${k}`,
    });
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.outageKey).toBe(key);
    expect(incidents[0]!.severity).toBe(AlertSeverity.P0);
  });

  it("re-trims after invisible strip when padding was masked (T-X068 J45)", () => {
    const key = "host:local-1";
    const split = `\u206a ${key} `;
    expect(normalizeOutageKey(split)).toBe(key);
    const split2 = `  \u206f${key}\u200b  `;
    expect(normalizeOutageKey(split2)).toBe(key);
    const alerts = [
      alertAt(1, split, 0),
      alertAt(2, key, 1000),
    ];
    const incidents = groupAlertsIntoIncidents({
      alerts,
      incidentIdForOutageKey: (k) => `inc-${k}`,
    });
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.outageKey).toBe(key);
  });

  it("collapses hangul filler splits in outageKey (T-X068 J44)", () => {
    const key = "capability:gsc-fetch";
    const split = `capability:\u115fgsc\u1160-fetch`;
    expect(normalizeOutageKey(split)).toBe(key);
    const split2 = `\u3164${key}`;
    expect(normalizeOutageKey(split2)).toBe(key);
    const alerts = [
      alertAt(1, split, 0),
      alertAt(2, key, 1000),
    ];
    const incidents = groupAlertsIntoIncidents({
      alerts,
      incidentIdForOutageKey: (k) => `inc-${k}`,
    });
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.outageKey).toBe(key);
    expect(incidents[0]!.externalEffects).toBe("NONE");
  });

  it("collapses bidi isolate splits in outageKey (T-X068 J42)", () => {
    const key = "provider:fixture-crm";
    const split = `provider:\u2066fix\u2069ture-crm`;
    expect(normalizeOutageKey(split)).toBe(key);
    const split2 = `\u2067${key}\u2068`;
    expect(normalizeOutageKey(split2)).toBe(key);
    const alerts = [
      alertAt(1, split, 0),
      alertAt(2, key, 1000),
    ];
    const incidents = groupAlertsIntoIncidents({
      alerts,
      incidentIdForOutageKey: (k) => `inc-${k}`,
    });
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.outageKey).toBe(key);
    expect(incidents[0]!.alertCount).toBe(2);
    expect(incidents[0]!.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("does not case-fold distinct outageKeys into one incident (T-X068 J30)", () => {
    const alerts = [
      alertAt(1, "host:local-1", 0),
      alertAt(2, "HOST:LOCAL-1", 1000),
    ];
    const incidents = groupAlertsIntoIncidents({
      alerts,
      incidentIdForOutageKey: (k) => `inc-${k}`,
    });
    expect(incidents).toHaveLength(2);
    expect(incidents[0]!.alertCount).toBe(1);
    expect(incidents[1]!.alertCount).toBe(1);
  });

  it("refuses invisible-only outageKey after normalize (T-X068 J28)", () => {
    expect(() =>
      createProbeAlert({
        alertId: "a1",
        outageKey: "\u200b\u200b",
        source: "probe",
        raisedAtIso: now,
        severity: AlertSeverity.P1,
        message: "x",
      }),
    ).toThrow(/outageKey/);
  });
});
