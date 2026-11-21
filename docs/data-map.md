# Data map (as of 2026-11-14)

Server: SQL Server 2022 Standard, reached over FortiClient VPN profile "Prestage".
Login `inwiz` can only open **Bi_Data** (role: db_datareader = read-only). All other
databases on the server are invisible to it.

## Bi_Data: 172 tables, ~176M rows. Largest tables

| Table | Rows | Cols | Likely meaning |
|---|---:|---:|---|
| Sales_Transactions_Detail | 17.3M | 40 | sales line items (primary sales fact?) |
| Demand_Transactions_Detail | 16.7M | 47 | demand / order lines |
| PXL_Stock_Feed, PXL_Sales_Feed, PXL_Payment_Feed, PXL_Customer_Feed, PXL_Optin_Feed | 2.8M–16.5M | | feeds from a "PXL" system |
| SAP_Stock_Data_Upto2Months, SAP_Stock_Data | 16.4M / 1.4M | 15 | SAP stock snapshots |
| STAG_SALES_DATA, STAG_CUST_DATA | 13.8M / 7.7M | | staging copies |
| ARDDMS_DAILY_SALES_DATA | 7.1M | 50 | dealer DMS daily sales |
| PBI_EASYDMS_Sales_Data | 4.9M | 54 | EasyDMS sales, Power BI feed |
| CRM_SALES_DATA, CRM_TICKET_DATA | 3.1M / 0.6M | | CRM sales and service tickets |
| VCARE_TICKET_DETAILS | 0.4M | 45 | service tickets |
| PBI_Sales_Targets, SD_Target_FY2026, PBI_SD_TGT_MASTER | 0.1M–0.5M | | sales targets |
| PBI_STOCK_PROCUREMENT | 1.2M | 24 | procurement / stock |
| PB_Product_Master | 137K | 37 | product master |
| PBI_EASYDMS_SubDealer_Master | 190K | 27 | dealer master |
| MarketPulse | 276K | 23 | market data |
| BUDGET_WIP | 102K | 14 | budgets |
| SFA_JourneyPlanReport | 93K | 35 | sales force journey plans |

Tables named *_BACKUP, *_bkup, *_Test, *_TESTING_TABLE, *_QAS, Sales_Temp and
dated copies (e.g. PBI_Product_Master_20250620_143131) are copies, not sources of truth.
Tables prefixed PBI_ appear to be the curated Power BI feeds and are the first place
to look for KPI definitions.
