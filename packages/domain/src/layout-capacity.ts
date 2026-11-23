/**
 * Layout-specific capacity filtering (T-X047).
 *
 * A room may advertise different capacities per layout (theater vs classroom
 * vs boardroom). Filtering must use the requested layout's capacity — never
 * the marketing max / mismatched layout — so oversized requests are excluded.
 * Explicit layout with missing capacity fails closed (excluded).
 * Fixture / pure domain only; external effects: NONE.
 */

export const RoomLayout = {
  BOARDROOM: "boardroom",
  CLASSROOM: "classroom",
  THEATER: "theater",
  U_SHAPE: "u_shape",
} as const;

export type RoomLayoutValue = (typeof RoomLayout)[keyof typeof RoomLayout];

export type LayoutCapacities = Partial<Record<RoomLayoutValue, number>>;

const LAYOUT_ALIASES: ReadonlyArray<{
  layout: RoomLayoutValue;
  /** Explicit layout/seating phrase — avoids bare room-name ambiguity. */
  pattern: RegExp;
}> = [
  {
    layout: RoomLayout.BOARDROOM,
    pattern: /\bboard\s*-?\s*room\s+(?:layout|seating|setup|configuration)\b/i,
  },
  {
    layout: RoomLayout.CLASSROOM,
    pattern: /\bclass\s*-?\s*room\s+(?:layout|seating|setup|configuration)\b/i,
  },
  {
    layout: RoomLayout.THEATER,
    pattern: /\btheat(?:er|re)\s+(?:layout|seating|setup|configuration)\b/i,
  },
  {
    layout: RoomLayout.U_SHAPE,
    pattern: /\bu[\s-]?shape\s+(?:layout|seating|setup|configuration)\b/i,
  },
];

export type ParsedLayoutRequest =
  | { status: "none"; layout: null }
  | { status: "ok"; layout: RoomLayoutValue }
  | { status: "ambiguous"; layout: null; matched: RoomLayoutValue[] };

/**
 * Parse an explicit seating-layout phrase from a natural-language query.
 * Bare room names without "layout/seating/setup/configuration" do not count.
 * Multiple distinct layout phrases → ambiguous (caller should clarify).
 */
export function parseRequestedLayout(rawQuery: string): RoomLayoutValue | null {
  const parsed = parseLayoutRequest(rawQuery);
  return parsed.status === "ok" ? parsed.layout : null;
}

export function parseLayoutRequest(rawQuery: string): ParsedLayoutRequest {
  const matched: RoomLayoutValue[] = [];
  for (const { layout, pattern } of LAYOUT_ALIASES) {
    if (pattern.test(rawQuery) && !matched.includes(layout)) {
      matched.push(layout);
    }
  }
  if (matched.length === 0) return { status: "none", layout: null };
  if (matched.length === 1) return { status: "ok", layout: matched[0]! };
  return { status: "ambiguous", layout: null, matched };
}

export type EffectiveLayoutCapacity = {
  capacity: number;
  layoutUsed: RoomLayoutValue | null;
  source: "layout_specific" | "default" | "missing_layout_capacity";
  /**
   * True when a larger default or other layout capacity would overstate
   * eligibility vs the layout-specific (or missing) capacity.
   */
  maxWouldOverstate: boolean;
  /** Explicit layout requested but entry has no capacity for it. */
  missingLayoutCapacity: boolean;
};

function finiteLayoutValues(layoutCapacities: LayoutCapacities): number[] {
  return Object.values(layoutCapacities).filter(
    (n): n is number => typeof n === "number" && Number.isFinite(n),
  );
}

/**
 * Resolve the capacity that applies for a requested layout.
 * When a layout is requested and has a known capacity, that value wins.
 * When a layout is requested but capacity is absent → fail closed (capacity 0).
 */
export function effectiveCapacityForLayout(input: {
  defaultCapacity: number;
  layoutCapacities?: LayoutCapacities | null;
  requestedLayout: RoomLayoutValue | null;
}): EffectiveLayoutCapacity {
  const layoutCapacities = input.layoutCapacities ?? {};
  const values = finiteLayoutValues(layoutCapacities);
  const maxLayout =
    values.length > 0 ? Math.max(...values) : input.defaultCapacity;
  const overstateCeiling = Math.max(maxLayout, input.defaultCapacity);

  if (input.requestedLayout) {
    const layoutCap = layoutCapacities[input.requestedLayout];
    if (typeof layoutCap === "number" && Number.isFinite(layoutCap)) {
      return {
        capacity: layoutCap,
        layoutUsed: input.requestedLayout,
        source: "layout_specific",
        maxWouldOverstate: overstateCeiling > layoutCap,
        missingLayoutCapacity: false,
      };
    }
    return {
      capacity: 0,
      layoutUsed: input.requestedLayout,
      source: "missing_layout_capacity",
      maxWouldOverstate: overstateCeiling > 0,
      missingLayoutCapacity: true,
    };
  }

  return {
    capacity: input.defaultCapacity,
    layoutUsed: null,
    source: "default",
    maxWouldOverstate: false,
    missingLayoutCapacity: false,
  };
}

