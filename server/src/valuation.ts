/**
 * U TRUST Standardized Valuation Engine
 * --------------------------------------
 * Produces a uniform Suggested Purchase Price and a Retail band
 * (min / recommended / max negotiation limit) from inspection inputs.
 *
 * The entire model is driven by a config object stored in `valuation_config`
 * so the Super Admin can re-tune it without code changes.
 *
 * Pricing logic (transparent, dealership-grade):
 *   1. base_value  = brand benchmark for the model (admin maintained) OR a
 *                    derived figure from registration year when no benchmark.
 *   2. age_factor  = depreciate base by `annual_depreciation` per year, floored.
 *   3. km_factor   = penalty for usage above an expected km/year band.
 *   4. condition_score (0-100) from accident/service/tyre/exterior/interior.
 *   5. owner_factor, fuel_factor, insurance_factor, demand_factor adjustments.
 *   6. retail band built by applying a target gross margin + negotiation spread.
 */

export interface ValuationConfig {
  annual_depreciation: number; // fraction per year, e.g. 0.12
  min_value_floor_pct: number; // value never falls below this fraction of base
  expected_km_per_year: number;
  km_penalty_per_excess_km: number; // ₹ deducted per excess km
  owner_penalty: Record<string, number>; // "1":0, "2":0.05, "3":0.10 (fraction off)
  fuel_adjust: Record<string, number>; // DIESEL: +0.02 etc
  demand_adjust: Record<string, number>; // HIGH/MEDIUM/LOW
  insurance_adjust: Record<string, number>; // VALID/EXPIRING/EXPIRED
  accident_adjust: Record<string, number>; // NONE/MINOR/MAJOR
  service_adjust: Record<string, number>; // FULL/PARTIAL/NONE
  condition_weights: { tyre: number; exterior: number; interior: number };
  target_gross_margin: number; // retail markup over (purchase + refurb buffer)
  refurb_buffer_pct: number; // assumed refurb as fraction of purchase for retail calc
  negotiation_spread: number; // +/- band around recommended retail
  // Brand/model benchmark ex-stock values (admin maintained, optional)
  benchmarks: Record<string, number>;
  // ---- IDV-blend model (v2) ----
  idv_blend?: {
    condition_neutral_score: number; // condition score treated as "no change"
    condition_sensitivity: number;   // value change per point away from neutral
    condition_factor_min: number;    // clamp
    condition_factor_max: number;    // clamp
    idv_age_discount: number;        // light residual dep/yr in IDV+ageing fallback
    underdeclare_ratio: number;      // flag if IDV < ratio × benchmark-derived market
  };
}

export const DEFAULT_CONFIG: ValuationConfig = {
  annual_depreciation: 0.12,
  min_value_floor_pct: 0.25,
  expected_km_per_year: 12000,
  km_penalty_per_excess_km: 0.6,
  owner_penalty: { "1": 0, "2": 0.05, "3": 0.1, "4": 0.15 },
  fuel_adjust: { PETROL: 0, DIESEL: 0.02, CNG: -0.01, HYBRID: 0.03, ELECTRIC: 0.02 },
  demand_adjust: { HIGH: 0.05, MEDIUM: 0, LOW: -0.06 },
  insurance_adjust: { VALID: 0.01, EXPIRING: 0, EXPIRED: -0.03 },
  accident_adjust: { NONE: 0, MINOR: -0.05, MAJOR: -0.15 },
  service_adjust: { FULL: 0.03, PARTIAL: 0, NONE: -0.04 },
  condition_weights: { tyre: 0.2, exterior: 0.45, interior: 0.35 },
  target_gross_margin: 0.18,
  refurb_buffer_pct: 0.05,
  negotiation_spread: 0.06,
  // Indicative new/ref benchmark values for common Prakash Auto Hub models (₹).
  // Used only when caller does not pass an explicit base_value.
  benchmarks: {
    "MARUTI SWIFT": 750000,
    "MARUTI BALENO": 850000,
    "MARUTI ERTIGA": 1150000,
    "MARUTI ALTO": 450000,
    "MARUTI WAGONR": 600000,
    "MARUTI BREZZA": 1100000,
    "MARUTI XL6": 1250000,
    "HYUNDAI I10": 600000,
    "HYUNDAI GRAND I10": 700000,
    "HYUNDAI CRETA": 1400000,
    "HYUNDAI AURA": 750000,
    "HYUNDAI VENUE": 1050000,
    "TATA TIAGO": 700000,
    "TATA ZEST": 650000,
    "TATA SAFARI": 1800000,
    "TATA HARRIER": 1700000,
    "TATA SAFARI STORME": 1400000,
    "TOYOTA INNOVA": 2000000,
    "TOYOTA INNOVA CRYSTA": 2200000,
    "TOYOTA ETIOS": 700000,
    "TOYOTA ETIOS CROSS": 750000,
    "TOYOTA HYRYDER": 1500000,
    "TOYOTA FORTUNER": 3800000,
    "HONDA AMAZE": 800000,
    "MAHINDRA SCORPIO": 1600000,
    "MAHINDRA BOLERO": 1100000,
    "FORD FIGO": 600000,
    "FORD ECOSPORT": 900000,
  },
  idv_blend: {
    condition_neutral_score: 75,
    condition_sensitivity: 0.004, // 100→+0.10, 50→−0.10 around neutral 75
    condition_factor_min: 0.75,
    condition_factor_max: 1.12,
    idv_age_discount: 0.03,
    underdeclare_ratio: 0.7,
  },
};

