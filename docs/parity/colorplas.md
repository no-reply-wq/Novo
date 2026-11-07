# Colorplas Parity — 197 Features

Last updated: 2026-11-07
Current score: 175 / 197

> Legend: ✅ Built · 🔄 In Progress · ❌ Not built

---

## Lead Management (12 features)

| # | Feature | Status | Test | Notes |
|---|---------|--------|------|-------|
| 1 | Create lead with company, contact, source | ✅ Built | e2e/lead.spec.ts | Wave 1 A |
| 2 | Assign lead to sales rep | ✅ Built | e2e/lead.spec.ts | Wave 1 A — relation to users |
| 3 | Lead status pipeline (New → Qualified → Proposal → Won/Lost) | ✅ Built | e2e/lead.spec.ts | Wave 1 A — dropdown field |
| 4 | Follow-up date reminders | ✅ Built | e2e/workflows.spec.ts | Wave 2 F — workflow trigger on date |
| 5 | Lead source tracking (referral, web, cold call) | ✅ Built | e2e/lead.spec.ts | Wave 1 A |
| 6 | Convert lead to customer | ✅ Built | e2e/records.spec.ts | Wave 2 I — convert-to action |
| 7 | Lead activity log (calls, emails, meetings) | ✅ Built | e2e/lead.spec.ts | Wave 1 A — activity child table |
| 8 | Duplicate lead detection | ❌ Not built | | Planned Wave 7 |
| 9 | Lead scoring formula | ✅ Built | e2e/data-builder.spec.ts | Wave 1 B — expression engine |
| 10 | Email a lead from CRM | ✅ Built | e2e/workflows.spec.ts | Wave 1 E |
| 11 | WhatsApp message to lead | ✅ Built | e2e/workflows.spec.ts | Wave 1 E |
| 12 | Bulk lead import via CSV | ✅ Built | e2e/import.spec.ts | Wave 4 O |

---

## Customer Management (10 features)

| # | Feature | Status | Test | Notes |
|---|---------|--------|------|-------|
| 13 | Create customer profile (company + contacts) | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 14 | Customer tier / category | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 15 | Credit limit field | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 16 | Outstanding balance computed field | ✅ Built | e2e/data-builder.spec.ts | Wave 1 B |
| 17 | Customer address (billing + shipping) | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 18 | GST number & PAN storage | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 19 | Customer payment terms | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 20 | Customer document attachments | ✅ Built | e2e/records.spec.ts | Wave 1 E — S3 file field |
| 21 | Customer statement (PDF) | ✅ Built | e2e/pdf.spec.ts | Wave 4 P |
| 22 | Customer portal access | ❌ Not built | | Planned Wave 7 |

---

## Quotation / Proposal (14 features)

| # | Feature | Status | Test | Notes |
|---|---------|--------|------|-------|
| 23 | Create quotation with line items | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 24 | Auto-number quotation (QT-YYYY-NNNN) | ✅ Built | e2e/records.spec.ts | Wave 1 B |
| 25 | Product/material lookup in line items | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 26 | Quantity, unit, rate, discount, tax fields | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 27 | Line-item subtotal formula | ✅ Built | e2e/data-builder.spec.ts | Wave 1 B |
| 28 | Quote total with GST | ✅ Built | e2e/data-builder.spec.ts | Wave 1 B |
| 29 | Quote validity / expiry date | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 30 | Quote status (Draft → Sent → Accepted → Rejected) | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 31 | Approval before sending quote | ✅ Built | e2e/approvals.spec.ts | Wave 2 G |
| 32 | Convert quote to sales order | ✅ Built | e2e/records.spec.ts | Wave 2 I |
| 33 | PDF export of quotation (GST layout) | ✅ Built | e2e/pdf.spec.ts | Wave 4 P |
| 34 | Email quote to customer | ✅ Built | e2e/workflows.spec.ts | Wave 1 E |
| 35 | WhatsApp quote to customer | ✅ Built | e2e/workflows.spec.ts | Wave 1 E |
| 36 | Quote version history | ❌ Not built | | Planned Wave 7 |

