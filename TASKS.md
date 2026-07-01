# API Integration Tasks

## Currently mocked — backend is ready

| # | Task | Status |
|---|------|--------|
| 1 | Dashboard — `GET /dashboard?week=` | ✅ Done |

| 2 | Board — `GET /board` + WebSocket, history, locks | Not started |
| 3 | Gross Revenue Matrix — `GET /gross` + `PATCH /gross` | ✅ Done |
| 4 | Payouts — `GET /payouts` + `PATCH /payouts/:id` | ✅ Already done |
| 5 | Billing reads — plans, billing, invoices | Not started |
| 6 | CSV Import — multipart file upload | Not started |

## Not wired at all

| # | Task | Status |
|---|------|--------|
| 7 | Teams Settings tab — full CRUD | ✅ Done |
| 8 | Notifications bell — fetch, mark read | Not started |
| 9 | Comments — `GET/POST /board/comments` | Not started |
| 10 | AI Smart Extract — `POST /loads/extract` | Not started |
| 11 | Per-team board — `GET /board?team_id=` | Depends on #2 |

## Partial / needs a fix

| # | Task | Status |
|---|------|--------|
| 12 | `dispatcher_id` on loads | ✅ Already done |
| 13 | Driver load queue (`next_load_id`) | ✅ Done |
| 14 | Load completion → driver refetch | ✅ Already handled |
| 15 | `pickup_appt` date format fix | ✅ Done |

## Bug fixes (not on original list)

| Task | Status |
|------|--------|
| LoadsPage edit — destination/stops not sent correctly | ✅ Fixed |
| DriversPage edit — truck/trailer missing from PUT payload | ✅ Fixed |

## Remaining: 2, 5, 6, 8, 9, 10, 11
