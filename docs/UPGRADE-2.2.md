# U TRUST 2.2 — Operations Upgrade

This release adds compliance tracking, a record of evaluated vehicles, purchase/sale proposals, evaluator targets, trade enquiries, chassis numbers throughout, and moves inspection photos onto a persistent volume. All database changes are idempotent (`IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`), so your live data and logins are untouched.

## What's new

1. **Photo storage on a volume.** Inspection photos now save to disk under `/uploads` (a Railway volume) instead of inside the database, keeping Postgres lean. Your data was already safe in Postgres — this just stops the database from bloating as photos accumulate.

2. **Insurance tracking on stock.** Each vehicle now has an *Insured? (Yes/No)* flag and an *Insurance Expiry* date. The dashboard shows counts of expired / expiring (<30 days) / not-insured vehicles; tap a count to see the list.

3. **Registration validity on stock.** A *Registration Expiry* date per vehicle, with dashboard alerts for expired / expiring registrations so those vehicles can be scrapped or re-registered.

4. **Record of evaluated vehicles.** Every saved valuation now appears in an *Evaluated Vehicles* table on the Valuation screen — date, vehicle, chassis (last 5), IDV, condition, market, purchase price — each with a one-click PDF.

5. **Purchase vs Sale proposals.**
   - *Purchase proposals* are raised from the **evaluated-vehicles** list (price prefilled from the valuation).
   - *Sale proposals* are raised from **in-stock / purchased** vehicles.
   - A tab filter and a type badge separate the two.

6. **Customer details on proposals.** Name, mobile, address and pincode, plus the vehicle's make/year and chassis (last 5) pulled from the linked record.

7. **Chassis number everywhere.** Added to both evaluations and stock vehicles. Lists show the last 5 digits; the full number is stored.

8. **Evaluator targets + enquiries.**
   - *Targets* tab (Productivity): managers/admin set each evaluator's monthly target — evaluations, purchases, and purchase value — with live progress bars vs achievement.
   - *Enquiries* tab: log **Trade-In** and **Trade-Out** enquiries separately (customer name, mobile, address, pincode, maker, model, reg year, chassis last-5, asking price, price given), with a running list.

## Deploying to your live system

Same GitHub Desktop → Railway flow. Replace your local files with this version, commit ("ops upgrade 2.2"), and push. Railway redeploys and applies the schema changes automatically on boot.

### One new step — add a volume (for photos)

1. In Railway, open your **app service → Settings → Volumes** (or the *+ Volume* option).
2. Add a volume with **mount path** `/app/data`.
3. Redeploy. Photos will now persist at `/app/data/uploads` across deploys.

If you skip the volume, the app still runs — photos just save to a folder that resets on each redeploy, so add the volume to keep them permanently. No other variables are required for this release. (AI photo scoring still uses `ANTHROPIC_API_KEY` from 2.1, unchanged.)

## Notes

- Expired-registration vehicles are surfaced on the dashboard specifically so you can decide between scrap and re-registration — the app flags them but doesn't change their status automatically.
- Targets and achievement are scoped to the current month; "done" counts use saved evaluations and approved purchase proposals.
- A vehicle counts as "not insured" when its *Insured?* flag is No (or it has no valid insurance), so keep that flag current when adding stock.
