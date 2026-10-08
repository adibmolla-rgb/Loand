# Loand – UK Lender Research Database, Release 2026-09-27 (README)

**Data as at:** 2026-09-27  |  **Previous release:** 2026-09-26
**Files:** `Loand_UK_Lender_Research_2026-09-27.xlsx`, `Loand_UK_Lender_Research_Report_2026-09-27.pdf`, this README.

This release refreshes and extends the previous database. **No existing sheet or column was renamed or removed, and no Source ID was renumbered.** Every change is logged in the `Changelog` sheet (111 entries).

## Format changes that affect the website
- **Header on row 1 of every data sheet.** The notes that previously sat above the headers (Lender_Overview, Mortgage_Rates, Personal_Loans, Approval_Rates, Historical_Data) are now in `Sheet_Notes`.
- New columns are appended at the **end** of existing sheets only (listed below).
- Source IDs S01–S68 are unchanged; new sources run S69–S96. S63 is now flagged `OUTDATED` in the new `Source status` column (kept, not deleted). There was never an S12.
- Status labels and definitions are unchanged.
- Dates: new date columns use ISO `YYYY-MM-DD`. Existing text date columns were left untouched for compatibility; each now has an ISO companion column where it was not already ISO.

## Columns added to existing sheets (appended at the end)
- **Lender_Overview**: `First-time buyer support - Availability`, `First-time buyer support - Detail`, `First-time buyer support - Source ID`, `Remortgage - Availability`, `Remortgage - Detail`, `Remortgage - Source ID`, `Personal loans - Availability`, `Personal loans - Detail`, `Personal loans - Source ID`, `Buy-to-let - Availability`, `Buy-to-let - Detail`, `Buy-to-let - Source ID`, `Shared ownership - Availability`, `Shared ownership - Detail`, `Shared ownership - Source ID`, `Shared equity - Availability`, `Shared equity - Detail`, `Shared equity - Source ID`, `Self-employed support - Availability`, `Self-employed support - Detail`, `Self-employed support - Source ID`, `Last verified`
- **Mortgage_Rates**: `Initial rate (number)`, `APRC (number)`, `Product fee (number, £)`, `LTV min`, `LTV max`, `Initial period months`, `Product code`, `Effective date`, `Status`, `Buyer type`, `Max loan (number, £)`, `Reversion rate (number)`
- **Market_Rates**: `Value numeric`, `Unit`, `Date (ISO)`
- **Personal_Loans**: `Min amount (number)`, `Max amount (number)`, `Amount qualifier`, `Min term months`, `Max term months`, `Representative APR (number)`, `Max APR (number)`, `Minimum age (number)`, `Minimum income (number, £ per year)`, `Last verified`
- **Market_Reports**: `Date (ISO)`
- **Historical_Data**: `Value numeric`, `Unit`, `Date (ISO)`
- **Conflicts**: `Checked in release 2026-09-27`, `Updated resolution`, `Resolution source ID`
- **Sources**: `Publication date (ISO)`, `Source status`

Lender_Overview's split columns use Availability values `Yes` / `No` / `Not verified` / `Group policy` / `Not applicable`, with the source IDs moved out of the text into `... - Source ID`.

## New sheets
| Sheet | Columns / contents |
|---|---|
| `Sheet_Notes` | Sheet, Note |
| `Changelog` | Sheet, Lender group, Item, Old value, New value, Change type (added / updated / removed / status changed), Source ID |
| `Rules_Numeric` | Rule ID \| Lender group \| Brand scope \| Rule type \| Value numeric \| Unit \| Min income \| Max income \| Min LTV \| Max LTV \| Min loan \| Max loan \| Property type \| Buyer type \| Applicants \| Repayment type \| Other condition \| Status \| Source ID \| Related criteria row \| Last verified — 194 rules |
| `Property_Taxes` | Tax, Nation, Band / relief, Band from (£), Band to (£), Rate (%), Applies to, Effective date, Status, Source ID, Last verified, Notes |
| `Stress_and_Benchmarks` | Lender / scope, Item, Detail, Value numeric, Unit, Status, Source ID |
| `Time_Series` | Series, Date, Value numeric, Unit, Status, Source ID — 487 observations |
| `Loan_APR_Tiers` | Lender group, Product, Amount from (£), Amount to (£), APR (%), APR type, Max APR (%), Soft-search eligibility checker, Status, Source ID, Last verified |
| `Comparison_Fields` | Lender group, Field, Value (text), Value numeric, Unit, Status, Source ID, Last verified, Notes |