---

## Sales Order (13 features)

| # | Feature | Status | Test | Notes |
|---|---------|--------|------|-------|
| 37 | Create sales order manually | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 38 | Auto-number SO (SO-YYYY-NNNN) | ✅ Built | e2e/records.spec.ts | Wave 1 B |
| 39 | SO line items with product, qty, rate | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 40 | Delivery date per line item | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 41 | SO approval workflow | ✅ Built | e2e/approvals.spec.ts | Wave 2 G |
| 42 | Partial fulfilment tracking | ✅ Built | e2e/records.spec.ts | Wave 2 I |
| 43 | SO status (Open → Partial → Fulfilled → Closed) | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 44 | Link SO to production order | ✅ Built | e2e/records.spec.ts | Wave 2 H |
| 45 | SO PDF export | ✅ Built | e2e/pdf.spec.ts | Wave 4 P |
| 46 | SO amendment with reason | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 47 | Customer PO number field | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 48 | Advance payment capture on SO | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 49 | SO cancellation with approval | ✅ Built | e2e/approvals.spec.ts | Wave 2 G |

---

## Production & R&D (22 features)

| # | Feature | Status | Test | Notes |
|---|---------|--------|------|-------|
| 50 | Create production order from SO | ✅ Built | e2e/records.spec.ts | Wave 2 H |
| 51 | Bill of Materials (BOM) per product | ✅ Built | e2e/stock.spec.ts | Wave 2 H |
| 52 | BOM version control | ❌ Not built | | Planned Wave 7 |
| 53 | Production stages / routing | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 54 | Stage-wise completion tracking | ✅ Built | e2e/records.spec.ts | Wave 2 F |
| 55 | Quality check at each stage | ✅ Built | e2e/approvals.spec.ts | Wave 2 G |
| 56 | Scrap / rejection qty per stage | ✅ Built | e2e/stock.spec.ts | Wave 2 H |
| 57 | Machine / work-centre assignment | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 58 | Operator assignment per stage | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 59 | Raw material issue to production | ✅ Built | e2e/stock.spec.ts | Wave 2 H — stock OUT |
| 60 | Finished goods receipt from production | ✅ Built | e2e/stock.spec.ts | Wave 2 H — stock IN |
| 61 | Production order status (Planned → WIP → Done) | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 62 | Labour cost per stage | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 63 | Machine hour cost | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 64 | Overhead allocation formula | ✅ Built | e2e/data-builder.spec.ts | Wave 1 B |
| 65 | Total production cost summary | ✅ Built | e2e/data-builder.spec.ts | Wave 1 B |
| 66 | R&D formula card per compound | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 67 | Trial batch tracking | ✅ Built | e2e/stock.spec.ts | Wave 2 H |
| 68 | Approve formula before production | ✅ Built | e2e/approvals.spec.ts | Wave 2 G |
| 69 | Link approved formula to BOM | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 70 | Print production job card (PDF) | ✅ Built | e2e/pdf.spec.ts | Wave 4 P |
| 71 | Barcode scan for production stage | ✅ Built | | Wave 3 M |

---

## Inventory & Stock (20 features)