export type LayoutCapacityFilterResult = {
  allowed: boolean;
  effectiveCapacity: number;
  layoutUsed: RoomLayoutValue | null;
  source: EffectiveLayoutCapacity["source"];
  filterTrace: string;
  /** Counterfactual: default or any other layout max would have allowed. */
  defaultWouldAllowMismatch: boolean;
  missingLayoutCapacity: boolean;
};

/**
 * Filter one inventory entry against people + requested layout.
 * Layout-specific mismatch or missing layout capacity → exclude even when
 * another layout (or default max) would fit.
 */
export function filterByLayoutCapacity(input: {
  entryId: string;
  defaultCapacity: number;
  layoutCapacities?: LayoutCapacities | null;
  requestedLayout: RoomLayoutValue | null;
  people: number;
}): LayoutCapacityFilterResult {
  const effective = effectiveCapacityForLayout({
    defaultCapacity: input.defaultCapacity,
    layoutCapacities: input.layoutCapacities ?? null,
    requestedLayout: input.requestedLayout,
  });
  const allowed = effective.capacity >= input.people;
  const layoutMax = Math.max(
    0,
    ...finiteLayoutValues(input.layoutCapacities ?? {}),
  );
  const counterfactualMax = Math.max(input.defaultCapacity, layoutMax);
  const defaultWouldAllowMismatch =
    !allowed && counterfactualMax >= input.people;

  let filterTrace: string;
  if (effective.missingLayoutCapacity) {
    filterTrace =
      `${input.entryId}: excluded — missing capacity for layout ` +
      `${effective.layoutUsed}` +
      (defaultWouldAllowMismatch
        ? `; default/max ${counterfactualMax} would wrongly allow`
        : "");
  } else if (allowed) {
    filterTrace =
      `${input.entryId}: passed layout capacity ${effective.capacity}` +
      (effective.layoutUsed ? ` (${effective.layoutUsed})` : "") +
      ` for ${input.people} people`;
  } else {
    filterTrace =
      `${input.entryId}: excluded — layout capacity ${effective.capacity}` +
      (effective.layoutUsed ? ` (${effective.layoutUsed})` : "") +
      ` < required ${input.people}` +
      (defaultWouldAllowMismatch
        ? `; default/max ${counterfactualMax} would wrongly allow`
        : "");
  }

  return {
    allowed,
    effectiveCapacity: effective.capacity,
    layoutUsed: effective.layoutUsed,
    source: effective.source,
    filterTrace,
    defaultWouldAllowMismatch,
    missingLayoutCapacity: effective.missingLayoutCapacity,
  };
}

/**
 * Filter an inventory list; returns only entries that satisfy the
 * layout-specific capacity constraint.
 */
export function filterInventoryByLayoutCapacity<
  T extends {
    entryId: string;
    defaultCapacity: number;
    layoutCapacities?: LayoutCapacities | null;
  },
>(input: {
  entries: readonly T[];
  requestedLayout: RoomLayoutValue | null;
  people: number;
}): {
  allowed: T[];
  excluded: Array<T & { filter: LayoutCapacityFilterResult }>;
  traces: string[];
} {
  const allowed: T[] = [];
  const excluded: Array<T & { filter: LayoutCapacityFilterResult }> = [];
  const traces: string[] = [];

  for (const entry of input.entries) {
    const filter = filterByLayoutCapacity({
      entryId: entry.entryId,
      defaultCapacity: entry.defaultCapacity,
      layoutCapacities: entry.layoutCapacities ?? null,
      requestedLayout: input.requestedLayout,
      people: input.people,
    });
    traces.push(filter.filterTrace);
    if (filter.allowed) {
      allowed.push(entry);
    } else {
      excluded.push({ ...entry, filter });
    }
  }

  return { allowed, excluded, traces };
}
