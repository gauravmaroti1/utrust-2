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