| # | Feature | Status | Test | Notes |
|---|---------|--------|------|-------|
| 72 | Product / material master | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 73 | Unit of measure (UOM) | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 74 | Stock IN movement (purchase receipt) | ✅ Built | e2e/stock.spec.ts | Wave 2 H |
| 75 | Stock OUT movement (issue / despatch) | ✅ Built | e2e/stock.spec.ts | Wave 2 H |
| 76 | Stock transfer between locations | ✅ Built | e2e/stock.spec.ts | Wave 2 H |
| 77 | Multi-location / warehouse support | ✅ Built | e2e/stock.spec.ts | Wave 2 H |
| 78 | Batch / lot number tracking | ✅ Built | e2e/stock.spec.ts | Wave 2 H |
| 79 | FIFO costing | ✅ Built | e2e/stock.spec.ts | Wave 2 H |
| 80 | Reorder level alerts | ✅ Built | e2e/workflows.spec.ts | Wave 2 F |
| 81 | Stock adjustment (physical count) | ✅ Built | e2e/stock.spec.ts | Wave 2 H |
| 82 | Opening stock entry | ✅ Built | e2e/stock.spec.ts | Wave 2 H |
| 83 | Goods receipt note (GRN) | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 84 | Delivery note / despatch advice | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 85 | Stock valuation report | ✅ Built | | Wave 2 H |
| 86 | Expiry date tracking | ✅ Built | e2e/stock.spec.ts | Wave 2 H |
| 87 | Barcode / QR on stock items | ✅ Built | | Wave 3 M |
| 88 | Label print for stock items | ✅ Built | | Wave 4 P — label printer |
| 89 | Negative stock prevention rule | ✅ Built | | Wave 1 C — RLS |
| 90 | Stock ledger view | ✅ Built | | Wave 2 H |
| 91 | CSV / Excel stock import | ✅ Built | e2e/import.spec.ts | Wave 4 O |

---

## Purchase (13 features)

| # | Feature | Status | Test | Notes |
|---|---------|--------|------|-------|
| 92 | Supplier / vendor master | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 93 | Purchase request (PR) | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 94 | PR approval workflow | ✅ Built | e2e/approvals.spec.ts | Wave 2 G |
| 95 | Convert PR to purchase order | ✅ Built | e2e/records.spec.ts | Wave 2 I |
| 96 | PO line items with product, qty, rate | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 97 | PO approval | ✅ Built | e2e/approvals.spec.ts | Wave 2 G |
| 98 | PO PDF export (GST layout) | ✅ Built | e2e/pdf.spec.ts | Wave 4 P |
| 99 | Email PO to supplier | ✅ Built | e2e/workflows.spec.ts | Wave 1 E |
| 100 | GRN against PO | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 101 | Partial delivery tracking on PO | ✅ Built | e2e/records.spec.ts | Wave 2 I |
| 102 | Supplier invoice vs PO matching | ❌ Not built | | Planned Wave 7 |
| 103 | Purchase return | ✅ Built | e2e/records.spec.ts | Wave 2 I |
| 104 | Supplier payment terms | ✅ Built | e2e/records.spec.ts | Wave 1 A |

---

## Finance & Accounting (18 features)

| # | Feature | Status | Test | Notes |
|---|---------|--------|------|-------|
| 105 | Sales invoice generation | ✅ Built | e2e/pdf.spec.ts | Wave 4 P |
| 106 | Auto-number invoice (INV-YYYY-NNNN) | ✅ Built | e2e/records.spec.ts | Wave 1 B |
| 107 | Tax (GST) calculation — CGST/SGST/IGST | ✅ Built | e2e/data-builder.spec.ts | Wave 1 B |
| 108 | Credit note | ✅ Built | e2e/records.spec.ts | Wave 2 I |
| 109 | Debit note | ✅ Built | e2e/records.spec.ts | Wave 2 I |
| 110 | Payment receipt recording | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 111 | Outstanding receivables view | ✅ Built | | Wave 1 B |
| 112 | Aging report | ❌ Not built | | Planned Wave 7 |
| 113 | Supplier payment recording | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 114 | Outstanding payables view | ✅ Built | | Wave 1 B |
| 115 | TDS deduction field | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 116 | Bank reconciliation | ❌ Not built | | Planned Wave 7 |
| 117 | Expense recording | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 118 | Expense approval | ✅ Built | e2e/approvals.spec.ts | Wave 2 G |
| 119 | Profit & Loss summary | ❌ Not built | | Planned Wave 7 |
| 120 | GST return data export | ❌ Not built | | Planned Wave 7 |
| 121 | E-way bill data fields | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 122 | Multi-currency support | ❌ Not built | | Planned Wave 7 |

---

## Dispatch & Logistics (10 features)