### Rules_Numeric conventions
- Rule types: `max_ltv`, `max_lti`, `dti_threshold`, `min_age`, `max_age_end_of_term`, `max_retirement_age`, `min_term_years`, `max_term_years`, `min_loan`, `max_loan`, `min_income`, `self_employed_min_years_trading`, `adverse_credit_lookback_years`.
- Units: `%`, `x income`, `years`, `£`, `£ per year`, `% of gross monthly income`.
- Blank condition columns mean the lender states no such condition. Where a lender does not publish a rule there is **no row** (no zeros, no guesses).
- `dti_threshold` rows are paired with the `max_lti` row that applies above the threshold (Barclays: DTI ≥20% → 4.0x; TSB: decline rule with its trigger conditions in `Other condition`).
- Recommended use: estimates from `CONFIRMED` rows only; show `SUPPORTED`/`UNCONFIRMED` rules as "check with lender".

### Mortgage_Rates conventions
- Official sheets used: HSBC consumer rate pages (APRC published), NatWest intermediary sheet (effective 2026-09-24), Nationwide guide (2026-09-15), Virgin Money guide (2026-09-16), TSB guide (2026-09-23). Each lender's reversion rate is its own row (`Buyer type` = `Reversion`).
- Third-party Mortgage Advice Bureau rows remain only where no official sheet was retrievable (Barclays, Lloyds Banking Group, Danske, Skipton) and stay `SUPPORTED`. The MAB rows for HSBC, NatWest and Nationwide/Virgin are marked `OUTDATED`.
- `LTV min` is the lower bound of the lender's band (0 where the lender states only a maximum). `APRC (number)` is blank unless the lender publishes it.

## Status classifications (unchanged)
| Status | Meaning |
|---|---|
| CONFIRMED | An official lender, regulator or government source directly states the information and it applies at the research date. |
| SUPPORTED | Multiple credible sources support it, or an official source supports it indirectly (e.g. group criteria applied to a sister brand); not stated in one official place for this exact scope. |
| UNCONFIRMED | Some evidence exists (usually a single third-party source) but insufficient confirmation. |
| NOT DISCLOSED | The lender (or market) does not publicly disclose the information, after checking the relevant official pages. |
| OUTDATED | Information was found but appears superseded; retained only for audit trail. |
| NOT VERIFIED | Operational gap flag added for this project: the item likely exists but could not be retrieved in this pass (script-rendered page, blocked site). It must NOT be read as 'not disclosed'. |

## How sources were verified
Official lender pages, intermediary criteria and rate sheets were fetched directly on 2026-09-27 and values copied from their text (rate sheets were parsed programmatically, then spot-checked). Regulator and government sources were used for market data, taxes and the affordability framework. Third-party sources only fill gaps or document conflicts. Quality control: schema compatibility checked against the previous workbook (every old sheet's columns are an exact prefix of the new ones), no orphan Source IDs, formula recalculation with zero errors.

## Conflicts
C10 resolved (TSB official criteria), C13 added and resolved (Barclays first-time buyer wording), C14 documents that Virgin Money criteria differ from Nationwide's. Still unresolved: C02, C03, C06, C08, C09 — the `Checked in release` column records what was tried.

## Important limitations
- Barclays, Lloyds Banking Group and Santander rates are only available through interactive tools, so they remain third-party snapshots. HSBC remortgage and Clydesdale new-business rates were fetched but not parsed reliably, so they are excluded.
- Virgin Money guide rows carry the printed section heading; first-time buyer vs other purchase segments are not disambiguated.
- HSBC and Santander full A–Z criteria are still script-rendered; HSBC age limits are third-party (SUPPORTED). Bank of Scotland is assumed (SUPPORTED) to follow LBG group criteria.
- Personal-loan figures for Nationwide, Virgin Money and Bank of Scotland remain NOT VERIFIED. Specialist lenders, Yorkshire BS/Accord and Leeds BS criteria remain NOT VERIFIED.
- Monthly Moneyfacts averages and the BoE effective rate on new mortgages were not retrievable as full series; BoE quoted rates by LTV are provided instead (clearly labelled).
- No lender publishes approval/acceptance/completion rates or minimum credit scores; none were estimated. Stress rates are published only by TSB among the lenders reviewed.
- This is research, not financial advice. No lender is ranked.

## Incorporating into Loand (PostgreSQL)
Import each sheet as a table keyed by its header row. Suggested additions for this release: `rules_numeric` (typed numeric columns with nullable conditions; index on lender group + rule type), `time_series` (series, date, value, unit), `property_tax_band`, `loan_apr_tier`, `comparison_field`, and `changelog`. Filter `mortgage_rates` on `Status` <> `OUTDATED` and flag rows whose `Effective date` is more than 7 days old as stale.
