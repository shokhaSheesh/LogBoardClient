# Design System — Log Board Admin

Reference document for matching design, style, and colors across projects.

---

## Typography

| Token | Value |
|---|---|
| Font family | `Inter` (Google Fonts), fallback: `system-ui, sans-serif` |
| Base size | `16px` |
| Weight normal | `400` |
| Weight medium | `500` |
| Weight semibold | `600` |
| Weight bold | `700` |

Font import:
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
```

Typical font sizes in use:
- Page section labels / category headers: `0.65rem` uppercase, `600`, `letter-spacing: 0.08em`, `opacity: 0.45`
- Table / body text: `0.82rem` – `0.85rem`
- Small labels / badges: `0.65rem` – `0.7rem`
- Buttons: `0.875rem` (`text-sm`)
- Sidebar nav items: `0.85rem`

---

## Color Palette

### Core Tokens (Light Mode)

| Token | Hex | Usage |
|---|---|---|
| `--background` | `#F9FAFB` | Page background |
| `--foreground` | `#111827` | Primary text |
| `--card` | `#ffffff` | Card / panel background |
| `--card-foreground` | `#111827` | Text on cards |
| `--primary` | `#2563EB` | Brand blue — buttons, active states, links |
| `--primary-foreground` | `#ffffff` | Text on primary |
| `--secondary` | `#EFF6FF` | Light blue tint — secondary buttons |
| `--secondary-foreground` | `#1D4ED8` | Text on secondary |
| `--muted` | `#F3F4F6` | Subtle backgrounds — inputs, toolbars |
| `--muted-foreground` | `#6B7280` | Placeholder / secondary text |
| `--accent` | `#DBEAFE` | Hover tint on ghost elements |
| `--accent-foreground` | `#1D4ED8` | Text on accent |
| `--destructive` | `#DC2626` | Danger / delete actions |
| `--destructive-foreground` | `#ffffff` | Text on destructive |
| `--border` | `#E5E7EB` | Default borders and dividers |
| `--input-background` | `#F9FAFB` | Input field fill |
| `--ring` | `#93C5FD` | Focus ring color |

### Sidebar Tokens

| Token | Hex | Usage |
|---|---|---|
| `--sidebar` | `#0F172A` | Sidebar background (dark navy) |
| `--sidebar-foreground` | `#CBD5E1` | Default nav text |
| `--sidebar-primary` | `#2563EB` | Active nav item background |
| `--sidebar-primary-foreground` | `#ffffff` | Active nav item text |
| `--sidebar-accent` | `#1E293B` | Hover / user card background |
| `--sidebar-accent-foreground` | `#F1F5F9` | Text in accent areas |
| `--sidebar-border` | `rgba(255,255,255,0.06)` | Subtle sidebar dividers |
| `--sidebar-ring` | `#3B82F6` | Sidebar focus ring |

### Border Radius

| Token | Value |
|---|---|
| `--radius` (lg) | `0.5rem` (8px) |
| `--radius-md` | `calc(0.5rem - 2px)` = 6px |
| `--radius-sm` | `calc(0.5rem - 4px)` = 4px |
| `--radius-xl` | `calc(0.5rem + 4px)` = 12px |

Avatars and logo marks use `rounded-xl` (12px) or `rounded-full`.

---

## Semantic Colors (Status & Plan Badges)

### Status

| Status | Dot color | Text color |
|---|---|---|
| Active | `#22C55E` | `#15803D` |
| Pending | `#F59E0B` | `#B45309` |
| Suspended | `#EF4444` | `#B91C1C` |

Badge pattern: small colored dot + text, no background pill on status.

### Subscription Plans

| Plan | Background | Text |
|---|---|---|
| Enterprise | `#EFF6FF` | `#2563EB` |
| Professional | `#F5F3FF` | `#7C3AED` |
| Starter | `#ECFDF5` | `#059669` |
| Basic | `#FFF7ED` | `#C2410C` |

### Chart Colors

