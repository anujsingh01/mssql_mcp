# Raw data to golden data: the gap, step by step

**Raw data** = the tables in `Bi_Data` (SAP extracts loaded by the staging jobs).
**Golden data** = what Power BI holds after its Power Query / DAX transformations, which the "Sales Dashboards" charts are built on.
We have no access to the golden data, so every step below was reverse-engineered from the hand-over notes and then
*proven* by recomputing the dashboard numbers from raw (see `docs/reconciliation.md`: quantity exact, revenue 99.9%).

Window used for all figures: FY2027, 01-Apr-2026 to 08-Nov-2026 (same as the screenshots).

## 1. Why the raw table is called "raw"

`Sales_Transactions_Detail` is a straight dump of every SAP billing document line: 3.1M lines this FY. It mixes
real customer sales with things that are not sales. The golden data removes or neutralises them:

| # | Transformation (golden rule) | What it removes / changes | Size this FY | Verdict |
|---|---|---|---|---|
| T1 | Drop `InvoiceType` or `RefDocType` in (ZGST, ZCR3, ZFOC) | **ZGST = stock transfers between plants/depots.** The "customer" is a plant code (TND1, APD1, WBW1...), not a customer. 563,695 lines. | 18.99 bn "revenue", 52.3M units | **Correct** to exclude: internal movement, not a sale. |
|    |  | **ZCR3 = credit notes against normal invoices** (RefDocType ZNOR), qty -1 per line at full price, with a scheme/claim reference. 322,676 lines, 14,893 documents. | -106 M revenue, -330,839 units | **Needs business confirmation.** If ZCR3 are genuine returns/claims, golden sales are overstated by 0.46% revenue and 1.4% units. Note ordinary returns (ZRE) *are* deducted. |
|    |  | **ZFOC** never occurs in the data. | 0 | Dead rule, harmless. |
| T2 | Revenue = `BasicPrice` when `SalesOrg = 'DOM'`, else `GrossSalesRevenue` | Domestic revenue measured before certain pricing conditions. | Basic exceeds Gross by 132 M (0.58%) | **Plausible but undocumented.** Ask what sits between BasicPrice and GrossSalesRevenue (scheme discounts?). |
| T3 | Revenue += `QTY_DISCOUNT` | Adds back quantity discounts (negative numbers). | -12.5 M | Plausible: reports net of qty discount. |
| T4 | Revenue = 0 for ZSAM / ZSRE / ZBEN / ZBPY (samples, benefits, buy-backs) | Keeps the lines (quantity counted as *free*), but no revenue. | 8.4 M on 14,191 lines | Correct. |
| T5 | Sales Quantity = 0 for item categories TANN/RENN (free items) and credit/debit/sample types; counted as **Free Quantity** instead | 49,706 lines | 719,715 units moved from sales qty to free qty | Correct. |
| T6 | Sales Quantity x `Equivalent_Qty_Factor` from product master; NULL factor -> 1 | Converts sets/packs to equivalent units. 1,542 sold products have NULL factor (16.5M units, treated as 1). | Factor changes total from 21.43M (raw) to 23.18M (golden) | **Works today but fragile**: the column is free text in SAP (values like `50,000`, `M`, `53.5X36.5X37.5`, blank). None of the dirty ones are sold in golden scope *today*; a new SKU with a bad value would silently distort quantity. |
| T7 | Type of Sale = Normal when RefDocType in (ZNOR, ZSRN, ZSCH), else Special | Classification only. | | OK. ZSRN never occurs. |
| T8 | Product master filtered to Material_Type in (FINH, MSPR, SEMI, TRAD); `Hierarchy code new` for spares; NULL factor -> 1 | Drops tools, capital items, raw material, packaging. | 2 products / 5,489 revenue in golden scope | Correct and immaterial. |
| T9 | Channel and Region come from `PB_Customer_Master` by `BillToParty`; branch from `Branch (MIS)` by `BranchCode` | Master is a **point-in-time snapshot**: a customer who changed channel is re-stated for history. | AD/ARD revenue differ by 0.2% from the dashboard, Exports by 2.47 M (customer with blank channel) | Explains the remaining revenue gap. Golden data presumably mapped blank-channel EXP customers to "Exports". |
| T10 | History before 01-Apr-2022 appended from a CSV in OneDrive | Not in SQL at all. | | Any multi-year chart beyond FY23 cannot be rebuilt from SQL. |
| T11 | Targets and budgets from Excel on SharePoint | SQL has `PBI_Sales_Targets`, `SalesTargetsFY27`, `Branch_Channel_Target`, `SD_Target_FY2026`, `SD_TARGET_FINAL`, `BUDGET_WIP` | Which one is current is unknown | **Open.** Must be confirmed before Target KPIs are rebuilt. |

