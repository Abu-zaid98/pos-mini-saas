# POS & Debt Management App — Master Implementation Plan

## Project Overview

A mobile-first PWA (Progressive Web App) for a small retail store. Built to run offline on a single phone, with Arabic RTL interface, barcode scanning via camera, and full debt tracking per customer. No native app store required — installs directly from the browser.

---

## Tech Stack (Final Decisions)

| Layer | Choice | Reason |
|---|---|---|
| Framework | React 19 + TypeScript | Component model, performance, type safety |
| Styling | Tailwind CSS v4 | RTL-ready, no custom CSS needed |
| Local DB | Dexie.js (IndexedDB) | High performance, offline-first, real DB in browser |
| PWA | Vite PWA Plugin + Workbox | Install on phone, works without internet |
| Barcode | @zxing/browser | Works with Android + iPhone camera |
| Backup (Phase 3) | Local JSON export first, then Google Drive | Progressive, safe |
| Sync (Phase 4+) | Supabase — optional | Only if multi-device needed |
| Language | Arabic RTL — full | `dir="rtl"` from root |
| Font | IBM Plex Sans Arabic or Cairo | Clear on small screens |
| Currency | Israeli Shekel ₪ | Format always: `X.XX ₪` |

---

## Database Schema (Dexie / IndexedDB)

### `products`
```
id          auto        primary key
barcode     string      indexed — fast lookup
name        string      product name
salePrice   number      selling price in ILS
costPrice   number      cost price — for profit calculation
quantity    number      current stock count
lowStockAlert number   alert threshold (default: 5)
category    string      optional category label
createdAt   Date
updatedAt   Date
```

### `customers`
```
id          auto        primary key
name        string      customer name
phone       string      optional — for WhatsApp statement sharing
totalDebt   number      auto-aggregated from invoices
createdAt   Date
```

### `invoices`
```
id          auto        invoice number
customerId  number|null null = anonymous cash sale
items       JSON array  [{productId, name, qty, price}]
subtotal    number      before discount
discount    number      discount amount in ILS
total       number      subtotal - discount
paidAmount  number      amount actually paid
debtAmount  number      total - paidAmount
paymentType string      'cash' | 'debt' | 'partial'
note        string      optional
createdAt   Date
```

### `payments`
```
id          auto        primary key
customerId  number      indexed
invoiceId   number|null null = general account payment
amount      number      amount paid
note        string      optional
createdAt   Date
```

### `settings`
```
key         string      primary key
value       any
```
Stores: `passwordHash`, `storeName`, `ownerName`, `currency`, `lastBackupAt`

---

## File Structure

```
src/
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx          # main layout wrapper
│   │   └── BottomNav.tsx         # 5-icon bottom nav for mobile
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Modal.tsx
│   │   ├── Badge.tsx
│   │   └── CurrencyDisplay.tsx   # always renders: X.XX ₪
│   ├── products/
│   ├── sales/
│   ├── customers/
│   ├── reports/
│   └── settings/
├── db/
│   └── db.ts                     # full Dexie schema definition
├── hooks/
│   ├── useProducts.ts
│   ├── useInvoices.ts
│   ├── useCustomers.ts
│   └── useCamera.ts              # barcode reading hook
├── pages/
│   ├── SalePage.tsx              # main screen
│   ├── ProductsPage.tsx
│   ├── CustomersPage.tsx
│   ├── DebtPage.tsx
│   └── ReportsPage.tsx
├── utils/
│   ├── currency.ts               # formatCurrency(3) → "3.00 ₪"
│   ├── backup.ts                 # JSON export / import
│   └── auth.ts                   # password hashing (no plaintext)
└── main.tsx
```

---

## Implementation Phases

---

### Phase 0 — Foundation & Infrastructure
**Duration:** 1 day  
**Goal:** Full dev environment, renders in browser, installable as PWA

#### What gets built:
- React + TypeScript + Tailwind v4 + Vite project scaffold
- Full RTL setup (`dir="rtl"` + `lang="ar"` from root)
- `vite-plugin-pwa` + `manifest.json` (icons, name, theme color)
- Dexie setup — `db.ts` with all tables defined
- Login screen with locally-hashed password (no plaintext storage)
- `AppShell` + `BottomNav` (5 icons: Sale / Products / Customers / Reports / Settings)
- `formatCurrency` utility + `CurrencyDisplay` component

#### Required from you before this phase:
> **Nothing — starts immediately.**

#### Deliverable:
Empty app opens in browser, asks for password, can be installed on phone via "Add to Home Screen".

---

### Phase 1 — Product Management
**Duration:** 2–3 days  
**Goal:** Add, edit, delete products. Scan barcodes with phone camera.

#### What gets built:
- Product list page (search, filter by category, show quantity + price)
- Add/edit product form
- Barcode scanning via phone camera (`@zxing/browser`)
- Manual barcode input as fallback
- Low stock warning badge

#### Required from you before this phase:

**1. A list of 5–10 real products in this format:**
```
Name | Barcode (if exists) | Sale Price | Cost Price | Current Quantity
```
Example:
```
Lays Large | 6281004016986 | 3.50 | 2.00 | 24
```
Needed to test that search and barcode lookup work correctly on your actual inventory.

**2. Answers to:**
- Do most of your products have printed barcodes? (yes / no / some)
- Do you want to track stock quantities from day one? (yes / no)
- Do you want to categorize products? (yes / no — if yes, list your category names)

#### Deliverable:
Add a product manually or by scanning barcode. See remaining stock count.

---

### Phase 2 — Sales & Invoices
**Duration:** 3–5 days  
**Goal:** Complete a full sale — cash, debt, or partial payment.

