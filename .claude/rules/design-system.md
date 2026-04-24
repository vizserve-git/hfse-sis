---
name: design-system
description: Binding design system — tokens, primitives, canonical patterns, craft standard, semantic color discipline. Read BEFORE any UI / frontend code (new page, redesigned component, color / typography / layout decision) or when unsure which shadcn primitive or token to reach for.
load: on-demand
---

<!-- Stable rule. NOT auto-loaded. Read via the Read tool when relevant. Edit only with explicit user approval. -->

## Design system — see the full docs

The authoritative binding docs live at:

- `docs/context/09-design-system.md` — philosophy, hard rules, tokens (color / shadow / typography / spacing), component policy (shadcn primitives + legacy wrappers), page construction process, page→component matrix, pre-delivery checklist, adding tokens.
- `docs/context/09a-design-patterns.md` — craft standard (§7), canonical patterns (§8), semantic color discipline (§9).

Every UI change conforms to both docs. No exceptions — that's `hard-rules.md #7`. If a design decision isn't obvious from the tokens + primitives + patterns in those two files, stop and ask before writing JSX.

## The shortest-possible summary

- **Tokens only from `app/globals.css`.** No raw `#rrggbb` / `oklch(...)` / `slate-*` / `zinc-*` / `gray-*` / `bg-white` / `bg-black` in `app/` or `components/`. Semantic (`bg-primary`, `text-foreground`, `border-border`) or explicit Aurora Vault (`brand-indigo`, `brand-mint`, `brand-amber`, `brand-navy`, `hairline`, `ink`) — both resolve to the same values.
- **shadcn primitives over custom wrappers.** `Card` / `Field` / `Tabs` / `Sheet` / `DropdownMenu` / `Table` direct. Legacy `Surface` / `PageHeader` only for backwards-compat — migrate when you touch.
- **One primary `Button` per view.** Default variant carries the gradient + `shadow-button` automatically. `destructive` for commit/delete. `outline` for config. `ghost` for tertiary.
- **Status uses the §9.3 recipes.** Mint for healthy, destructive for locked/blocked, accent for informational. Plain `Badge variant="secondary"` isn't enough color for state.
- **Process.** Before JSX: state purpose → name the pattern → consult the §6 page→component matrix → compose from §4.1 primitives → custom only as last resort → §7 craft checklist before done.
