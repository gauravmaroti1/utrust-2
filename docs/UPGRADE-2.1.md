# U TRUST 2.1 — Valuation Upgrade Notes

This release reworks valuation around **IDV** and adds **AI photo condition scoring**, a **vehicle catalog**, and an **inspection-and-valuation PDF**. Everything is backward compatible; your existing data and logins are untouched.

## What changed

**New valuation model (IDV blend).** Base value now anchors on the insurance **IDV**, blended with **vehicle condition** and **local demand**:

> Market value = IDV × condition factor × demand factor − km/owner/accident penalties
> Suggested purchase = market value − target margin − refurb buffer

It degrades gracefully exactly as you asked:
- IDV + condition + demand → full blend
- IDV + condition only → blend without demand
- IDV alone → **IDV + ageing**
- no IDV → model benchmark + ageing (clearly flagged as rough)

It also **flags a suspiciously low IDV** (possible under-declaration) by comparing against the model benchmark, so you don't overpay off a soft IDV.

**AI photo condition scoring.** On the Valuation screen you can now add up to 8 inspection photos and click *Analyze Condition with AI*. Claude looks at the photos and returns an overall condition score (0–100), panel scores, visible damage, and a suggested refurbishment list — which feed straight into the valuation. Photos are downscaled in the browser before upload to keep things fast.

**Vehicle catalog.** ~190 models across 19 makes (Maruti, Hyundai, Tata, Mahindra, Toyota, Kia, Honda, MG, Skoda, VW, Renault, Nissan, Ford, Chevrolet, Citroën, Jeep, BYD, Datsun, Fiat) covering ~2010–2026, with make→model dropdowns. A **Manual entry** toggle lets you value anything not in the list, and manually added models are saved back to the catalog.

**Inspection & valuation PDF.** A branded report with the vehicle details, condition assessment, photos, market value and the quoted purchase price — downloadable after saving a valuation.

## Deploying this to your live system

Same flow you used before (GitHub Desktop → Railway). The database changes apply automatically on boot (all new columns/tables use `IF NOT EXISTS`).

1. In **GitHub Desktop**, replace your local project files with this updated version, commit (e.g. "valuation 2.1"), and **Push**.
2. Railway auto-redeploys. On boot it adds the catalog table, the new evaluation columns, and seeds the 190-model catalog. Watch deploy logs for:
   ```
   [seed] vehicle catalog: 190 models inserted
   ```
   (If your DB already had data, the schema changes still apply; only the catalog seeds because it was empty.)
3. Done — the new Valuation screen is live.

## Turning on AI photo scoring

The app works without this (manual sliders), but to enable AI scoring:

1. Go to **console.anthropic.com**, sign in, and create an **API key**.
2. In Railway → your **app service → Variables**, add:
   - `ANTHROPIC_API_KEY` = your key
   - *(optional)* `VISION_MODEL` = `claude-sonnet-4-6` (default). Use `claude-opus-4-8` for higher accuracy or `claude-haiku-4-5` for lower cost.
3. Redeploy (or it redeploys automatically on save).

**Cost:** each photo analysis is a single API call over the inspection photos — a few rupees per valuation on Sonnet, less on Haiku. You're billed by Anthropic on your own key, separate from this app.

## Important notes

- This is an internal **valuation estimate**, not a binding offer — the PDF says so, and the evaluator should always sanity-check against your own recent buy/sell prices for that model.
- IDV can be under-declared by owners to lower premiums; trust the under-declaration warning when it appears.
- Inspection photos are stored (downscaled) with each saved valuation so the report can be regenerated. Keep an eye on database size over time; if it grows large, we can move photos to object storage later.