export interface ValuationInput {
  brand: string;
  model: string;
  variant?: string;
  reg_year: number;
  kms: number;
  owners: number;
  fuel_type: string;
  accident_history?: string;
  service_history?: string;
  tyre_condition?: number; // 1-10
  exterior_condition?: number; // 1-10
  interior_condition?: number; // 1-10
  insurance_validity?: string;
  market_demand?: string;
  base_value?: number; // optional explicit benchmark override
}

export interface ValuationResult {
  condition_score: number;
  base_value: number;
  suggested_purchase: number;
  retail_min: number;
  retail_recommended: number;
  retail_max: number;
  breakdown: Record<string, any>;
}

const round = (n: number) => Math.max(0, Math.round(n / 1000) * 1000);

function benchmarkKey(brand: string, model: string) {
  const b = (brand || "").trim().toUpperCase();
  const m = (model || "").trim().toUpperCase();
  return `${b} ${m}`.replace(/\s+/g, " ").trim();
}

export function evaluate(
  input: ValuationInput,
  cfg: ValuationConfig = DEFAULT_CONFIG
): ValuationResult {
  const currentYear = new Date().getFullYear();
  const age = Math.max(0, currentYear - (input.reg_year || currentYear));

  // 1. Base value
  let base = input.base_value || 0;
  if (!base) {
    const key = benchmarkKey(input.brand, input.model);
    base =
      cfg.benchmarks[key] ||
      cfg.benchmarks[(input.model || "").toUpperCase()] ||
      500000; // generic fallback
  }

  // 2. Age depreciation (compounding, floored)
  const floor = base * cfg.min_value_floor_pct;
  let value = base * Math.pow(1 - cfg.annual_depreciation, age);
  value = Math.max(value, floor);

  // 3. KM penalty
  const expectedKm = cfg.expected_km_per_year * Math.max(1, age);
  const excessKm = Math.max(0, (input.kms || 0) - expectedKm);
  const kmPenalty = excessKm * cfg.km_penalty_per_excess_km;
  value -= kmPenalty;

  // 4. Condition score (0-100)
  const w = cfg.condition_weights;
  const tyre = (input.tyre_condition ?? 7) * 10;
  const ext = (input.exterior_condition ?? 7) * 10;
  const inte = (input.interior_condition ?? 7) * 10;
  const conditionScore =
    Math.round((tyre * w.tyre + ext * w.exterior + inte * w.interior) * 100) / 100;
  // map 0-100 score to a +/-10% multiplier (50 = neutral)
  const conditionAdj = (conditionScore - 50) / 500; // 100 -> +0.10, 0 -> -0.10
  value *= 1 + conditionAdj;

  // 5. Categorical adjustments
  const adj =
    (cfg.owner_penalty[String(input.owners)] !== undefined
      ? -cfg.owner_penalty[String(input.owners)]
      : -0.15) +
    (cfg.fuel_adjust[(input.fuel_type || "").toUpperCase()] || 0) +
    (cfg.demand_adjust[(input.market_demand || "MEDIUM").toUpperCase()] || 0) +
    (cfg.insurance_adjust[(input.insurance_validity || "EXPIRING").toUpperCase()] || 0) +
    (cfg.accident_adjust[(input.accident_history || "NONE").toUpperCase()] || 0) +
    (cfg.service_adjust[(input.service_history || "PARTIAL").toUpperCase()] || 0);
  value *= 1 + adj;

  const suggestedPurchase = round(value);

  // 6. Retail band
  const withRefurb = suggestedPurchase * (1 + cfg.refurb_buffer_pct);
  const recommended = round(withRefurb * (1 + cfg.target_gross_margin));
  const retailMin = round(recommended * (1 - cfg.negotiation_spread));
  const retailMax = round(recommended * (1 + cfg.negotiation_spread));

  return {
    condition_score: conditionScore,
    base_value: round(base),
    suggested_purchase: suggestedPurchase,
    retail_min: retailMin,
    retail_recommended: recommended,
    retail_max: retailMax,
    breakdown: {
      age,
      base_value: round(base),
      after_depreciation: round(base * Math.pow(1 - cfg.annual_depreciation, age)),
      km_penalty: round(kmPenalty),
      condition_score: conditionScore,
      condition_adjustment_pct: Math.round(conditionAdj * 1000) / 10,
      categorical_adjustment_pct: Math.round(adj * 1000) / 10,
      target_gross_margin_pct: cfg.target_gross_margin * 100,
    },
  };
}