| Series | Hex |
|---|---|
| Companies / Brand blue | `#2563EB` |
| Drivers | `#8B5CF6` (violet) |
| Loads | `#10B981` (emerald) |
| Subscription: Enterprise | `#2563EB` |
| Subscription: Professional | `#8B5CF6` |
| Subscription: Starter | `#10B981` |
| Subscription: Basic | `#F59E0B` |

### Avatar Gradient

User avatars use a diagonal gradient:
```css
background: linear-gradient(135deg, #3B82F6, #6366F1);
```

---

## Layout

### Shell

```
┌─────────────────────────────────────────────────┐
│  Sidebar (w-16 collapsed / w-64 expanded)        │
│  + TopHeader (h-16)                             │
│  + Main content area (flex-1, overflow-y-auto)  │
└─────────────────────────────────────────────────┘
```

- Sidebar transition: `transition-[width] duration-300 ease-in-out`
- TopHeader: `height: 64px`, white background, `1px solid var(--border)` bottom
- Content padding: typically `p-6` or `px-6 py-5`

### Sidebar

- Background: `#0F172A` (dark navy)
- Header section: logo mark + app name, `border-b` with `var(--sidebar-border)`
- Logo mark: `36×36px`, `rounded-xl`, `background: var(--sidebar-primary)` with white icon
- Nav section label: `0.65rem`, uppercase, `letter-spacing: 0.08em`, `opacity: 0.45`
- Nav items: `rounded-lg`, `px-3 py-2.5`, active = `#2563EB` bg + white text, hover = `var(--sidebar-accent)`
- Active nav item has a `ChevronRight` icon at the end at `opacity: 0.6`
- User profile card at bottom: `rounded-xl`, `p-3`, `bg: var(--sidebar-accent)`

### TopHeader

- White background, `1px` bottom border
- Left: hamburger toggle + breadcrumb
- Right: search bar (`min-width: 220px`, rounded, muted bg) + bell icon + avatar
- Breadcrumb separator: `ChevronRight` at `opacity: 0.5`
- Inactive crumbs: `var(--muted-foreground)` / active crumb: `var(--foreground)`, `font-weight: 600`

---

## Components

### Button

Built with `cva`. Base classes include `rounded-md text-sm font-medium transition-all`.

| Variant | Style |
|---|---|
| `default` | `bg-primary text-white hover:bg-primary/90` |
| `destructive` | `bg-destructive text-white hover:bg-destructive/90` |
| `outline` | `border bg-background hover:bg-accent` |
| `secondary` | `bg-secondary text-secondary-foreground` |
| `ghost` | `hover:bg-accent hover:text-accent-foreground` |
| `link` | `text-primary underline-offset-4 hover:underline` |

| Size | Height |
|---|---|
| `sm` | `h-8` (32px) |
| `default` | `h-9` (36px) |
| `lg` | `h-10` (40px) |
| `icon` | `size-9` (36×36px) |

### Input

- Height: `h-9` (36px)
- Background: `#F9FAFB` (var input-background)
- Border: `1px solid var(--border)`, `rounded-md`
- Focus: `border-ring`, `ring-ring/50`, `ring-[3px]`
- Placeholder: `var(--muted-foreground)`

### FilterTabs (pill-style)

- Inactive: transparent bg, `1.5px solid var(--border)`, text `var(--muted-foreground)`
- Active: `bg: #2563EB`, `border: #2563EB`, text white, `font-weight: 600`
- Shape: `rounded-full`, `px-3.5 py-1.5`
- Count badge inside: `rounded-full px-1.5 py-0.5`, active = `rgba(255,255,255,0.22)` / inactive = `var(--muted)`
- Hover (inactive): border turns `#93C5FD`, text turns `#2563EB`

### Cards / Panels

