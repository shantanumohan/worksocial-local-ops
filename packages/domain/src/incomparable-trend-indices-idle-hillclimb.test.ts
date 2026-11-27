import { describe, expect, it } from "vitest";
import { SoakProofKind, expectedProofsForFixtureCase, mapProofToFixtureCases } from "./soak-acceptance.js";
import {
  DemandSignalKind,
  compareTrendIndices,
  normalizeTrendComparabilityToken,
} from "./knowledge.js";

const trendBase = {
  kind: DemandSignalKind.TREND,
  rawValue: 20,
  unit: "relative_interest_index",
  sourceSystem: "trends_fixture_a",
  comparabilityGroup: "extract-week-2026-W45",
} as const;

function expectHonesty(result: {
  liveProviderWiring: string;
  externalEffects: string;
}): void {
  expect(result.liveProviderWiring).toBe("NOT_WIRED");
  expect(result.externalEffects).toBe("NONE");
}

describe("incomparable trend indices idle hillclimb (T-X041)", () => {
  it("pins T-X041 proof map and honesty constants", () => {
    expect(expectedProofsForFixtureCase("T-X041")).toEqual([
      SoakProofKind.INCOMPARABLE_TREND_INDICES_REJECTED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.INCOMPARABLE_TREND_INDICES_REJECTED),
    ).toEqual(["T-X041"]);
    expect(normalizeTrendComparabilityToken("  Relative_Interest_Index ")).toBe(
      "relative_interest_index",
    );
    expect(normalizeTrendComparabilityToken("   ")).toBe(null);
    expect(normalizeTrendComparabilityToken(null)).toBe(null);
  });

  it("idle N70: padded group match, case-sensitive group reject, and right-null (T-X041)", () => {
    const paddedGroup = compareTrendIndices(
      {
        ...trendBase,
        comparabilityGroup: "  extract-week-2026-W45  ",
      },
      {
        ...trendBase,
        rawValue: 30,
        comparabilityGroup: "extract-week-2026-W45",
      },
    );
    expect(paddedGroup.kind).toBe("comparable");
    if (paddedGroup.kind === "comparable") {
      expect(paddedGroup.ratio).toBe(1.5);
      expectHonesty(paddedGroup);
    }

    const caseSensitiveGroup = compareTrendIndices(trendBase, {
      ...trendBase,
      rawValue: 40,
      comparabilityGroup: "EXTRACT-WEEK-2026-W45",
    });
    expect(caseSensitiveGroup).toMatchObject({
      kind: "rejected",
      reason: "incomparable_group",
      label: "incomparable",
    });
    expectHonesty(caseSensitiveGroup);

    const rightNull = compareTrendIndices(trendBase, {
      ...trendBase,
      rawValue: null,
    });
    expect(rightNull).toMatchObject({
      kind: "rejected",
      reason: "missing_value",
      label: "invalid",
    });
    expectHonesty(rightNull);

    const whitespaceUnit = compareTrendIndices(trendBase, {
      ...trendBase,
      rawValue: 25,
      unit: "   ",
    });
    expect(whitespaceUnit).toMatchObject({
      kind: "rejected",
      reason: "unit_mismatch",
      label: "incomparable",
    });
    expectHonesty(whitespaceUnit);

    const rightNonTrend = compareTrendIndices(trendBase, {
      ...trendBase,
      kind: DemandSignalKind.FAQ,
      rawValue: 10,
    });
    expect(rightNonTrend).toMatchObject({
      kind: "rejected",
      reason: "non_trend",
      label: "invalid",
    });
    expectHonesty(rightNonTrend);
  });

  it("retip N71: left-null, whitespace source, and one-sided missing group (T-X041)", () => {
    const leftNull = compareTrendIndices(
      { ...trendBase, rawValue: null },
      { ...trendBase, rawValue: 30 },
    );
    expect(leftNull).toMatchObject({
      kind: "rejected",
      reason: "missing_value",
      label: "invalid",
    });
    expectHonesty(leftNull);

    const whitespaceSource = compareTrendIndices(trendBase, {
      ...trendBase,
      rawValue: 24,
      sourceSystem: "   ",
    });
    expect(whitespaceSource).toMatchObject({
      kind: "rejected",
      reason: "source_mismatch",
      label: "incomparable",
    });
    expectHonesty(whitespaceSource);

    const oneSidedGroup = compareTrendIndices(
      { ...trendBase, comparabilityGroup: null },
      { ...trendBase, rawValue: 22 },
    );
    expect(oneSidedGroup).toMatchObject({
      kind: "rejected",
      reason: "missing_comparability_group",
      label: "unlabeled",
    });
    expectHonesty(oneSidedGroup);

    const bothWhitespaceSource = compareTrendIndices(
      { ...trendBase, sourceSystem: "  " },
      { ...trendBase, rawValue: 28, sourceSystem: "\t" },
    );
    expect(bothWhitespaceSource).toMatchObject({
      kind: "rejected",
      reason: "source_mismatch",
      label: "incomparable",
    });
    expectHonesty(bothWhitespaceSource);
  });

  it("wipe15 N72: evidence-refresh train pins negative baseline ratio (T-X041)", () => {
    const negativeLeft = compareTrendIndices(
      { ...trendBase, rawValue: -20 },
      { ...trendBase, rawValue: -10 },
    );
    expect(negativeLeft.kind).toBe("comparable");
    if (negativeLeft.kind === "comparable") {
      expect(negativeLeft.ratio).toBe(0.5);
      expectHonesty(negativeLeft);
    }
  });

  it("retip N73: left non-trend and unity ratio post-#282 (T-X041)", () => {
    const leftFaq = compareTrendIndices(
      { ...trendBase, kind: DemandSignalKind.FAQ, rawValue: 5 },
      trendBase,
    );
    expect(leftFaq).toMatchObject({
      kind: "rejected",
      reason: "non_trend",
      label: "invalid",
    });
    expectHonesty(leftFaq);

    const unity = compareTrendIndices(trendBase, { ...trendBase, rawValue: 20 });
    expect(unity.kind).toBe("comparable");
    if (unity.kind === "comparable") {
      expect(unity.ratio).toBe(1);
      expectHonesty(unity);
    }
  });

  it("retip N74: right-zero ratio and dual unlabeled group (T-X041)", () => {
    const rightZero = compareTrendIndices(trendBase, {
      ...trendBase,
      rawValue: 0,
    });
    expect(rightZero.kind).toBe("comparable");
    if (rightZero.kind === "comparable") {
      expect(rightZero.ratio).toBe(0);
      expectHonesty(rightZero);
    }

    const dualUnlabeled = compareTrendIndices(
      { ...trendBase, comparabilityGroup: null },
      { ...trendBase, rawValue: 15, comparabilityGroup: undefined },
    );
    expect(dualUnlabeled).toMatchObject({
      kind: "rejected",
      reason: "missing_comparability_group",
      label: "unlabeled",
    });
    expectHonesty(dualUnlabeled);
  });

  it("retip N75: zero left baseline and normalized source match (T-X041)", () => {
    const zeroLeft = compareTrendIndices(
      { ...trendBase, rawValue: 0 },
      { ...trendBase, rawValue: 12 },
    );
    expect(zeroLeft).toMatchObject({
      kind: "rejected",
      reason: "zero_baseline",
      label: "invalid",
    });
    expectHonesty(zeroLeft);

    const sourceNorm = compareTrendIndices(trendBase, {
      ...trendBase,
      rawValue: 26,
      sourceSystem: "  TRENDS_FIXTURE_A  ",
    });
    expect(sourceNorm.kind).toBe("comparable");
    if (sourceNorm.kind === "comparable") {
      expect(sourceNorm.ratio).toBeCloseTo(1.3);
      expectHonesty(sourceNorm);
    }
  });

  it("retip N76: null unit on right and incomparable tabbed groups (T-X041)", () => {
    const nullUnitRight = compareTrendIndices(trendBase, {
      ...trendBase,
      rawValue: 18,
      unit: null,
    });
    expect(nullUnitRight).toMatchObject({
      kind: "rejected",
      reason: "unit_mismatch",
      label: "incomparable",
    });
    expectHonesty(nullUnitRight);

    const variantGroupReject = compareTrendIndices(trendBase, {
      ...trendBase,
      rawValue: 21,
      comparabilityGroup: "extract-week-2026-W45-variant",
    });
    expect(variantGroupReject).toMatchObject({
      kind: "rejected",
      reason: "incomparable_group",
      label: "incomparable",
    });
    expectHonesty(variantGroupReject);
  });

  it("retip N77: null left unit and normalized unit comparable (T-X041)", () => {
    const nullUnitLeft = compareTrendIndices(
      { ...trendBase, unit: null },
      { ...trendBase, rawValue: 16 },
    );
    expect(nullUnitLeft).toMatchObject({
      kind: "rejected",
      reason: "unit_mismatch",
      label: "incomparable",
    });
    expectHonesty(nullUnitLeft);

    const unitNorm = compareTrendIndices(
      { ...trendBase, unit: "  RELATIVE_interest_INDEX  " },
      { ...trendBase, rawValue: 30 },
    );
    expect(unitNorm.kind).toBe("comparable");
    if (unitNorm.kind === "comparable") {
      expect(unitNorm.ratio).toBe(1.5);
      expectHonesty(unitNorm);
    }
  });

  it("retip N78: dual missing values and cross-source reject (T-X041)", () => {
    const dualMissing = compareTrendIndices(
      { ...trendBase, rawValue: null },
      { ...trendBase, rawValue: undefined as unknown as null },
    );
    expect(dualMissing).toMatchObject({
      kind: "rejected",
      reason: "missing_value",
      label: "invalid",
    });
    expectHonesty(dualMissing);

    const crossVendor = compareTrendIndices(trendBase, {
      ...trendBase,
      rawValue: 22,
      sourceSystem: "trends_fixture_b",
    });
    expect(crossVendor).toMatchObject({
      kind: "rejected",
      reason: "source_mismatch",
      label: "incomparable",
    });
    expectHonesty(crossVendor);
  });

  it("retip N79: both-side blank groups and stable ratio label (T-X041)", () => {
    const bothBlankGroup = compareTrendIndices(
      { ...trendBase, comparabilityGroup: " \t " },
      { ...trendBase, rawValue: 14, comparabilityGroup: "" },
    );
    expect(bothBlankGroup).toMatchObject({
      kind: "rejected",
      reason: "missing_comparability_group",
      label: "unlabeled",
    });
    expectHonesty(bothBlankGroup);

    const labeledComparable = compareTrendIndices(trendBase, {
      ...trendBase,
      rawValue: 15,
    });
    expect(labeledComparable.kind).toBe("comparable");
    if (labeledComparable.kind === "comparable") {
      expect(labeledComparable.label).toBe("comparable");
      expect(labeledComparable.comparabilityGroup).toBe(
        "extract-week-2026-W45",
      );
      expect(labeledComparable.ratio).toBe(0.75);
      expectHonesty(labeledComparable);
    }
  });

  it("retip N80: mismatched units after normalize and FAQ right reject (T-X041)", () => {
    const unitCaseMismatch = compareTrendIndices(
      { ...trendBase, unit: "relative_interest_index" },
      {
        ...trendBase,
        rawValue: 18,
        unit: "SEARCH_VOLUME",
      },
    );
    expect(unitCaseMismatch).toMatchObject({
      kind: "rejected",
      reason: "unit_mismatch",
      label: "incomparable",
    });
    expectHonesty(unitCaseMismatch);

    const rightFaq = compareTrendIndices(trendBase, {
      ...trendBase,
      kind: DemandSignalKind.FAQ,
      rawValue: 9,
    });
    expect(rightFaq).toMatchObject({
      kind: "rejected",
      reason: "non_trend",
      label: "invalid",
    });
    expectHonesty(rightFaq);
  });

  it("retip N81: high ratio comparable and one-sided group reject (T-X041)", () => {
    const highRatio = compareTrendIndices(
      { ...trendBase, rawValue: 4 },
      { ...trendBase, rawValue: 100 },
    );
    expect(highRatio.kind).toBe("comparable");
    if (highRatio.kind === "comparable") {
      expect(highRatio.ratio).toBe(25);
      expectHonesty(highRatio);
    }

    const rightOnlyGroup = compareTrendIndices(
      { ...trendBase, comparabilityGroup: null },
      { ...trendBase, rawValue: 11 },
    );
    expect(rightOnlyGroup).toMatchObject({
      kind: "rejected",
      reason: "missing_comparability_group",
      label: "unlabeled",
    });
    expectHonesty(rightOnlyGroup);
  });

  it("retip N82: fractional baseline and trimmed group comparable (T-X041)", () => {
    const fractional = compareTrendIndices(
      { ...trendBase, rawValue: 2.5 },
      { ...trendBase, rawValue: 7.5 },
    );
    expect(fractional.kind).toBe("comparable");
    if (fractional.kind === "comparable") {
      expect(fractional.ratio).toBe(3);
      expectHonesty(fractional);
    }

    const trimmedBoth = compareTrendIndices(
      { ...trendBase, comparabilityGroup: "  extract-week-2026-W45\t" },
      { ...trendBase, rawValue: 32, comparabilityGroup: "extract-week-2026-W45" },
    );
    expect(trimmedBoth.kind).toBe("comparable");
    if (trimmedBoth.kind === "comparable") {
      expect(trimmedBoth.ratio).toBeCloseTo(1.6);
      expectHonesty(trimmedBoth);
    }
  });

  it("wipe15 N83: null left source reject and sub-unity ratio (T-X041)", () => {
    const nullSourceLeft = compareTrendIndices(
      { ...trendBase, sourceSystem: null },
      { ...trendBase, rawValue: 24 },
    );
    expect(nullSourceLeft).toMatchObject({
      kind: "rejected",
      reason: "source_mismatch",
      label: "incomparable",
    });
    expectHonesty(nullSourceLeft);

    const subUnity = compareTrendIndices(trendBase, {
      ...trendBase,
      rawValue: 8,
    });
    expect(subUnity.kind).toBe("comparable");
    if (subUnity.kind === "comparable") {
      expect(subUnity.ratio).toBe(0.4);
      expect(subUnity.comparabilityGroup).toBe("extract-week-2026-W45");
      expectHonesty(subUnity);
    }
  });

  it("retip N84: null right source and padded left source comparable (T-X041)", () => {
    const nullSourceRight = compareTrendIndices(trendBase, {
      ...trendBase,
      rawValue: 26,
      sourceSystem: null,
    });
    expect(nullSourceRight).toMatchObject({
      kind: "rejected",
      reason: "source_mismatch",
      label: "incomparable",
    });
    expectHonesty(nullSourceRight);

    const paddedLeftSource = compareTrendIndices(
      { ...trendBase, sourceSystem: "  trends_fixture_a  " },
      { ...trendBase, rawValue: 22 },
    );
    expect(paddedLeftSource.kind).toBe("comparable");
    if (paddedLeftSource.kind === "comparable") {
      expect(paddedLeftSource.ratio).toBe(1.1);
      expectHonesty(paddedLeftSource);
    }
  });

  it("wipe15 N85: dual null sources and padded right source comparable (T-X041)", () => {
    const dualNullSource = compareTrendIndices(
      { ...trendBase, sourceSystem: null },
      { ...trendBase, rawValue: 18, sourceSystem: null },
    );
    expect(dualNullSource).toMatchObject({
      kind: "rejected",
      reason: "source_mismatch",
      label: "incomparable",
    });
    expectHonesty(dualNullSource);

    const paddedRightSource = compareTrendIndices(trendBase, {
      ...trendBase,
      rawValue: 28,
      sourceSystem: "\ttrends_fixture_a\t",
    });
    expect(paddedRightSource.kind).toBe("comparable");
    if (paddedRightSource.kind === "comparable") {
      expect(paddedRightSource.ratio).toBe(1.4);
      expectHonesty(paddedRightSource);
    }
  });

  it("retip N86: empty source token reject and ratio 1.25 (T-X041)", () => {
    const emptySourceLeft = compareTrendIndices(
      { ...trendBase, sourceSystem: "" },
      { ...trendBase, rawValue: 24 },
    );
    expect(emptySourceLeft).toMatchObject({
      kind: "rejected",
      reason: "source_mismatch",
      label: "incomparable",
    });
    expectHonesty(emptySourceLeft);

    const fiveFour = compareTrendIndices(trendBase, {
      ...trendBase,
      rawValue: 25,
    });
    expect(fiveFour.kind).toBe("comparable");
    if (fiveFour.kind === "comparable") {
      expect(fiveFour.ratio).toBe(1.25);
      expectHonesty(fiveFour);
    }
  });

  it("retip N87: empty right source and negative right ratio (T-X041)", () => {
    const emptySourceRight = compareTrendIndices(trendBase, {
      ...trendBase,
      rawValue: 22,
      sourceSystem: "",
    });
    expect(emptySourceRight).toMatchObject({
      kind: "rejected",
      reason: "source_mismatch",
      label: "incomparable",
    });
    expectHonesty(emptySourceRight);

    const negativeRight = compareTrendIndices(trendBase, {
      ...trendBase,
      rawValue: -30,
    });
    expect(negativeRight.kind).toBe("comparable");
    if (negativeRight.kind === "comparable") {
      expect(negativeRight.ratio).toBe(-1.5);
      expectHonesty(negativeRight);
    }
  });

  it("retip N88: negative left ratio and dual blank source (T-X041)", () => {
    const negativeLeft = compareTrendIndices(
      { ...trendBase, rawValue: -10 },
      { ...trendBase, rawValue: 15 },
    );
    expect(negativeLeft.kind).toBe("comparable");
    if (negativeLeft.kind === "comparable") {
      expect(negativeLeft.ratio).toBe(-1.5);
      expectHonesty(negativeLeft);
    }

    const dualBlankSource = compareTrendIndices(
      { ...trendBase, sourceSystem: "" },
      { ...trendBase, rawValue: 18, sourceSystem: "  " },
    );
    expect(dualBlankSource).toMatchObject({
      kind: "rejected",
      reason: "source_mismatch",
      label: "incomparable",
    });
    expectHonesty(dualBlankSource);
  });

  it("wipe15 N89: float ratio and case-normalized source match (T-X041)", () => {
    const floatRatio = compareTrendIndices(
      { ...trendBase, rawValue: 20.5 },
      { ...trendBase, rawValue: 41 },
    );
    expect(floatRatio.kind).toBe("comparable");
    if (floatRatio.kind === "comparable") {
      expect(floatRatio.ratio).toBe(2);
      expectHonesty(floatRatio);
    }

    const caseSourceMatch = compareTrendIndices(
      { ...trendBase, sourceSystem: "TRENDS_FIXTURE_A" },
      { ...trendBase, rawValue: 21 },
    );
    expect(caseSourceMatch.kind).toBe("comparable");
    if (caseSourceMatch.kind === "comparable") {
      expect(caseSourceMatch.ratio).toBe(1.05);
      expectHonesty(caseSourceMatch);
    }
  });

  it("retip N90: padded left unit and dual FAQ reject (T-X041)", () => {
    const paddedLeftUnit = compareTrendIndices(
      { ...trendBase, unit: "\trelative_interest_index\n" },
      { ...trendBase, rawValue: 27 },
    );
    expect(paddedLeftUnit.kind).toBe("comparable");
    if (paddedLeftUnit.kind === "comparable") {
      expect(paddedLeftUnit.ratio).toBe(1.35);
      expectHonesty(paddedLeftUnit);
    }

    const dualFaq = compareTrendIndices(
      { ...trendBase, kind: DemandSignalKind.FAQ, rawValue: 3 },
      { ...trendBase, kind: DemandSignalKind.FAQ, rawValue: 4 },
    );
    expect(dualFaq).toMatchObject({
      kind: "rejected",
      reason: "non_trend",
      label: "invalid",
    });
    expectHonesty(dualFaq);
  });
});