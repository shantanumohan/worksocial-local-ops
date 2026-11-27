/**
 * Fixture proof for T-X068 — Thirty alerts one outage → grouped incident.
 * External effects: NONE. Live wiring NOT_WIRED.
 * Hillclimb: whitespace outageKey collapse, chronological alertIds,
 * uniqueSources, max severity, three-key separation.
 */

import { randomUUID } from "node:crypto";
import {
  AlertSeverity,
  SoakProofKind,
  createProbeAlert,
  groupAlertsIntoIncidents,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-X068 fixture ACCEPTED.
 */
export function proofThirtyAlertsOneOutageGrouped(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;
  const baseMs = Date.parse(nowIso);

  const primaryOutage = "host:local-1";
  const secondaryOutage = "provider:fixture-crm";

  const primaryAlerts = Array.from({ length: 30 }, (_, i) =>
    createProbeAlert({
      alertId: `alert-primary-${String(i + 1).padStart(2, "0")}`,
      // Alternate padded keys — must still collapse to one incident.
      outageKey: i % 2 === 0 ? primaryOutage : `  ${primaryOutage} `,
      source: `probe-role-A19-${(i % 6) + 1}`,
      raisedAtIso: new Date(baseMs + i * 500).toISOString(),
      severity: i === 0 ? AlertSeverity.P0 : AlertSeverity.P1,
      message: `Fixture uptime/TLS probe failure ${i + 1}`,
    }),
  );

  const secondaryAlerts = [
    createProbeAlert({
      alertId: "alert-secondary-01",
      outageKey: secondaryOutage,
      source: "probe-crm-canary",
      raisedAtIso: new Date(baseMs + 20_000).toISOString(),
      severity: AlertSeverity.P2,
      message: "Fixture CRM canary timeout",
    }),
  ];

  const tertiaryOutage = "capability:gsc-fetch";
  const tertiaryAlerts = [
    createProbeAlert({
      alertId: "alert-tertiary-01",
      outageKey: tertiaryOutage,
      source: "probe-gsc",
      raisedAtIso: new Date(baseMs + 25_000).toISOString(),
      severity: AlertSeverity.P3,
      message: "Fixture GSC fetch timeout",
    }),
  ];

  // Deliberately shuffle primary alerts so chronological alertIds cannot
  // pass via insertion-order preservation alone (Codex P2).
  const shuffledPrimary = [
    ...primaryAlerts.slice(10),
    ...primaryAlerts.slice(0, 5).reverse(),
    ...primaryAlerts.slice(5, 10),
  ];
  const allAlerts = [
    ...shuffledPrimary,
    ...secondaryAlerts,
    ...tertiaryAlerts,
  ];
  const incidents = groupAlertsIntoIncidents({
    alerts: allAlerts,
    incidentIdForOutageKey: (k) => `inc-${k.replace(/[^a-z0-9-]/gi, "-")}`,
  });

  if (incidents.length === 3) {
    details.push(
      `32 alerts → ${incidents.length} grouped incidents (not 32); whitespace outageKey collapsed`,
    );
  } else {
    passed = false;
    details.push(`Expected 3 incidents, got ${incidents.length}`);
  }

  const primary = incidents.find((i) => i.outageKey === primaryOutage);
  if (
    primary &&
    primary.alertCount === 30 &&
    primary.alertIds.length === 30 &&
    primary.alertIds.every((id, idx) => id === primaryAlerts[idx]!.alertId) &&
    primary.severity === AlertSeverity.P0 &&
    primary.uniqueSourceCount === 6 &&
    primary.uniqueSources.length === 6 &&
    primary.status === "open" &&
    primary.liveProviderWiring === "NOT_WIRED" &&
    primary.externalEffects === "NONE" &&
    primary.fixtureOnly === true &&
    primary.firstRaisedAtIso === primaryAlerts[0]!.raisedAtIso &&
    primary.lastRaisedAtIso === primaryAlerts[29]!.raisedAtIso
  ) {
    details.push(
      `outageKey=${primaryOutage} → 1 incident alertCount=30 severity=P0 uniqueSourceCount=6 chronological alertIds (shuffled input); liveProviderWiring=NOT_WIRED`,
    );
  } else {
    passed = false;
    details.push(`Primary grouping unexpectedly ${JSON.stringify(primary)}`);
  }

  const secondary = incidents.find((i) => i.outageKey === secondaryOutage);
  if (
    secondary &&
    secondary.alertCount === 1 &&
    secondary.severity === AlertSeverity.P2 &&
    secondary.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      `Distinct outageKey=${secondaryOutage} kept as separate incident alertCount=1`,
    );
  } else {
    passed = false;
    details.push(
      `Secondary grouping unexpectedly ${JSON.stringify(secondary)}`,
    );
  }

  const tertiary = incidents.find((i) => i.outageKey === tertiaryOutage);
  if (
    tertiary &&
    tertiary.alertCount === 1 &&
    tertiary.severity === AlertSeverity.P3 &&
    tertiary.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      `Third outageKey=${tertiaryOutage} kept separate (no silent cross-key merge)`,
    );
  } else {
    passed = false;
    details.push(`Tertiary grouping unexpectedly ${JSON.stringify(tertiary)}`);
  }

  // Negative control: ungrouped fan-out would equal alert count — must not.
  if (incidents.length < allAlerts.length) {
    details.push(
      "Incident count < alert count — no one-alert-one-incident fan-out",
    );
  } else {
    passed = false;
    details.push("Incident fan-out matched alert count (grouping failed)");
  }

  // J28 — ZWSP/BOM-wrapped outageKey must not bypass grouping into parallel incidents.
  const j28Key = "host:j28-edge";
  const j28Alerts = [
    createProbeAlert({
      alertId: "j28-a1",
      outageKey: `\u200b${j28Key}`,
      source: "probe-j28",
      raisedAtIso: new Date(baseMs + 30_000).toISOString(),
      severity: AlertSeverity.P2,
      message: "J28 ZWSP prefix",
    }),
    createProbeAlert({
      alertId: "j28-a2",
      outageKey: j28Key,
      source: "probe-j28",
      raisedAtIso: new Date(baseMs + 30_500).toISOString(),
      severity: AlertSeverity.P1,
      message: "J28 canonical",
    }),
    createProbeAlert({
      alertId: "j28-a3",
      outageKey: `${j28Key}\ufeff`,
      source: "probe-j28-2",
      raisedAtIso: new Date(baseMs + 31_000).toISOString(),
      severity: AlertSeverity.P0,
      message: "J28 BOM suffix",
    }),
  ];
  const j28Incidents = groupAlertsIntoIncidents({
    alerts: j28Alerts,
    incidentIdForOutageKey: (k) => `inc-${k.replace(/[^a-z0-9-]/gi, "-")}`,
  });
  const j28Grouped = j28Incidents.find((i) => i.outageKey === j28Key);
  if (
    j28Incidents.length === 1 &&
    j28Grouped &&
    j28Grouped.alertCount === 3 &&
    j28Grouped.severity === AlertSeverity.P0 &&
    j28Grouped.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "J28: ZWSP/BOM-wrapped outageKey collapsed — no parallel-incident bypass",
    );
  } else {
    passed = false;
    details.push(`J28 grouping unexpectedly ${JSON.stringify(j28Incidents)}`);
  }

  const j29Canonical = secondaryOutage;
  const j29Alerts = [
    createProbeAlert({
      alertId: "j29-a1",
      outageKey: j29Canonical,
      source: "probe-j29",
      raisedAtIso: new Date(baseMs + 32_000).toISOString(),
      severity: AlertSeverity.P2,
      message: "J29 canonical",
    }),
    createProbeAlert({
      alertId: "j29-a2",
      outageKey: `provider:fix\u00adture-crm`,
      source: "probe-j29-2",
      raisedAtIso: new Date(baseMs + 32_500).toISOString(),
      severity: AlertSeverity.P1,
      message: "J29 soft-hyphen split",
    }),
  ];
  const j29Incidents = groupAlertsIntoIncidents({
    alerts: j29Alerts,
    incidentIdForOutageKey: (k) => `inc-${k.replace(/[^a-z0-9-]/gi, "-")}`,
  });
  if (
    j29Incidents.length === 1 &&
    j29Incidents[0]!.outageKey === j29Canonical &&
    j29Incidents[0]!.alertCount === 2 &&
    j29Incidents[0]!.externalEffects === "NONE"
  ) {
    details.push(
      "J29: soft-hyphen outageKey collapsed — no phantom second incident",
    );
  } else {
    passed = false;
    details.push(`J29 grouping unexpectedly ${JSON.stringify(j29Incidents)}`);
  }

  const j30Key = "capability:booking-handoff";
  const j30Alerts = [
    createProbeAlert({
      alertId: "j30-a1",
      outageKey: `\u200e${j30Key}`,
      source: "probe-j30",
      raisedAtIso: new Date(baseMs + 33_000).toISOString(),
      severity: AlertSeverity.P2,
      message: "J30 LTR wrap",
    }),
    createProbeAlert({
      alertId: "j30-a2",
      outageKey: j30Key,
      source: "probe-j30",
      raisedAtIso: new Date(baseMs + 33_500).toISOString(),
      severity: AlertSeverity.P1,
      message: "J30 canonical",
    }),
  ];
  const j30Grouped = groupAlertsIntoIncidents({
    alerts: j30Alerts,
    incidentIdForOutageKey: (k) => `inc-${k.replace(/[^a-z0-9-]/gi, "-")}`,
  });
  const j30CaseSplit = groupAlertsIntoIncidents({
    alerts: [
      createProbeAlert({
        alertId: "j30-c1",
        outageKey: "host:edge-a",
        source: "probe-j30",
        raisedAtIso: new Date(baseMs + 34_000).toISOString(),
        severity: AlertSeverity.P3,
        message: "J30 lower",
      }),
      createProbeAlert({
        alertId: "j30-c2",
        outageKey: "HOST:EDGE-A",
        source: "probe-j30",
        raisedAtIso: new Date(baseMs + 34_500).toISOString(),
        severity: AlertSeverity.P3,
        message: "J30 upper",
      }),
    ],
    incidentIdForOutageKey: (k) => `inc-${k.replace(/[^a-z0-9-]/gi, "-")}`,
  });
  if (
    j30Grouped.length === 1 &&
    j30Grouped[0]!.outageKey === j30Key &&
    j30Grouped[0]!.alertCount === 2 &&
    j30CaseSplit.length === 2
  ) {
    details.push(
      "J30: bidi marks collapsed; case-mutated outageKeys stay separate",
    );
  } else {
    passed = false;
    details.push(
      `J30 grouping unexpectedly grouped=${JSON.stringify(j30Grouped)} case=${JSON.stringify(j30CaseSplit)}`,
    );
  }

  const j31Key = primaryOutage;
  const j31Split = `host:local\u2028-\u20291`;
  const j31Alerts = [
    createProbeAlert({
      alertId: "j31-a1",
      outageKey: j31Split,
      source: "probe-j31",
      raisedAtIso: new Date(baseMs + 35_000).toISOString(),
      severity: AlertSeverity.P2,
      message: "J31 line/para separators",
    }),
    createProbeAlert({
      alertId: "j31-a2",
      outageKey: j31Key,
      source: "probe-j31",
      raisedAtIso: new Date(baseMs + 35_500).toISOString(),
      severity: AlertSeverity.P1,
      message: "J31 canonical",
    }),
  ];
  const j31Incidents = groupAlertsIntoIncidents({
    alerts: j31Alerts,
    incidentIdForOutageKey: (k) => `inc-${k.replace(/[^a-z0-9-]/gi, "-")}`,
  });
  if (
    j31Incidents.length === 1 &&
    j31Incidents[0]!.outageKey === j31Key &&
    j31Incidents[0]!.alertCount === 2
  ) {
    details.push(
      "J31: line/paragraph separator outageKey collapsed — no split incident",
    );
  } else {
    passed = false;
    details.push(`J31 grouping unexpectedly ${JSON.stringify(j31Incidents)}`);
  }

  const j32Key = tertiaryOutage;
  const j32Split = `capability:gsc\u2060-fetch`;
  const j32Alerts = [
    createProbeAlert({
      alertId: "j32-a1",
      outageKey: j32Split,
      source: "probe-j32",
      raisedAtIso: new Date(baseMs + 36_000).toISOString(),
      severity: AlertSeverity.P3,
      message: "J32 word joiner",
    }),
    createProbeAlert({
      alertId: "j32-a2",
      outageKey: j32Key,
      source: "probe-j32",
      raisedAtIso: new Date(baseMs + 36_500).toISOString(),
      severity: AlertSeverity.P2,
      message: "J32 canonical",
    }),
  ];
  const j32Incidents = groupAlertsIntoIncidents({
    alerts: j32Alerts,
    incidentIdForOutageKey: (k) => `inc-${k.replace(/[^a-z0-9-]/gi, "-")}`,
  });
  if (
    j32Incidents.length === 1 &&
    j32Incidents[0]!.outageKey === j32Key &&
    j32Incidents[0]!.alertCount === 2 &&
    j32Incidents[0]!.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "J32: word-joiner outageKey collapsed — no phantom third incident",
    );
  } else {
    passed = false;
    details.push(`J32 grouping unexpectedly ${JSON.stringify(j32Incidents)}`);
  }

  const j33Key = secondaryOutage;
  const j33Split = `provider:\u202ffix\u2007ture-crm`;
  const j33Alerts = [
    createProbeAlert({
      alertId: "j33-a1",
      outageKey: j33Split,
      source: "probe-j33",
      raisedAtIso: new Date(baseMs + 37_000).toISOString(),
      severity: AlertSeverity.P2,
      message: "J33 narrow/figure space",
    }),
    createProbeAlert({
      alertId: "j33-a2",
      outageKey: j33Key,
      source: "probe-j33",
      raisedAtIso: new Date(baseMs + 37_500).toISOString(),
      severity: AlertSeverity.P1,
      message: "J33 canonical",
    }),
  ];
  const j33Incidents = groupAlertsIntoIncidents({
    alerts: j33Alerts,
    incidentIdForOutageKey: (k) => `inc-${k.replace(/[^a-z0-9-]/gi, "-")}`,
  });
  if (
    j33Incidents.length === 1 &&
    j33Incidents[0]!.outageKey === j33Key &&
    j33Incidents[0]!.alertCount === 2 &&
    j33Incidents[0]!.externalEffects === "NONE"
  ) {
    details.push(
      "J33: narrow/figure-space outageKey collapsed — no split incident",
    );
  } else {
    passed = false;
    details.push(`J33 grouping unexpectedly ${JSON.stringify(j33Incidents)}`);
  }

  const j34Key = primaryOutage;
  const j34Split = `host:\u2009local\u200a-1`;
  const j34Alerts = [
    createProbeAlert({
      alertId: "j34-a1",
      outageKey: j34Split,
      source: "probe-j34",
      raisedAtIso: new Date(baseMs + 38_000).toISOString(),
      severity: AlertSeverity.P3,
      message: "J34 thin/hair space",
    }),
    createProbeAlert({
      alertId: "j34-a2",
      outageKey: j34Key,
      source: "probe-j34",
      raisedAtIso: new Date(baseMs + 38_500).toISOString(),
      severity: AlertSeverity.P0,
      message: "J34 canonical",
    }),
  ];
  const j34Incidents = groupAlertsIntoIncidents({
    alerts: j34Alerts,
    incidentIdForOutageKey: (k) => `inc-${k.replace(/[^a-z0-9-]/gi, "-")}`,
  });
  if (
    j34Incidents.length === 1 &&
    j34Incidents[0]!.outageKey === j34Key &&
    j34Incidents[0]!.alertCount === 2
  ) {
    details.push(
      "J34: thin/hair-space outageKey collapsed — no split incident",
    );
  } else {
    passed = false;
    details.push(`J34 grouping unexpectedly ${JSON.stringify(j34Incidents)}`);
  }

  const j35Key = tertiaryOutage;
  const j35Split = `capability:\u2002gsc\u2003-fetch`;
  const j35Alerts = [
    createProbeAlert({
      alertId: "j35-a1",
      outageKey: j35Split,
      source: "probe-j35",
      raisedAtIso: new Date(baseMs + 39_000).toISOString(),
      severity: AlertSeverity.P3,
      message: "J35 en/em space",
    }),
    createProbeAlert({
      alertId: "j35-a2",
      outageKey: j35Key,
      source: "probe-j35",
      raisedAtIso: new Date(baseMs + 39_500).toISOString(),
      severity: AlertSeverity.P2,
      message: "J35 canonical",
    }),
  ];
  const j35Incidents = groupAlertsIntoIncidents({
    alerts: j35Alerts,
    incidentIdForOutageKey: (k) => `inc-${k.replace(/[^a-z0-9-]/gi, "-")}`,
  });
  if (
    j35Incidents.length === 1 &&
    j35Incidents[0]!.outageKey === j35Key &&
    j35Incidents[0]!.alertCount === 2
  ) {
    details.push("J35: en/em-space outageKey collapsed — no split incident");
  } else {
    passed = false;
    details.push(`J35 grouping unexpectedly ${JSON.stringify(j35Incidents)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
  );

  return {
    proofId: `proof-alert-group-${randomUUID()}`,
    kind: SoakProofKind.THIRTY_ALERTS_ONE_OUTAGE_GROUPED,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-tx068-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
