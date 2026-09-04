# SYNFORMA design system

The visual language should feel like a premium scientific journal crossed with a
world-class AI laboratory: MIT Media Lab, Linear, Apple — copying none of them.

## Palette (Tailwind tokens defined in `app/globals.css`)

| token | hex | use |
|---|---|---|
| `paper` | #fafaf7 | page background |
| `surface` | #ffffff | cards, panels |
| `surface-2` | #f3f2ee | secondary fills, hover |
| `surface-3` | #ebe9e3 | tertiary fills, skeletons |
| `ink` | #0b0b0c | primary text, primary buttons |
| `graphite` | #3a3a3c | secondary text |
| `slate` | #6b6b70 | tertiary text, eyebrows |
| `mist` | #9a9a9e | placeholders, disabled |
| `line` | #e4e2dd | hairlines |
| `line-strong` | #cfccc5 | borders on controls |
| `signal` / `signal-soft` | #b4532a / #f4e6df | attention, errors, struggle — use sparingly |
| `verdant` / `verdant-soft` | #2f6b4f / #e3ede7 | confirmed outcomes, completion |
| `amber` / `amber-soft` | #8a6a1f / #f2ead6 | hypotheses, "insufficient evidence" |

Never: purple gradients, neon blue, glowing brains, robot imagery, sparkles, stock wellness imagery.

## Typography

- Geist Sans (variable) via `font-sans`; Geist Mono via `font-mono` for data.
- Display headings use `.display` (tight tracking, 1.02 line height), weight 500.
- Eyebrows use `.eyebrow` (11px uppercase, wide tracking, slate).
- Data uses `.mono-data` (tabular numerals).

## Structure

- Generous whitespace. Max content width 1200px (`max-w-6xl`) for marketing, full-bleed for the product.
- Fine structural lines (`border-line`) instead of shadows. Shadows only on floating layers (dialogs, menus).
- `.grid-paper` and `.dot-paper` backgrounds for diagram areas, subtle.
- Border radius: `rounded-md` (8px) for controls, `rounded-lg` (12px) for cards.

## Motion

Restrained and meaningful. Reveal on scroll with `motion` (`motion/react`), 300–500ms ease-out, small translate.
Never animate for decoration. Animate when a relationship changes (a node appears in the Work Graph,
an action is executed, a step completes). Respect `prefers-reduced-motion`.

## Components

`components/ui/*` are the shared primitives (Button, Card, Input, Textarea, Label, Badge, Tabs, Dialog,
Switch, Tooltip, Progress, Skeleton, Separator, NativeSelect, Table, DropdownMenu). Import from `@/components/ui`.
Brand: `SynformaMark`, `SynformaWordmark`, `SynformaLogo` from `@/components/brand/logo`.

## Voice

Intelligent, calm, precise. No exclamation marks. No hype words ("revolutionary", "magical").
State what the system observed, what it hypothesizes, and what it will do. Distinguish
observation from inference: "Observed", "Current hypothesis", "Insufficient evidence".
