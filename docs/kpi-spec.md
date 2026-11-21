# KPI specification (from "Power BI Dashboard - AI POC.pdf", checked against Bi_Data on 2026-11-14)

## Source tables: PDF name -> actual table in Bi_Data

| PDF name | Bi_Data table | Rows | Notes |
|---|---|---:|---|
| PB_Customer_Master | dbo.PB_Customer_Master | 46,817 | bill-to codes (1-series) |
| PB_Product_Master | dbo.PB_Product_Master | 136,629 | SKU master; `Equivalent_Qty_Factor` is varchar, NULL -> 1 |
| PB_Ship_to_Party | dbo.PB_Ship_To_Master | 22,957 | name differs from PDF |
| Branch_Master(MIS) | dbo.[Branch (MIS)] | 46 | also [Branch (NON-MIS)] |
| Sales_Transaction_Details | dbo.Sales_Transactions_Detail | 17.3M | primary sales fact, 2022-04-01 to today, ~7M invoices |
| PBI_EazyDMS_Subdealer_Sales | dbo.PBI_EASYDMS_Sales_Data | 4.9M | name differs from PDF |
| PBI_EazyDMS_Subdealer_Master | dbo.PBI_EASYDMS_SubDealer_Master | 189,599 | |
| PXL_Sales_Feed | dbo.PXL_Sales_Feed | 14.5M | retail POS |
| PXL_PSK_Master_Feed | dbo.PXL_PSK_Master_Feed | 1,853 | store master |
| Budget (Excel) | dbo.BUDGET_WIP | 102,216 | by Type of Sale, Channel, Product Code, Month, Branch, Sales Org |
| Target (Excel) | dbo.PBI_Sales_Targets (452K), SD_Target_FY2026, SalesTargetsFY27, Branch_Channel_Target, SD_TARGET_FINAL | | by Product Hierarchy, Branch, Channel, Month; need to confirm which is current |

Historical sales before 2022-04-01 came from a CSV in OneDrive in Power BI; it is NOT in SQL.

## Column name differences (PDF/DAX -> SQL)

| DAX name | SQL column in Sales_Transactions_Detail |
|---|---|
| Quantity | SaleQuantity |
| ReferenceInvoiceType | RefDocType (assumed; confirm) |
| InvoiceType, RefDocType, SalesOrg, BasicPrice, GrossSalesRevenue, QTY_DISCOUNT, ItemCategory | same names |

## Base filter (applied to every KPI)
```sql
InvoiceType NOT IN ('ZFOC','ZGST','ZCR3') AND RefDocType NOT IN ('ZFOC','ZGST','ZCR3')
```
Note: ZGST (571K rows since Apr-2026) and ZCR3 (329K) are large; excluding them matters.

## Derived measures, translated to SQL

```sql
-- Gross sales revenue
CASE WHEN SalesOrg = 'DOM' THEN BasicPrice ELSE GrossSalesRevenue END

-- Zero-quantity invoice types (free / returns / samples etc.)
-- qty_is_zero = ItemCategory IN ('TANN','RENN')
--            OR InvoiceType IN ('ZCR1','ZDR1','ZRK','ZDR3','ZSAM','ZSRE','ZBEN','ZBPY')
--            OR RefDocType  IN ('ZSAM','ZSRE','ZBEN','ZBPY','ZCR1','ZDR1','ZRK','ZDR3')

-- Sales Quantity           = CASE WHEN qty_is_zero THEN 0 ELSE SaleQuantity END * EquivalentQtyFactor
-- Sales QTY w/o conversion = CASE WHEN qty_is_zero THEN 0 ELSE SaleQuantity END
-- Free Quantity            = CASE WHEN ItemCategory IN ('TANN','RENN')
--                                   OR InvoiceType IN ('ZSAM','ZSRE','ZBEN','ZBPY')
--                                   OR RefDocType  IN ('ZSAM','ZSRE','ZBEN','ZBPY')
--                              THEN SaleQuantity ELSE 0 END * EquivalentQtyFactor
-- Total Quantity           = Sales Quantity + Free Quantity (to confirm)
-- Type of Sale             = CASE WHEN RefDocType IN ('ZNOR','ZSRN','ZSCH') THEN 'Normal' ELSE 'Special' END
-- Sales Revenue            = CASE WHEN InvoiceType IN ('ZSAM','ZSRE','ZBEN','ZBPY')
--                                   OR RefDocType  IN ('ZSAM','ZSRE','ZBEN','ZBPY')
--                              THEN 0 ELSE GrossSalesRevenue + QTY_DISCOUNT END
-- Sales Revenue Per Unit   = Sales Revenue / Sales Quantity
-- EquivalentQtyFactor      = ISNULL(TRY_CAST(p.Equivalent_Qty_Factor AS decimal(18,4)), 1)
```

Product master filter: `Material_Type IN ('FINH','MSPR','SEMI','TRAD')` (the "TRAD and SERV" clause is redundant).

## KPI list (53) and what each needs
- Quantity (21) and Revenue (6): all computable from Sales_Transactions_Detail + PB_Product_Master.
  Time variants needed: CY (financial year Apr-Mar), CY Full, PY, PY Full Period, PY Like-to-Like, Previous Day, Previous Month.
- Target (3): from a target table, by Product Hierarchy x Branch x Channel x Month.
- Variance vs Budget (8): actual vs BUDGET_WIP (BudgetQty, Budget_Free_Qty, SalesRevenue).
- Variance vs PY (9): actual CY vs actual PY, growth % and absolute.
- Variance vs Target (6): actual vs target.

## Open questions for the business
1. "New Gen Sales Quantity/Revenue": which product flag defines New Gen (NPD_Flag? NewSKU?).
2. "Sales Revenue (Capped)": capped how?
3. "Like-to-Like" PY: same branches/customers only, or same calendar days?
4. Which target table is live for FY27: SalesTargetsFY27, Branch_Channel_Target or PBI_Sales_Targets?
5. Channel: which column gives Channel in sales data (DistributionChannel? CustomerGroup via customer master?).
6. Confirm RefDocType is the "ReferenceInvoiceType" used in DAX.

## Sanity numbers (gross revenue by calendar year, raw, no filters)
2022 (Apr-Dec) 2,154 Cr | 2023 2,619 Cr | 2024 2,653 Cr | 2025 3,489 Cr | 2026 YTD 5,500 Cr