## 2. What the golden data does NOT check (risks found in raw)

- `Equivalent_Qty_Factor` is free text; 42,069 products blank, 33,607 NULL, 532 with `50000`, plus commas, letters and dimensions. Only the four finished-goods material types are reasonably clean (FINH: 7 NULL, 9 blank).
- Customer master channel is overwritten in place (no history), so prior-year channel figures move when a customer is re-classified.
- One active customer in scope has a blank channel (2.47 M revenue).
- ZS2 debit memos carry positive values on 246 lines (6.0 M); confirm they should add to revenue.
- No duplicate invoice lines, no future dates, no missing days this FY, data refreshed daily (last invoice = today). These are good.

## 3. How to tell whether the golden data is right: the checklist

Automated: `node scripts/data-checks.js [from] [to]` runs every rule below and writes `docs/data-check-report.md`.

**A. Master data (must all PASS before trusting any chart)**
- A1 Every product on a golden-scope sales line exists in the product master.
- A2 Every customer on a golden-scope sales line exists in the customer master.
- A3 Every such customer has a non-blank Channel.
- A4 Every branch code exists in Branch (MIS).
- A5/A6 Product_Code and BillToParty are unique in their masters.
- A7 Conversion factor of every sold product is numeric, > 0 and <= 100.
- A8 Count of sold products with NULL factor (treated as 1): should be reviewed, not silently accepted.
- A9/A10 Sold products have a valid Material_Type and a Business_Segment.
- A11 Factor column hygiene across the whole master (non-numeric values present): warn.
- A12 Customers missing from the master occur only on stock-transfer documents.

**B. Transactions**
- B1 No duplicate (SAPRefNo, ItemNumber).
- B2 No future-dated invoices.
- B3 Latest invoice date within 2 days of today.
- B4 Every non-Sunday day has invoice lines; low-volume days listed.
- B5 Every invoice/reference type in the data is covered by a rule (unknown codes listed with revenue).
- B6 Rule codes that never occur (dead rules) listed.
- B7 No positive-quantity normal sales with zero/negative revenue.
- B8 Credit/return types carry negative values.

**C. Golden-rule impact (reported, for a human to judge each refresh)**
- C1 Revenue removed by the ZGST/ZCR3/ZFOC filter, by type.
- C2 BasicPrice vs GrossSalesRevenue difference on domestic lines.
- C3 Revenue zeroed by the sample/benefit rule.
- C4 Quantity moved to free quantity.
- C5 QTY_DISCOUNT added back.
- C6 SAP NetValue vs golden revenue (sanity ratio; golden should be below NetValue, which includes tax).

**D. Reconciliation (manual, once per refresh)**
- D1 Sales Quantity total and by channel/branch/segment equals the Power BI figure to the unit.
- D2 Revenue total within 0.1% of Power BI, and every channel difference explained (T9).
- D3 Previous-year figures computed with the same rules match the PY cards.
- D4 Target figures match once the target source is confirmed.

## 4. Questions to close the gap (for the Power BI / SAP team)
1. Are ZCR3 credit notes returns or claims? Should they reduce sales? (0.46% revenue, 1.4% units at stake.)
2. What pricing conditions sit between BasicPrice and GrossSalesRevenue, and why is BasicPrice the reported domestic revenue?
3. Which target table is live, and how are targets allocated to branch x channel x segment?
4. Is customer channel history preserved anywhere, or are prior-year channel figures expected to move?
5. Can SAP enforce a numeric Equivalent_Qty_Factor for finished goods?
6. Why does the Revenue page YTD card (22,941 M) differ from the Channel page total (23,296 M)?