| # | Feature | Status | Test | Notes |
|---|---------|--------|------|-------|
| 123 | Dispatch order creation | ✅ Built | e2e/records.spec.ts | Wave 2 I |
| 124 | Vehicle / transporter assignment | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 125 | LR number / tracking ID | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 126 | Delivery confirmation (GPS / photo) | ✅ Built | | Wave 3 M |
| 127 | Proof of delivery upload | ✅ Built | | Wave 1 E — S3 |
| 128 | Dispatch PDF (delivery note) | ✅ Built | e2e/pdf.spec.ts | Wave 4 P |
| 129 | Freight / logistics cost capture | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 130 | Courier integration | ❌ Not built | | Planned Wave 7 |
| 131 | Dispatch status (Packed → Dispatched → Delivered) | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 132 | Return logistics (reverse pickup) | ✅ Built | e2e/records.spec.ts | Wave 2 I |

---

## HR & Payroll (14 features)

| # | Feature | Status | Test | Notes |
|---|---------|--------|------|-------|
| 133 | Employee master | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 134 | Department & designation | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 135 | Attendance tracking (daily) | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 136 | Leave request & approval | ✅ Built | e2e/approvals.spec.ts | Wave 2 G |
| 137 | Leave balance computed field | ✅ Built | e2e/data-builder.spec.ts | Wave 1 B |
| 138 | Salary structure (basic, HRA, allowances) | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 139 | Monthly payroll run | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 140 | PF / ESI deduction formula | ✅ Built | e2e/data-builder.spec.ts | Wave 1 B |
| 141 | Payslip PDF export | ✅ Built | e2e/pdf.spec.ts | Wave 4 P |
| 142 | Advance salary request | ✅ Built | e2e/approvals.spec.ts | Wave 2 G |
| 143 | Overtime calculation | ✅ Built | e2e/data-builder.spec.ts | Wave 1 B |
| 144 | Termination / exit process | ✅ Built | e2e/records.spec.ts | Wave 1 A |
| 145 | Employee document upload | ✅ Built | | Wave 1 E — S3 |
| 146 | Biometric attendance import | ❌ Not built | | Planned Wave 7 |

---

## User & Access Management (8 features)

| # | Feature | Status | Test | Notes |
|---|---------|--------|------|-------|
| 147 | User invite by email | ✅ Built | e2e/auth.spec.ts | Wave 0 / Wave 1 C |
| 148 | Role-based access control (RBAC) | ✅ Built | e2e/auth.spec.ts | Wave 1 C |
| 149 | Per-table row-level security | ✅ Built | | Wave 1 C |
| 150 | Field-level visibility rules | ✅ Built | | Wave 1 C |
| 151 | Custom roles per app | ✅ Built | | Wave 1 C |
| 152 | Audit log (who changed what) | ✅ Built | e2e/records.spec.ts | Wave 0 |
| 153 | Session / device management | ❌ Not built | | Planned Wave 7 |
| 154 | 2FA / OTP login | ❌ Not built | | Planned Wave 7 |

---

## Notifications & Communication (8 features)

| # | Feature | Status | Test | Notes |
|---|---------|--------|------|-------|
| 155 | Email notification on record create | ✅ Built | e2e/workflows.spec.ts | Wave 2 F + Wave 1 E |
| 156 | Email notification on status change | ✅ Built | e2e/workflows.spec.ts | Wave 2 F |
| 157 | WhatsApp notification on approval | ✅ Built | e2e/workflows.spec.ts | Wave 1 E |
| 158 | In-app notification bell | ❌ Not built | | Planned Wave 7 |
| 159 | SMS notification | ❌ Not built | | Planned Wave 7 |
| 160 | Scheduled digest email | ✅ Built | e2e/workflows.spec.ts | Wave 2 F |
| 161 | Attachment in email (PDF) | ✅ Built | e2e/workflows.spec.ts | Wave 1 E + Wave 4 P |
| 162 | Template-based WhatsApp messages | ✅ Built | e2e/workflows.spec.ts | Wave 1 E |

---

## Reporting & Analytics (12 features)

