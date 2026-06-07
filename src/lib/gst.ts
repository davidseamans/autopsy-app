// GST treatment helpers for Stage 1 cost + invoice handling.
//
// Core rule: gross margin must be calculated from ex-GST revenue and ex-GST
// direct costs only. GST is a tax/reporting component, never business margin.
//
// Standard Australian GST on a GST-inclusive amount = amount / 11.

export type GstTreatment = "gst_included" | "gst_free" | "no_gst" | "manual";

export const GST_TREATMENTS: { value: GstTreatment; label: string }[] = [
  { value: "gst_included", label: "GST included (1/11)" },
  { value: "gst_free", label: "GST free" },
  { value: "no_gst", label: "No GST" },
  { value: "manual", label: "Manual GST" },
];

export interface GstSplit {
  /** GST-inclusive total as entered. */
  inclusive: number;
  /** GST component. */
  gst: number;
  /** Ex-GST amount used for margin. */
  exGst: number;
  /** Whether GST was manually overridden away from the auto value. */
  overridden: boolean;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Auto GST for a GST-inclusive amount under the given treatment. */
export function autoGst(inclusive: number, treatment: GstTreatment): number {
  if (!inclusive || inclusive <= 0) return 0;
  switch (treatment) {
    case "gst_included":
      return round2(inclusive / 11);
    case "gst_free":
    case "no_gst":
      return 0;
    case "manual":
      return 0; // caller supplies the manual amount
  }
}

/**
 * Split a GST-inclusive amount into GST + ex-GST.
 *
 * 1. User enters a GST-inclusive total.
 * 2. GST auto-calculates as 1/11 (for gst_included).
 * 3. Ex-GST = total - GST.
 * 4. User may overwrite GST (overridden / manual treatment).
 * 5. If GST is overwritten, ex-GST recalculates from the override.
 */
export function computeGstSplit(opts: {
  inclusive?: number | null;
  treatment?: GstTreatment | null;
  gstOverride?: number | null;
  overridden?: boolean | null;
}): GstSplit {
  const inclusive = Number(opts.inclusive ?? 0) || 0;
  const treatment = opts.treatment ?? "gst_included";
  const isOverride = !!opts.overridden || treatment === "manual";

  let gst: number;
  if (isOverride) {
    gst = Number(opts.gstOverride ?? 0) || 0;
  } else {
    gst = autoGst(inclusive, treatment);
  }
  // GST can never exceed the inclusive total or be negative.
  gst = Math.min(Math.max(gst, 0), Math.max(inclusive, 0));

  return {
    inclusive: round2(inclusive),
    gst: round2(gst),
    exGst: round2(inclusive - gst),
    overridden: isOverride,
  };
}

export const fmtMoney2 = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });