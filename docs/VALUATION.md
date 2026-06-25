# Standardized Valuation Engine

The engine produces a **uniform Suggested Purchase Price** and a **Retail band** (minimum / recommended / maximum-negotiation) from inspection inputs, so every evaluator across Purnea, Bhagalpur and Forbesganj prices consistently. The entire model lives in the `valuation_config` table as JSON and is editable by the Super Admin under **Valuation Config** — no code change needed.

Source: [`server/src/valuation.ts`](../server/src/valuation.ts).

---

## Inputs

| Field | Example | Used for |
|-------|---------|----------|
| `brand`, `model`, `variant` | MARUTI / SWIFT / VXI | benchmark lookup |
| `reg_year` | 2020 | age & depreciation |
| `kms` | 45000 | usage penalty |
| `owners` | 1 | owner penalty |
| `fuel_type` | PETROL | fuel adjustment |
| `accident_history` | NONE/MINOR/MAJOR | adjustment |
| `service_history` | FULL/PARTIAL/NONE | adjustment |
| `tyre/exterior/interior_condition` | 1–10 each | condition score |
| `insurance_validity` | VALID/EXPIRING/EXPIRED | adjustment |
| `market_demand` | HIGH/MEDIUM/LOW | adjustment |
| `base_value` *(optional)* | explicit ₹ | overrides benchmark |

---

## Pipeline

1. **Base value** — from the admin-maintained `benchmarks` map for the model (≈28 common Prakash Auto Hub models seeded). If absent and no explicit `base_value`, a conservative figure is derived. This is the reference value of the model.

2. **Depreciation** — base is reduced by `annual_depreciation` (default 12%) compounded per year of age, floored at `min_value_floor_pct` (25%) so old vehicles never collapse to zero.
   `after_depreciation = base × (1 − annual_depreciation)^age`

3. **KM penalty** — kilometres above the expected band (`expected_km_per_year × age`) are penalised at `km_penalty_per_excess_km` ₹ per excess km.

4. **Condition score (0–100)** — weighted blend of tyre / exterior / interior ratings using `condition_weights` (default exterior 0.45, interior 0.35, tyre 0.20). This produces a percentage condition adjustment.

5. **Categorical adjustments** — additive percentage tweaks from `owner_penalty`, `fuel_adjust`, `demand_adjust`, `insurance_adjust`, `accident_adjust`, `service_adjust`.

6. **Suggested purchase** — depreciated value, minus km penalty, scaled by condition and the net categorical adjustment.

7. **Retail band** — built from the suggested purchase plus a `refurb_buffer_pct` allowance, marked up by `target_gross_margin` (default 18%) to get the **recommended** retail; `negotiation_spread` (±6%) sets the **min** and **max** negotiation limits.

The response includes a `breakdown` object (age, base, after-depreciation, km penalty, condition score, adjustment %s, target margin) so the figure is fully transparent and auditable.

---

## Worked example

Input: MARUTI SWIFT VXI, 2020, 45,000 km, 1 owner, petrol, no accident, full service, condition 8/7/8, insurance valid, high demand.

Output (with default config):

| Field | Value |
|-------|-------|
| Condition score | 75.5 / 100 |
| Suggested purchase | ₹3,99,000 |
| Retail minimum | ₹4,64,000 |
| **Retail recommended** | **₹4,94,000** |
| Retail max (negotiation) | ₹5,24,000 |

---

## Tuning guide

All values are fractions unless noted. Edit under **Valuation Config**:

| Parameter | Effect of increasing |
|-----------|----------------------|
| `annual_depreciation` | older cars valued lower |
| `min_value_floor_pct` | raises the floor for very old cars |
| `km_penalty_per_excess_km` | high-km cars penalised harder |
| `target_gross_margin` | wider retail markup over purchase |
| `negotiation_spread` | wider min↔max negotiation band |
| `condition_weights.*` | weight of each condition input (keep the three summing to 1.0) |
| `*_adjust` / `owner_penalty` maps | per-category nudges (e.g. `DIESEL: 0.02`) |
| `benchmarks` | per-model reference values — keep these current with the market |

> Recommendation: review `benchmarks` quarterly against actual auction/market data, and revisit `target_gross_margin` whenever your refurbishment costs shift.
