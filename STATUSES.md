# Driver / Load Statuses

Shared across: **Drivers**, **Loads**, **Gross Matrix**, **Board**

Source of truth: `src/lib/statuses.ts`

| Key          | Label      | Background | Text      | Meaning |
|--------------|------------|------------|-----------|---------|
| `re_update`  | Re-Update  | `#EF4444`  | white     | Needs attention / info missing |
| `ready`      | Ready      | `#10B981`  | white     | Driver available, no active load |
| `covered`    | Covered    | `#8B5CF6`  | white     | Load or shift is covered |
| `dispatched` | Dispatched | `#F59E0B`  | dark      | Assigned to a load, not yet moving |
| `enroute`    | Enroute    | `#3B82F6`  | white     | Currently driving |
| `delivered`  | Delivered  | `#06B6D4`  | white     | Load dropped off, awaiting confirmation |
| `completed`  | Completed  | `#22C55E`  | dark      | Load fully completed and closed |
| `reserved`   | Reserved   | `#6366F1`  | white     | Pre-booked / held |
| `rest`       | Rest       | `#D1D5DB`  | dark gray | Off duty / resting |
| `shop`       | Shop       | `#F97316`  | white     | Vehicle in maintenance / shop |
| `home`       | Home       | `#64748B`  | white     | Driver is at home |

## Gross Matrix — Day Cells

Day cells have two modes:
- **Status cell** — one of the statuses above (no monetary value)
- **Load cell** — special type that shows `$amount` + `loadId`; used when a driver ran a load that day

## Usage

```ts
import { Status, STATUS_CONFIG, ALL_STATUSES } from "@/lib/statuses";

// Get label + colors for a status
const { label, bg, color } = STATUS_CONFIG["enroute"];

// Iterate all statuses (e.g. for a dropdown)
ALL_STATUSES.forEach((s) => { ... });
```