- Background: `#ffffff` (`var(--card)`)
- Border: `1px solid var(--border)` or `1px solid #E5E7EB`
- Border radius: `0.75rem` or `rounded-xl` (12px)
- Shadow (tooltip / dropdown): `0 8px 24px rgba(0,0,0,0.10)` or `0 4px 12px rgba(0,0,0,0.1)`
- Padding: typically `p-5` or `p-6`

### Stat / KPI Cards

- White card, `rounded-xl`, `border: 1px solid var(--border)`
- Icon wrapper: `rounded-xl`, `w-10 h-10`, brand-colored background (e.g. `#EFF6FF` with blue icon)
- Sparkline chart: `88×36px` inline LineChart, no dots, `strokeWidth: 2`
- Large number: `text-2xl font-bold #111827`
- Sub-label: `0.75rem`, `var(--muted-foreground)`

### Dropdown / Select

- Background: `var(--card)`, `border: 1px solid var(--border)`, `rounded-lg`
- Shadow: `0 4px 12px rgba(0,0,0,0.1)`
- Items: `py-1.5 px-3.5`, hover = `var(--muted)` bg
- Active item: `var(--accent)` bg, `var(--primary)` text, `font-weight: 600`
- Trigger button: `var(--muted)` bg, `border: 1px solid var(--border)`, `rounded-lg`, `px-2.5 py-1.5`

### Tables

- Header row: `var(--muted)` background, `0.7rem` uppercase text, `font-weight: 600`, `var(--muted-foreground)`, `letter-spacing: 0.04em`
- Body rows: white, `border-b: 1px solid var(--border)`, hover = `var(--muted)/30`
- Row text: `0.82rem`, `var(--foreground)`
- Action buttons (row): icon-only, `ghost` variant, `size-8`

### Notification dot (bell)

- Red dot: `#EF4444` with `box-shadow: 0 0 0 2px #ffffff` (ring effect)
- Position: `absolute top-1.5 right-1.5`, `w-2 h-2 rounded-full`

### Tooltips (chart)

```css
{
  background: #ffffff;
  border: 1px solid #E5E7EB;
  border-radius: 10px;
  padding: 10px 14px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.10);
  font-size: 12px;
  line-height: 1.4;
}
```

---

## Icons

Library: **Lucide React** (`lucide-react`)

Default icon size in nav: `18px`. In buttons / rows: `16px` (Lucide default via `size-4`).

Common icons used:
- `LayoutDashboard`, `Building2`, `CreditCard`, `Users`, `ShieldCheck`, `Lock` — nav
- `Search`, `Bell`, `Menu`, `ChevronRight`, `ChevronDown`, `ChevronLeft` — chrome
- `Plus`, `Download`, `Trash2`, `Pencil`, `Eye`, `EyeOff`, `MoreVertical` — actions
- `CheckCircle2`, `Clock`, `XCircle` — status
- `Zap` — logo mark

---

## Spacing Conventions

| Use | Value |
|---|---|
| Page padding | `p-6` or `px-6 py-5` |
| Card internal padding | `p-5` or `p-6` |
| Stack gap between cards | `gap-5` or `gap-6` |
| Inline element gap | `gap-2` or `gap-3` |
| Table row height | `py-3 px-4` per cell |
| Section header → content | `mb-4` or `mb-5` |

---

## Motion

- Sidebar collapse: `transition-[width] duration-300 ease-in-out`
- Nav item active state: `transition-all duration-150`
- Buttons: `transition-all`
- Inputs / borders: `transition-[color,box-shadow]`
- Dropdowns: appear instantly (no animation), dismissed by backdrop click

---

## Stack

| Layer | Library |
|---|---|
| Framework | React 19 + TypeScript |
| Routing | React Router v7 |
| Styling | Tailwind CSS v4 + CSS custom properties |
| Component base | Radix UI primitives (`@radix-ui/react-slot`, etc.) |
| Variant utility | `class-variance-authority` (cva) |
| Class merge | `clsx` + `tailwind-merge` via `cn()` |
| Icons | `lucide-react` |
| Charts | `recharts` (AreaChart, LineChart, BarChart, PieChart) |