| # | Feature | Status | Test | Notes |
|---|---------|--------|------|-------|
| 163 | Tabular report with filters | ✅ Built | e2e/records.spec.ts | Wave 3 L |
| 164 | Group-by and aggregation | ✅ Built | | Wave 3 L |
| 165 | Bar / line / pie charts | ✅ Built | | Wave 3 L |
| 166 | KPI summary tiles | ✅ Built | | Wave 3 L |
| 167 | Date-range filter on reports | ✅ Built | e2e/records.spec.ts | Wave 3 L |
| 168 | Export report to Excel / CSV | ✅ Built | e2e/records.spec.ts | Wave 4 O |
| 169 | Scheduled report email | ✅ Built | e2e/workflows.spec.ts | Wave 2 F |
| 170 | BigQuery data source | ✅ Built | | Wave 4 O |
| 171 | Google Sheets data source | ✅ Built | | Wave 4 O |
| 172 | Dashboard page with multiple charts | ✅ Built | | Wave 3 L |
| 173 | Drill-down from chart to records | ❌ Not built | | Planned Wave 7 |
| 174 | AI-generated report summary | ✅ Built | | Wave 5 R |

---

## App Builder & Platform (22 features)

| # | Feature | Status | Test | Notes |
|---|---------|--------|------|-------|
| 175 | Drag-and-drop page canvas | ✅ Built | e2e/data-builder.spec.ts | Wave 3 K |
| 176 | Component palette (40+ components) | ✅ Built | e2e/data-builder.spec.ts | Wave 3 K |
| 177 | Property panel for components | ✅ Built | | Wave 3 K |
| 178 | Action chain editor | ✅ Built | | Wave 3 K |
| 179 | Formula / expression editor | ✅ Built | e2e/data-builder.spec.ts | Wave 1 B |
| 180 | Data table component | ✅ Built | | Wave 3 L |
| 181 | Kanban board component | ✅ Built | | Wave 3 L |
| 182 | Calendar component | ✅ Built | | Wave 3 L |
| 183 | Form component with validation | ✅ Built | | Wave 3 K |
| 184 | Barcode scanner component | ✅ Built | | Wave 3 M |
| 185 | Camera capture component | ✅ Built | | Wave 3 M |
| 186 | GPS location component | ✅ Built | | Wave 3 M |
| 187 | Offline mode (PWA) | ✅ Built | | Wave 3 M |
| 188 | Custom component SDK | ✅ Built | | Wave 5 T |
| 189 | Tenant scripts SDK | ✅ Built | | Wave 5 S |
| 190 | AI app generator (prompt → app) | ✅ Built | | Wave 5 R |
| 191 | App versioning | ✅ Built | | Wave 4 Q |
| 192 | App export / import (JSON bundle) | ✅ Built | | Wave 4 Q |
| 193 | App lifecycle (dev → staging → prod) | ✅ Built | | Wave 4 Q |
| 194 | REST API connector | ✅ Built | | Wave 4 O |
| 195 | PDF template designer | ✅ Built | e2e/pdf.spec.ts | Wave 4 P |
| 196 | Multi-tenant isolation | ✅ Built | | Wave 1 C |
| 197 | White-label / branding per tenant | ❌ Not built | | Planned Wave 7 |

---

## Summary

| Category | Total | ✅ Built | ❌ Not built |
|----------|-------|----------|-------------|
| Lead Management | 12 | 11 | 1 |
| Customer Management | 10 | 9 | 1 |
| Quotation / Proposal | 14 | 13 | 1 |
| Sales Order | 13 | 13 | 0 |
| Production & R&D | 22 | 20 | 2 |
| Inventory & Stock | 20 | 20 | 0 |
| Purchase | 13 | 12 | 1 |
| Finance & Accounting | 18 | 12 | 6 |
| Dispatch & Logistics | 10 | 9 | 1 |
| HR & Payroll | 14 | 13 | 1 |
| User & Access Management | 8 | 6 | 2 |
| Notifications & Communication | 8 | 6 | 2 |
| Reporting & Analytics | 12 | 11 | 1 |
| App Builder & Platform | 22 | 20 | 2 |
| **TOTAL** | **197** | **175** | **22** |

22 features remain unbuilt — all queued for Wave 7.
