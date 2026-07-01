# API Integration Tasks

## Currently mocked — backend is ready

| # | Task | Status |
|---|------|--------|
| 1 | Dashboard — `GET /dashboard?week=` | ✅ Done |
| 2 | Board — `GET /board` + WebSocket (`ws/boards/:id`) | ⏳ Not started |
| 3 | Gross Revenue Matrix — `GET /gross` + `PATCH /gross` | ✅ Done |
| 4 | Payouts — `GET /payouts` + `PATCH /payouts/:id` | ✅ Done |
| 5 | Billing reads — plans, billing, invoices | ✅ Done |
| 6 | CSV Import — `POST /{drivers,trucks,trailers}/import` multipart | ⏳ Not started |
| 10 | AI Smart Extract — `POST /loads/extract` | ⏳ Not started |

## Not wired at all

| # | Task | Status |
|---|------|--------|
| 7 | Teams Settings tab — full CRUD | ✅ Done |
| 8 | Notifications bell — `GET /notifications`, `PATCH /:id`, `POST /read-all` | ✅ Done |
| 9 | Comments — `GET/POST /board/comments` per entity | ⏳ Not started |
| 11 | Per-team board — `GET /board?team_id=` (filter snapshot rows client-side) | 🔒 Blocked by #2 |
| 16 | Board history panel — `GET /board/history` (company-wide, live badge) | ⏳ Not started |
| 17 | Per-entity change log — `GET /board/history?entity_type=&entity_id=` (load + driver detail) | ⏳ Not started |
| 18 | History revert — `POST /board/history/:id/revert` then `PUT` entity | 🔒 Blocked by #17 |
| 19 | Edit locks — `GET/POST/DELETE /board/locks` + presence indicators | 🔒 Blocked by #2 |

## Already done / confirmed wired

| # | Task | Status |
|---|------|--------|
| 12 | `dispatcher_id` on loads | ✅ Done |
| 13 | Driver load queue (`next_load_id`, `current_load`, `next_load`) | ✅ Done |
| 14 | Load completion → driver refetch | ✅ Done |
| 15 | `pickup_appt` date format fix | ✅ Done |
| 20 | Load `miles` field — in form, table, RPM calc | ✅ Done |
| 21 | Account switcher — `GET /owner/accounts` | ✅ Done |
| 22 | Server-side filtering — `?q=&status=` on drivers, `?q=&status=&driver_id=` on loads | ✅ Done |

## Bug fixes (not on original list)

| Task | Status |
|------|--------|
| LoadsPage edit — destination/stops not sent correctly | ✅ Fixed |
| DriversPage edit — truck/trailer missing from PUT payload | ✅ Fixed |
| BillingPage invoices — wrong field names (date/plan/amount vs plan_name/amount_paid) | ✅ Fixed |

## Remaining: 2, 6, 8, 9, 10, 16 (then 11, 17, 18, 19 unblock)
