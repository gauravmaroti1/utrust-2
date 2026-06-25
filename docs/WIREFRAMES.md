# UI / Screen Reference

U TRUST 2.0 uses a fixed left sidebar (role-filtered navigation) and a top header (current branch, dark-mode toggle, user, logout). Brand colour is Prakash red `#C8102E` on an ink `#1f2937` sidebar. The same nav items appear or hide based on role.

```
┌────────────┬──────────────────────────────────────────────┐
│ U TRUST 2.0│  [branch]            🌙  Name / Role  Logout  │
│ Prakash    ├──────────────────────────────────────────────┤
│ Auto Hub   │                                              │
│            │                                              │
│ 📊 Dashboard│            PAGE CONTENT                       │
│ 🚗 Stock    │                                              │
│ 📈 Productiv│                                              │
│ 💰 Valuation│                                              │
│ 📝 Proposals│                                              │
│ 🧾 Quotation│                                              │
│ 📉 Analytics│                                              │
│ 👥 Users    │                                              │
│ ⚙️  Config  │                                              │
└────────────┴──────────────────────────────────────────────┘
```

## Navigation by role

| Item | SUPER_ADMIN | BRANCH_MANAGER | EVALUATOR | SALES_EXECUTIVE |
|------|:--:|:--:|:--:|:--:|
| Dashboard | ✓ | ✓ | ✓ | ✓ |
| Stock | ✓ | ✓ | ✓ | ✓ |
| Productivity | ✓ | ✓ | ✓ | |
| Valuation | ✓ | ✓ | ✓ | |
| Proposals | ✓ | ✓ | ✓ | |
| Quotations | ✓ | ✓ | | ✓ |
| Analytics | ✓ | ✓ | | |
| Users | ✓ | | | |
| Valuation Config | ✓ | | | |

---

## Screens

**Login** — centered branded card, email + password, demo-account hints.

**Dashboard** — KPI cards (total stock, stock value, avg ageing, dead stock) + ageing-threshold cards; branch-wise stock; status breakdown; oldest-stock table. Ageing > 90 days shown in red.

**Stock** — search + status filter; Export / Import-Excel / Add Vehicle actions; table (vehicle, reg, year, km, branch, age, cost, ask, status). Row → detail modal with full specs, refurbishment lines (add line), status change (sold price when SOLD), edit.

**Productivity** — tabs:
- *My Daily Report* — counters form (upsert by date) + my recent reports.
- *Leaderboard* — week/month/all, medals, score & conversion %.
- *Team Reports* (manager/admin) — date-range table.

**Valuation** — left: inputs (brand/model, year, km, owners, fuel, accident, service, insurance, demand, condition sliders). Right: live result — suggested purchase (large), retail band (min / recommended / max), calculation breakdown, Save Evaluation.

**Proposals** — table (vehicle, evaluator, branch, purchase, refurb, resale, margin, ROI, status, actions). Create modal with live margin/ROI preview. Inline Approve/Reject at the manager and admin stages.

**Quotations** — table (customer, vehicle, asking, offer, by, date) with WhatsApp + PDF per row. Create modal auto-fills asking price from the chosen vehicle.

**Analytics** — KPI cards (units sold, revenue, avg days to sale, branches) + charts: ageing distribution (bar), stock by branch (horizontal bar), make mix (pie), trade-in vs out trend (line); evaluator performance table.

**Users** (admin) — table with active toggle; create/edit modal (role + branch, optional password reset).

**Valuation Config** (admin) — core parameters, condition weights, six adjustment-map cards, and an editable model-benchmark grid; Save persists the JSON.

---

## Conventions

- **Status colours** — IN_STOCK blue, READY_FOR_SALE green, UNDER_REFURBISHMENT amber, RESERVED purple, SOLD/DELIVERED grey; proposal PENDING amber/orange, APPROVED green, REJECTED red.
- **Currency** — Indian formatting (`₹` + en-IN grouping).
- **Dark mode** — toggle in header, persisted to localStorage.
- **Responsive** — sidebar collapses to a hamburger on mobile; tables scroll horizontally.
