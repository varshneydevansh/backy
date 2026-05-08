# Backy Admin Design System

Date: 2026-05-09

Backy is not a marketing dashboard. It is an operating system for controlling many websites, custom frontends, media, content, products, APIs, and publishing state from one backend. The admin UI should feel like a serious creative control room: precise, calm, premium, and complete.

## Product Direction

- **Audience:** founders, agencies, creators, developers, and operators managing sites and custom frontends.
- **Job:** make every editable frontend concern visible and controllable from Backy: content, layout, media, commerce, APIs, publishing, storage, and database connectivity.
- **Personality:** sharp creative infrastructure, not playful SaaS decoration.
- **Design bar:** every page must show real controls, backend state, empty/error/loading states, and a clear next action.

## Aesthetic

**Industrial editorial control room**

- White and graphite surfaces with a subtle cool tint.
- One strong brand accent: deep teal for primary action and API/control affordances.
- Amber/red/green semantic colors only when status matters.
- No purple-blue gradients as the default product look.
- No decorative card stacks or oversized marketing sections inside the admin app.

## Layout Rules

- Use full-width operational sections with constrained content, not nested cards.
- Cards are only for individual metrics, repeated items, modules, and alerts.
- Prefer rows, rails, tables, status strips, and split panes over decorative grids.
- Keep dashboard modules dense but readable.
- Every page should have:
  - page title and purpose,
  - primary action,
  - backend status/loading/error affordance,
  - filters or controls where relevant,
  - empty state,
  - recent/audit or readiness context when relevant.

## Typography

- **UI/body:** `Geist`, `Aptos`, `ui-sans-serif`, `system-ui`, `sans-serif`.
- **Data/code/request ids:** `JetBrains Mono`, `SFMono-Regular`, `ui-monospace`, `monospace`.
- Use tabular numbers for dashboard metrics, storage usage, counts, and dates.
- Page titles are compact and work-focused; no hero-scale headings inside admin pages.
- Use sentence case for headings and labels.

## Color Tokens

- `background`: cool paper, near white.
- `foreground`: graphite ink.
- `card`: clean white.
- `primary`: deep teal for main actions and API/control identity.
- `accent`: pale teal hover/selected surfaces.
- `muted`: cool gray-blue utility surfaces.
- `destructive`: direct red for blocking errors.
- Semantic status:
  - green: ready/connected,
  - amber: warning/needs config,
  - red: blocker/error,
  - blue/cyan: informational/API.

## Component Rules

- Reuse Backy-owned primitives before adding page-local markup. Current shared admin primitives live under `apps/admin/src/components/ui`: `Button`, `Panel`, `Notice`, `SegmentedTabs`, `StatusBadge`, `EmptyState`, `DataGrid`, and `LoadingScreen`.
- Editor and builder surfaces should use shared editor chrome before route-local wrappers. Current shared editor primitives live under `apps/admin/src/components/editor`, including `EditorWorkspaceFrame` around reusable page/blog canvas workspaces.
- Buttons must have real actions or navigation.
- Icon buttons must include accessible labels or visible text.
- Touch targets should be at least `44px` high.
- Loading states should preserve layout and show what is being loaded.
- Error states should name what failed and give the next recovery action.
- Empty states should explain what to create or connect next.
- Audit, request id, and API-related text should use monospace and wrap safely.

## Page Completion Gate

A page is not complete when it only looks better. It is complete when:

- all visible actions work,
- the page reads/writes through backend APIs where expected,
- loading/empty/error states exist,
- public/custom frontend implications are visible,
- relevant audit/readiness context is visible,
- mobile/tablet/desktop layout does not overlap or clip,
- docs record what remains.

## First Pages to Finish

1. Dashboard: operator cockpit for health, content counts, readiness, audit activity, and custom frontend next actions.
2. Settings: delivery, API keys, storage provider, audit trail, and future Supabase/Vercel/provider controls.
3. Media: organized file/font/image control with provider health, quotas, references, and transform status.
4. Pages editor: Canva/Wix-level element control, grouping, responsive modes, saved sections, bindings, and publish readiness.
5. Collections/products: structured data and commerce-like content for dynamic frontends.
