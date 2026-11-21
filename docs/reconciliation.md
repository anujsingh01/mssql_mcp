# Reconciliation against the Power BI "Sales Dashboards" PDF (FY2027 to 08-Nov-2026)

Formulas in `sql/kpi_base.sql`. Dashboard figures read from the screenshots.

## Totals (Channel Wise Sales page)
| Measure | Dashboard | SQL | Match |
|---|---:|---:|---|
| Sales Quantity (with conversion) | 23,179,855 | 23,179,854 | exact (rounding) |
| Revenue | 23,296,376,8xx | 23,315,822,985 | 99.92% |

## Sales Quantity by channel: 13 of 16 exact; D2C, E-Comm B2B, Others differ by < 40 units
## Sales Quantity by branch: every branch exact (Bangalore 3,587,664 / Hyderabad 1,732,981 / Chennai 1,236,077 ...)
## Sales Quantity by segment: TRADITIONAL 12,292,719 / APPLIANCES 5,684,179 / SPARES 5,202,957 — all exact

## Revenue by channel (DOM -> BasicPrice variant)
Exact for ASC, Cash & Carry, CPC, CSD, E-Comm B2C, IKEA, INSTITUTION, OLFS RC, Others; within 1 rupee for Oil Companies, OLFS-NC.
Small differences: AD +0.22%, ARD +0.22%, D2C +0.13%, E-Comm B2B -0.002%, Exports -0.7%.
- Exports gap (2,467,652) equals the revenue of 52 lines whose customer has no channel in the master: Power BI maps those to Exports (SalesOrg = 'EXP'). Fix: `COALESCE(NULLIF(c.Channel,''), CASE WHEN s.SalesOrg='EXP' THEN 'Exports' END)`.
- AD/ARD gap is most likely customers whose channel changed in the master after invoicing (the master is a point-in-time snapshot). To confirm with the Power BI team.

## Page filters observed
- Branch Wise pages show only Region in (South, East, North, West) market branches: Factory, SO US/Non-US, Institution, CSD, CPC, E-Comm branches are excluded. South quantity total 11,300,797 = sum of its 8 branches exactly.
- Channel page total includes channels scrolled out of the screenshot (PSK 3.48 bn, Q COM B2B 0.99 bn, Rural 0.02 bn).
- Revenue/Quantity pages: segment buttons TRADITIONAL / APPLIANCES / CLEANING / SPARES; period buttons MTD / QTD / YTD; branch slicer; cards: PY, Target, CY, Growth vs PY %, Achievement vs Target %.
- Branch/Channel/Product pages: FY and quarter/month buttons; toggle Quantity / Quantity w/o Conversion / Revenue; columns Sales CY, Sales PY, Growth vs PY %, Var vs PY, Achievement vs Target %, Target.

## Still to reconcile
- Target columns (which target table, and how it is mapped to branch/channel/segment).
- PY figures (same formulas on the prior-year window; should match once the base matches).
- MTD/QTD cards (same base with different date windows).
- "Revenue" page YTD card shows 22,941M while Channel page total shows 23,296M: likely a slicer or refresh difference; ask.

## Proof run, 2026-11-17 (supersedes "Still to reconcile" above)

Revenue and Quantity pages. Revenue cards are domestic only (SalesOrg = 'DOM'); Quantity cards include export.

| Card | Dashboard | SQL | Result |
|---|---:|---:|---|
| Revenue YTD CY | 22,941M | 22,960.6M | 0.085% high |
| Revenue YTD PY | 17,695M | 17,694.8M | match |
| Revenue MTD CY | 690M | 692.2M | 0.3% high |
| Revenue MTD PY | 222M | 221.7M | match |
| Quantity YTD CY | 23,180K | 23,179.9K | match |
| Quantity YTD PY | 21,696K | 21,695.8K | match |
| Quantity MTD CY / PY | 627K / 348K | 626.8K / 347.6K | match |
| Quantity QTD CY / PY | 4,198K / 3,741K | 4,197.7K / 3,741.4K | match |
| Revenue Target YTD | 19,144M | 19,359.7M (SalesTargetsFY27, Apr-Nov) | 1.1% off |
| Quantity Target YTD | 24,137K | 24,483.9K (same table) | 1.4% off |

- Withdrawn: "Revenue card 22,941M vs channel total 23,296M". The difference is export revenue (355.2M); the Revenue page is domestic only.
- Withdrawn: "DOM -> BasicPrice rule missing from the document". It is in the PDF as custom field "Gross Sales revenue". The Sales Revenue formula then cites [GrossSalesRevenue], which read literally (raw column) gives 23,183.8M; read as the custom field gives 23,315.8M; dashboard 23,296.4M.
- Targets: PDF section 2.b says Target is an Excel file on SharePoint connected straight to Power BI. SalesTargetsFY27 and Branch_Channel_Target are identical copies; PBI_Sales_Targets stops at FY2024. No SQL table reproduces the dashboard target.
- CY revenue is slightly high while PY revenue is exact: points to rows changed after the dashboard refresh rather than a rule difference (not proven).