/* =========================================================================
 * IDV-BLEND VALUATION (v2)
 * Base value = blend of IDV × Condition × Demand.
 * Graceful fallback: if condition/demand missing → IDV + ageing only;
 * if IDV missing → benchmark + ageing (legacy evaluate()).
 * ========================================================================= */

export interface BlendInput extends ValuationInput {
  idv?: number;                 // Insured Declared Value (anchor)
  condition_score?: number;     // 0–100 (e.g. from photo AI); overrides sliders
  demand_level?: string;        // HIGH | MEDIUM | LOW
}

export interface BlendResult extends ValuationResult {
  market_value: number;         // estimated resale/market value
  basis: string;                // which path was used
  idv_used: number | null;
  warnings: string[];
  demand_level: string;
}

export function evaluateBlend(
  input: BlendInput,
  cfg: ValuationConfig = DEFAULT_CONFIG
): BlendResult {
  const blend = cfg.idv_blend || DEFAULT_CONFIG.idv_blend!;
  const currentYear = new Date().getFullYear();
  const age = Math.max(0, currentYear - (input.reg_year || currentYear));
  const warnings: string[] = [];

  // ---- Condition score (prefer explicit/AI score, else sliders, else neutral)
  let conditionScore = input.condition_score ?? NaN;
  let haveCondition = !Number.isNaN(conditionScore);
  if (!haveCondition && (input.tyre_condition || input.exterior_condition || input.interior_condition)) {
    const w = cfg.condition_weights;
    const tyre = (input.tyre_condition ?? 7) * 10;
    const ext = (input.exterior_condition ?? 7) * 10;
    const inte = (input.interior_condition ?? 7) * 10;
    conditionScore = Math.round((tyre * w.tyre + ext * w.exterior + inte * w.interior) * 10) / 10;
    haveCondition = true;
  }
  if (!haveCondition) conditionScore = blend.condition_neutral_score;

  // ---- Demand
  const demandLevel = (input.demand_level || input.market_demand || "").toUpperCase();
  const haveDemand = ["HIGH", "MEDIUM", "LOW"].includes(demandLevel);
  const demandFactor = haveDemand ? 1 + (cfg.demand_adjust[demandLevel] || 0) : 1;

  // ---- Benchmark-derived market (for under-declared IDV check / fallback)
  const key = benchmarkKey(input.brand, input.model);
  const benchmark =
    input.base_value ||
    cfg.benchmarks[key] ||
    cfg.benchmarks[(input.model || "").toUpperCase()] ||
    0;
  const benchmarkMarket = benchmark
    ? Math.max(benchmark * cfg.min_value_floor_pct, benchmark * Math.pow(1 - cfg.annual_depreciation, age))
    : 0;

  // ---- KM & categorical penalties (shared)
  const expectedKm = cfg.expected_km_per_year * Math.max(1, age);
  const excessKm = Math.max(0, (input.kms || 0) - expectedKm);
  const kmPenalty = excessKm * cfg.km_penalty_per_excess_km;
  const ownerAdj =
    cfg.owner_penalty[String(input.owners)] !== undefined
      ? -cfg.owner_penalty[String(input.owners)]
      : -0.15;
  const accidentAdj = cfg.accident_adjust[(input.accident_history || "NONE").toUpperCase()] || 0;
  const serviceAdj = cfg.service_adjust[(input.service_history || "PARTIAL").toUpperCase()] || 0;
  const insuranceAdj = cfg.insurance_adjust[(input.insurance_validity || "EXPIRING").toUpperCase()] || 0;

  const idv = Number(input.idv) > 0 ? Number(input.idv) : null;
  let market = 0;
  let basis = "";

  // condition factor centred on neutral score
  const condFactorRaw = 1 + (conditionScore - blend.condition_neutral_score) * blend.condition_sensitivity;
  const conditionFactor = Math.min(blend.condition_factor_max, Math.max(blend.condition_factor_min, condFactorRaw));

  if (idv) {
    // Under-declared IDV sanity check vs benchmark-derived market
    if (benchmarkMarket && idv < benchmarkMarket * blend.underdeclare_ratio) {
      warnings.push(
        `IDV (₹${idv.toLocaleString("en-IN")}) looks low vs expected market ≈ ₹${Math.round(benchmarkMarket).toLocaleString("en-IN")} — possible under-declaration; verify before quoting.`
      );
    }
    if (haveCondition && haveDemand) {
      basis = "Blend: IDV × Condition × Demand";
      market = idv * conditionFactor * demandFactor;
    } else if (haveCondition) {
      basis = "IDV × Condition";
      market = idv * conditionFactor;
    } else {
      // minimal data: IDV + light ageing only (per spec fallback)
      basis = "IDV + Ageing (minimal data)";
      market = idv * Math.pow(1 - blend.idv_age_discount, Math.min(age, 5));
      if (!haveCondition) warnings.push("No condition data — used IDV + ageing only. Add photos/inspection for a sharper figure.");
    }
    market *= 1 + accidentAdj + serviceAdj + insuranceAdj;
    market -= kmPenalty;
    market *= 1 + ownerAdj;
  } else {
    // No IDV → fall back to benchmark + ageing (legacy path) for market value
    basis = benchmark ? "Benchmark + Ageing (no IDV)" : "Generic estimate (no IDV/benchmark)";
    if (!benchmark) warnings.push("No IDV and no benchmark for this model — estimate is rough. Enter IDV for an accurate valuation.");
    else warnings.push("No IDV supplied — used model benchmark + ageing. Enter IDV from the insurance for best accuracy.");
    const baseLegacy = benchmark || 500000;
    market = Math.max(baseLegacy * cfg.min_value_floor_pct, baseLegacy * Math.pow(1 - cfg.annual_depreciation, age));
    market *= conditionFactor * demandFactor;
    market *= 1 + accidentAdj + serviceAdj + insuranceAdj;
    market -= kmPenalty;
    market *= 1 + ownerAdj;
  }

  market = Math.max(0, market);
  const marketValue = round(market);

  // Purchase = market less target margin + refurb buffer
  const suggestedPurchase = round(market * (1 - cfg.target_gross_margin - cfg.refurb_buffer_pct));

  // Retail band centred on market value
  const retailRecommended = marketValue;
  const retailMin = round(marketValue * (1 - cfg.negotiation_spread));
  const retailMax = round(marketValue * (1 + cfg.negotiation_spread));

  return {
    condition_score: Math.round(conditionScore * 10) / 10,
    base_value: idv ? idv : round(benchmark),
    market_value: marketValue,
    suggested_purchase: suggestedPurchase,
    retail_min: retailMin,
    retail_recommended: retailRecommended,
    retail_max: retailMax,
    basis,
    idv_used: idv,
    demand_level: haveDemand ? demandLevel : "MEDIUM (assumed)",
    warnings,
    breakdown: {
      basis,
      age,
      idv: idv || "—",
      condition_score: Math.round(conditionScore * 10) / 10,
      condition_factor: Math.round(conditionFactor * 1000) / 1000,
      demand_level: haveDemand ? demandLevel : "—",
      demand_factor: Math.round(demandFactor * 1000) / 1000,
      km_penalty: round(kmPenalty),
      owner_adjustment_pct: Math.round(ownerAdj * 1000) / 10,
      accident_adjustment_pct: Math.round(accidentAdj * 1000) / 10,
      market_value: marketValue,
      target_gross_margin_pct: cfg.target_gross_margin * 100,
      refurb_buffer_pct: cfg.refurb_buffer_pct * 100,
    },
  };
}
