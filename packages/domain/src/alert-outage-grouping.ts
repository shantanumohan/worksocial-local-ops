/**
 * T-X068 — Thirty alerts one outage: Grouped incident.
 *
 * Probe/role alerts that share the same `outageKey` collapse into one
 * grouped incident. A burst of thirty alerts for a single host/provider
 * outage must not open thirty incidents. Distinct outage keys remain
 * separate. Whitespace around outageKey is normalized so accidental
 * padding cannot invent a second incident. Pure domain.
 * External effects: NONE. Live provider wiring: NOT_WIRED.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
 */

export const AlertSeverity = {
  P0: "P0",
  P1: "P1",
  P2: "P2",
  P3: "P3",
} as const;

export type AlertSeverityValue =
  (typeof AlertSeverity)[keyof typeof AlertSeverity];

const SEVERITY_RANK: Record<AlertSeverityValue, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

export type ProbeAlertRecord = {
  alertId: string;
  /** Stable key for the underlying outage (host/provider/capability). */
  outageKey: string;
  /** Probe id, role id, or monitor source that raised the alert. */
  source: string;
  raisedAtIso: string;
  severity: AlertSeverityValue;
  message: string;
  fixtureOnly: true;
};

export type GroupedIncidentRecord = {
  incidentId: string;
  outageKey: string;
  alertIds: string[];
  alertCount: number;
  /** Distinct probe/role sources that contributed (order of first appearance). */
  uniqueSources: string[];
  uniqueSourceCount: number;
  firstRaisedAtIso: string;
  lastRaisedAtIso: string;
  /** Highest severity among member alerts (P0 > P1 > P2 > P3). */
  severity: AlertSeverityValue;
  status: "open";
  liveProviderWiring: "NOT_WIRED";
  externalEffects: "NONE";
  fixtureOnly: true;
};

/** Normalize outage keys so padding cannot invent a parallel incident. */
export function normalizeOutageKey(outageKey: string): string {
  return outageKey.trim();
}

export function createProbeAlert(input: {
  alertId: string;
  outageKey: string;
  source: string;
  raisedAtIso: string;
  severity: AlertSeverityValue;
  message: string;
}): ProbeAlertRecord {
  if (!input.alertId.trim()) {
    throw new Error("alertId is required");
  }
  const outageKey = normalizeOutageKey(input.outageKey);
  if (!outageKey) {
    throw new Error("outageKey is required");
  }
  if (!input.source.trim()) {
    throw new Error("source is required");
  }
  return {
    alertId: input.alertId,
    outageKey,
    source: input.source.trim(),
    raisedAtIso: input.raisedAtIso,
    severity: input.severity,
    message: input.message,
    fixtureOnly: true,
  };
}

function maxSeverity(
  a: AlertSeverityValue,
  b: AlertSeverityValue,
): AlertSeverityValue {
  return SEVERITY_RANK[a] <= SEVERITY_RANK[b] ? a : b;
}

/**
 * Group alerts by normalized outageKey into one open incident per outage.
 * Does not invent incidents for empty input. Never fans one outage into
 * N incidents when N alerts share a key.
 */
export function groupAlertsIntoIncidents(input: {
  alerts: readonly ProbeAlertRecord[];
  /** Deterministic incident id factory per outage key. */
  incidentIdForOutageKey: (outageKey: string) => string;
}): GroupedIncidentRecord[] {
  const byKey = new Map<string, ProbeAlertRecord[]>();
  for (const alert of input.alerts) {
    const key = normalizeOutageKey(alert.outageKey);
    const existing = byKey.get(key);
    if (existing) {
      existing.push({ ...alert, outageKey: key });
    } else {
      byKey.set(key, [{ ...alert, outageKey: key }]);
    }
  }

  const incidents: GroupedIncidentRecord[] = [];
  for (const [outageKey, members] of byKey) {
    const sorted = [...members].sort((a, b) =>
      a.raisedAtIso < b.raisedAtIso
        ? -1
        : a.raisedAtIso > b.raisedAtIso
          ? 1
          : a.alertId.localeCompare(b.alertId),
    );
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    let severity = first.severity;
    const uniqueSources: string[] = [];
    for (const m of sorted) {
      severity = maxSeverity(severity, m.severity);
      if (!uniqueSources.includes(m.source)) {
        uniqueSources.push(m.source);
      }
    }
    incidents.push({
      incidentId: input.incidentIdForOutageKey(outageKey),
      outageKey,
      alertIds: sorted.map((m) => m.alertId),
      alertCount: sorted.length,
      uniqueSources,
      uniqueSourceCount: uniqueSources.length,
      firstRaisedAtIso: first.raisedAtIso,
      lastRaisedAtIso: last.raisedAtIso,
      severity,
      status: "open",
      liveProviderWiring: "NOT_WIRED",
      externalEffects: "NONE",
      fixtureOnly: true,
    });
  }

  return incidents.sort((a, b) => a.outageKey.localeCompare(b.outageKey));
}

export const ALERT_OUTAGE_GROUPING_RELATED_CASE_IDS = ["T-X068"] as const;