#### What gets built:
- Sale screen: add items to cart by search or barcode scan
- Subtotal + discount calculation
- Payment type selector: Cash / Debt / Partial
- Customer selector when selling on debt
- Save invoice → auto-decrement stock quantity
- Invoice detail view + share as text

#### Required from you before this phase:

**1. Partial payment decision:**
Do you want a screen like this?
```
Total:        50.00 ₪
Paid (cash):  [    ] ₪
Remaining as debt: 20.00 ₪  ← auto-calculated
```
Answer: yes / no

**2. Discount decision:**
- Percentage discount (e.g. 10%)?
- Fixed amount (e.g. deduct 5 ₪)?
- Both options available?
- No discount feature?

**3. WhatsApp invoice sharing:**
Do you want a "Share via WhatsApp" button on the invoice? (yes / no)

#### Deliverable:
Full sale flow. Invoice saved to DB. Stock quantity auto-decremented.

---

### Phase 3 — Customer & Debt Management
**Duration:** 3–4 days  
**Goal:** Track debt and payments per customer.

#### What gets built:
- Customer list with current debt balance per customer
- Customer profile: full invoice and payment history
- Record a new payment (full or partial)
- Filter: All / Has Debt / Settled
- Share account statement via WhatsApp or plain text

#### Required from you before this phase:

**1. Existing customers with debt (if any):**
If you already have customers with outstanding balances, provide them in this format so we can seed the data:
```
Customer Name | Phone (optional) | Current Debt ₪
```

**2. Account statement format:**
What should the message sent to the customer look like? Example:
```
Account Statement — Ahmad Abu Ali
📅 01/09/2026

Invoice #12 — 45.00 ₪ (25.00 ₪ paid)
Invoice #15 — 30.00 ₪ (unpaid)

💰 Total Owed: 50.00 ₪
```
Confirm this format or describe what you want changed.

#### Deliverable:
Full debt tracking per customer. Payment history. WhatsApp statement sharing.

---

### Phase 4 — Reports
**Duration:** 2–3 days  
**Goal:** See sales numbers and profit at a glance.

#### What gets built:
- Daily report: today's sales, today's profit, invoice count
- Weekly / monthly view with same structure
- Top selling products
- Customers with highest outstanding debt
- Out-of-stock and low-stock alerts

#### Required from you before this phase:

**Only one decision:**
Do you want reports as **charts** (bar/line graphs) or **number tables** only?

#### Deliverable:
Full reports dashboard — sales, profit, debt overview.

---

### Phase 5 — Backup & Settings
**Duration:** 1–2 days  
**Goal:** Protect data from loss. Configure the app.

#### What gets built:
- Export all data as a single JSON file ("Backup Now" button)
- Import/restore from a backup file
- Auto-reminder: "Last backup was X days ago"
- Settings page: store name, password change, currency display
- (Optional) Auto-upload backup to Google Drive

#### Required from you before this phase:

**Only if you want Google Drive integration:**
You will need to create a Google Cloud Project and enable the Drive API — a 15-minute setup I will walk you through step by step. If you prefer manual file backup only → nothing needed.

#### Deliverable:
Fully working app ready for real daily use.

---

## Decisions Required Before Any Coding Starts

Answer these 7 questions and Phase 0 begins immediately:

| # | Question | Options |
|---|---|---|
| 1 | Track stock quantities from day one? | yes / no |
| 2 | Discount on invoices? | percentage / fixed amount / both / none |
| 3 | Partial payment support? | yes / no |
| 4 | Single device or multi-device? | phone only / phone + computer |
| 5 | Share invoice via WhatsApp? | yes / no |
| 6 | Product categories? | yes / no |
| 7 | What is the store name? | (type it) |

---

## What Is Intentionally Excluded from v1

These features are deferred — added later only if real usage proves they're needed:

- Bluetooth thermal receipt printing
- Real-time multi-device sync (Supabase)
- Multi-cashier permissions and audit log
- Loyalty points / rewards program
- Multi-branch support
- Tax / VAT accounting
- Complex inventory units (case → box → piece conversions)

---

## Phase Dependency Map

```
Phase 0  →  requires: nothing          → start immediately
Phase 1  →  requires: product list + category/quantity decisions
Phase 2  →  requires: discount + partial payment + WhatsApp decisions
Phase 3  →  requires: existing customer debt list + statement format
Phase 4  →  requires: charts vs tables decision
Phase 5  →  requires: Google Drive vs manual backup decision
```

Each phase produces a working, testable build before the next begins.

---

## Key Implementation Notes

### RTL
- `dir="rtl"` and `lang="ar"` set at `<html>` root
- All icons that imply direction (back arrow, chevrons) must be mirrored for RTL
- Font: IBM Plex Sans Arabic or Cairo — loaded via Google Fonts

### Currency
- All amounts stored as plain numbers in ILS (e.g. `3.5`)
- All display goes through `formatCurrency(n)` → `"3.50 ₪"`
- User input always uses Western numerals `0–9` for speed

### Password / Auth
- Password stored as `bcrypt` hash with salt — never plaintext
- Local password guards the app UI only
- Device lock is the second layer of security

### Offline Behavior
- App works fully offline after first install (PWA cache)
- Camera / barcode scanning works offline after permission granted
- Backup and sync require internet — triggered manually or on app open

### Backup Strategy (v1)
- Manual trigger: "Backup Now" button
- Auto-prompt on app open if last backup > 3 days ago
- Export = single JSON file downloaded to device
- Restore = pick JSON file from device storage

---

*Last updated: September 2026*
