# Storely prototype audit

Source of truth: `Admin Prototype v2.dc.html` (3,385 lines).  
Older file `Admin Prototype.dc.html` was not used as the design source.  
`Commerce Admin.dc.html` and `Madaf Admin.dc.html` are 206-byte stubs and contain no UI.

This audit was completed before the Next.js implementation. The conversion keeps the v2 visual design and replaces the Claude Design runtime with React components and App Router routes.

## 1. How the prototype is built

The file is not production HTML. It is a Claude Design document:

| Mechanism | Role | React replacement |
| --- | --- | --- |
| `<x-dc>` | Root template host | React tree |
| `<sc-if value="{{ ... }}">` | Conditional blocks | `{condition && ...}` |
| `<sc-for list="{{ ... }}" as="item">` | List rendering | `.map()` with stable keys |
| `{{ expression }}` | Text, style, and attribute bindings | Props and state |
| `onClick="{{ fn }}"` | Handler references created inside `renderVals()` | Real event handlers |
| `style-hover` / `style-focus` | Runtime hover and focus styles | CSS `:hover` and `:focus-visible` |
| `class Component extends DCLogic` | One class holds every screen, dialog, and mock mutation | Route components plus small client state |
| `state.page` | Screen switcher (`dashboard`, `orders`, `order`, …) | Next.js routes |
| `support.js` | Claude runtime (`DCLogic`, template parser). Requires `window.React` injected by the host | Not used by the app |
| `live-globe.js` | Canvas globe for the live-view screen | Reimplement only when that screen is migrated |

`support.js` cannot boot the prototype in a normal browser. The runtime expects a host that provides React before the script runs. Visual comparison against a live render of the `.dc.html` file is therefore not available in this repository. The markup, inline styles, tokens, and mock data are the source of truth.

`uploads/` is a set of design-process images. v2 markup references only `assets/storely-logo.png` (sidebar, collapsed top bar, and the automation email preview). Product imagery in the prototype is flat color swatches (`tone`), not photographs.

## 2. Application shell

The document is `dir="rtl"` `lang="he"`, font **Assistant** (weights 400–800), 14px / 20px, text `#303030`.

Viewport behavior is driven by `state.w` (`window.innerWidth`). `narrow` is `w < 1000`.

| Region | Desktop (`w >= 1000`) | Narrow |
| --- | --- | --- |
| Page background | `#1a1a1a`, full viewport, no document scroll | Same |
| Sidebar | 240px, in flow, `#1a1a1a` | `position: absolute`, right side, shadow, opened by the menu button |
| Content panel | Margin `6px 0 6px 6px` (or `6px` when the sidebar is collapsed), radius `14px`, background `#fafafa` | Margin `0`, radius `0` |
| Top bar | Shown only when the sidebar is collapsed. Height 48px, `#1a1a1a`, menu button + logo | Always shown |
| Unsaved bar | Replaces the top area on dirty editors (product, discount, collection, post, automation). Height 52px | Same |
| Main | `overflow-y: auto` | Same |

Sidebar collapse (`navCollapsed`) and the mobile drawer (`navOpen`) are separate. Navigation closes the mobile drawer. A scrim covers the page while the drawer is open. Any open menu has a full-screen click catcher at `z-index: 20`.

The design-system page inside the prototype still lists `--bg-nav: #ebebeb` and a light shell. The **implemented v2 shell is dark** (`#1a1a1a` sidebar, `#fafafa` panel). The dark shell is the visual source of truth. The light tokens are recorded because the design-system screen displays them, and they should be reproduced when that screen is migrated.

Breakpoints called out in the design-system geometry table: 390, 768, 1280, 1440. The only runtime breakpoint is 1000px.

## 3. Screen inventory

Every `data-screen-label` in v2, plus the shell states that are not separate screens.

| Screen label | State key | Proposed route | This pass |
| --- | --- | --- | --- |
| Dashboard | `dashboard` | `/admin` | Implement |
| Orders list | `orders` | `/admin/orders` | Planned (milestone 2) |
| Abandoned checkouts | `abandoned` | `/admin/orders/abandoned` | Planned |
| Abandoned checkout detail | `checkout` | `/admin/orders/abandoned/[id]` | Planned |
| Order details | `order` | `/admin/orders/[id]` | Planned (milestone 2) |
| Products list | `products` | `/admin/products` | Planned (milestone 2) |
| Collections | `collections` | `/admin/products/collections` | Planned |
| Collection editor | `collection` | `/admin/products/collections/[key]` | Planned |
| Inventory | `inventory` | `/admin/products/inventory` | Planned |
| Gift cards | `giftcards` | `/admin/products/gift-cards` | Planned |
| Product editor | `product` | `/admin/products/[id]`, `/admin/products/new` | Planned (milestone 2) |
| Customers list | `customers` | `/admin/customers` | Planned |
| Customer profile | `customer` | `/admin/customers/[id]` | Planned |
| Customer segments | `segments` | `/admin/customers/segments` | Planned |
| Discounts list | `discounts` | `/admin/discounts` | Planned |
| Discount editor | `discount` | `/admin/discounts/[id]`, `/admin/discounts/new` | Planned |
| Growth | `growth` | `/admin/growth` | Planned |
| Attribution | `attribution` | `/admin/growth/attribution` | Planned |
| Blog posts | `blogs` | `/admin/content/posts` | Planned |
| Blog post editor | `post` | `/admin/content/posts/[id]`, `/admin/content/posts/new` | Planned |
| Integrations | `integrations` | `/admin/marketing/integrations` | Planned |
| Automations | `automations` | `/admin/marketing/automations` | Planned |
| Automation editor | `flow` | `/admin/marketing/automations/[id]` | Planned |
| Analytics | `analytics` | `/admin/analytics` | Planned |
| Reports | `reports` | `/admin/analytics/reports` | Planned |
| Live view | `live` | `/admin/analytics/live` | Planned |
| Module placeholder | `soon` | Routes with no designed body (below) | Placeholder shell now |
| Design system | `system` | `/admin/design-system` | Planned |

There is no settings screen. Settings and several nav children call `go('soon', …)` and render the module placeholder.

### Placeholder destinations (`soon`)

| Label | Parent | Route |
| --- | --- | --- |
| טיוטות | orders | `/admin/orders/drafts` |
| החזרות והחזרים כספיים | orders | `/admin/orders/returns` |
| יצירת הזמנה | orders | `/admin/orders/drafts` |
| חברות | customers | `/admin/customers/companies` |
| עמודים | store | `/admin/online-store/pages` |
| תפריטי ניווט | store | `/admin/online-store/menus` |
| תוכן דף הבית | store | `/admin/online-store/home` |
| באנרים | store | `/admin/online-store/banners` |
| הגדרות | settings | `/admin/settings` |

Marketing’s parent click goes to integrations, not a placeholder. Content’s parent click goes to blog posts.

### Overlays and shell states (not routes)

| Overlay | Trigger |
| --- | --- |
| Profile menu | Store button in the sidebar |
| Dashboard range menu | “30 הימים האחרונים · כל הערוצים” |
| Unsaved-changes bar | Dirty product, collection, post, discount, or automation editor |
| Leave confirmation | Navigate away while dirty |
| Toast | Simulated actions (export, logout, assistant, save, …). Auto-hides after 3.5s |
| Mobile scrim | Narrow sidebar open |
| Menu scrim | Any `state.menu` |
| Fulfill dialog | Order “סימון כנשלח” |
| Refund dialog | Order “החזר כספי” |
| Delete confirmation | Product bulk delete |
| Discount type picker | New discount |
| Integration connect dialog | Integration card |
| Gift card create dialog | Gift cards “יצירה” |
| Address dialog | Customer profile |
| Column picker | Toolbar icon. Toast only: “בחירת עמודות תתווסף בשלב הבא” |
| Saved views manager | Toast only |
| Order stats strip | Orders list, hidden when `showOrderStats` is false |
| Orders loading skeletons | 500ms after tab or payment-filter changes when latency simulation is on |
| Orders empty state | Search or filters match nothing |
| Checkout recovery banner | Abandoned checkout that is not recovered |
| Growth hero | Dismissible |
| Attribution banner | Dismissible |
| Chart hover tooltip | Dashboard, analytics-style charts, attribution |

## 4. Navigation

Primary items, in order:

| Key | Label | Icon | Children | Notes |
| --- | --- | --- | --- | --- |
| dashboard | בית | home | — | |
| orders | הזמנות | orders | טיוטות, החזרות והחזרים כספיים, עגלות נטושות | Badge = count of orders whose fulfillment is not `fulfilled` |
| products | מוצרים | tag | אוספים, מלאי, כרטיסי מתנה | |
| customers | לקוחות | user | פלחים, חברות | |
| growth | צמיחה | trend | ייחוס | |
| marketing | שיווק | megaphone | אינטגרציות, אוטומציות | Parent opens integrations |
| discounts | הנחות | badge | — | |
| content | תוכן | image | פוסטים בבלוג | Parent opens blog posts |
| analytics | ניתוח נתונים | bars | דוחות, צפייה חיה | Section label “ערוץ מכירה” renders **after** this item |
| store | חנות אונליין | storefront | עמודים, תפריטי ניווט, תוכן דף הבית, באנרים | Placeholder children |

Footer of the sidebar, after a flexible spacer:

- מערכת עיצוב ומפרט → design system
- הגדרות → placeholder
- Store switcher “סטודיו לבנה” (initials סל) with profile menu for מאיה ברק / `maya@lavana.co.il`
- Notification button with count 2

Active rules from `renderVals()`:

- A parent is filled `#303030` with white text when its module is active and no child route is active.
- When a child is active, the parent stays white but transparent, and the child is filled.
- Children are expanded only while that parent module is active.
- Order detail highlights **הזמנות**, not a child. Abandoned checkout highlights **עגלות נטושות**.
- Product editor highlights **מוצרים**. Collection editor highlights **אוספים**.

Sidebar search is a visual field (“חיפוש”, `Ctrl K`). v2 does not filter navigation or open a command palette.

## 5. Dashboard composition

Top row, padding `12px 16px`:

1. Range button, flexible, opens a 220px menu: היום, 7 הימים האחרונים, 30 הימים האחרונים (default), 90 הימים האחרונים. Suffix text “· כל הערוצים” is static.
2. Four metric buttons, centered: מכירות ברוטו, הזמנות, ביקורים, שיעור המרה. Selected metric background `#ebebeb`. Each shows a 12-point sparkline and a percent delta (`#1f7a4d` up, `#8e1f0b` down).
3. “מבקרים כעת **9**” with a pulsing green ring. The count is a constant.

Hero, padding `84px 20px 48px` (narrow: `40px 16px 32px`), centered:

- Greeting from the clock: לילה טוב / בוקר טוב / צהריים טובים / ערב טוב, plus “מאיה!”. 26px / 34px, weight 600, `#4a4a4a`.
- “בואו נמשיך להצמיח את העסק.” 28px / 36px, weight 700, `#1a1a1a`.
- Assistant card, max-width 640px, radius 16px. Textarea placeholder “שאלו את העוזר, או כתבו מה תרצו לעשות”. Actions: recents (toast), attach (no handler), send. Send is `#303030` / white only when the field is non-empty; otherwise `#f1f1f1` / `#b5b5b5`. Enter sends.
- Keyword routing (simulated): הזמנ/משלוח → orders, מוצר/מלאי → products, לקוח → customers, פלח → segments, הנח/קופון/קוד → discounts. Other text toasts that the assistant is not available yet.
- Chips, only when the count is greater than 0: משלוח הזמנות, תשלומים ממתינים, מלאי נמוך.

Three tip cards, grid `repeat(auto-fit, minmax(260px, 1fr))`, min-height 300px, radius 16px:

1. Abandoned-cart automation → automations (v2 sends this to the `soon` automations key; the designed automations screen exists at `is.automations`, so the Next.js route should open `/admin/marketing/automations`).
2. Chanukah discount → discount id 3 (`CHANUKAH50`).
3. Backup payment method → settings placeholder.

Lower stack, max-width 1000px:

- Chart card. Title follows the selected metric. Series are deterministic (Park-Miller LCG). Current line `#2c6ecb`, comparison `#9cc3ee` dashed, area `rgba(44,110,203,.07)`. Hover crosshair and tooltip. Axis is LTR even inside the RTL page. Range “היום” uses 24 hourly points; other ranges use one point per day ending 12 Oct 2026.
- Two columns (`1.6fr` / `1fr`, single column when narrow):
  - Recent orders (first 5) and top products by the static sales table.
  - Quick actions and low-stock list (active products with `stock < 5`).

Quick actions: הוספת מוצר, יצירת הזמנה ידנית, יצירת קוד הנחה, עריכת באנר בדף הבית.

## 6. Component inventory

Repeated structures to build once and reuse:

| Component | Used by |
| --- | --- |
| Admin shell, sidebar, top bar, unsaved bar, toast | Every screen |
| Nav item and nested nav | Sidebar |
| Profile menu and generic menu | Shell, filters, editors |
| Page heading row (icon, title, trailing actions) | Index screens |
| Index toolbar (view, search, filter chips, columns) | Orders, products, customers, discounts, abandoned, inventory |
| Bulk selection bar | Those index screens |
| Data table, status badge, empty state, skeleton rows | Index screens |
| Sticky footer dock (pager + assistant pill) | Orders, abandoned checkouts |
| Card | Dashboard, editors, design system |
| Two-column editor (`1fr` + 320px, or 280px on the product editor) | Order, product, customer, discount, collection, post |
| Dialog | Fulfill, refund, leave, delete, discount type, integration, gift card, address |
| Money and LTR islands | Totals, ids, emails, phones, SKUs |
| Sparkline and time-series chart | Dashboard, orders stats, growth, attribution, analytics |
| Module placeholder | `soon` routes |

Index screens share a dense table: header row about 32–34px, body rows 33px in the orders markup (the design-system note says 44px, and 56px for products). Match each screen’s own markup, not the geometry table, when they disagree.

## 7. Mock data

Store persona: **סטודיו לבנה**, operator **מאיה ברק**, `maya@lavana.co.il`. “Today” inside the data is **12 Oct 2026**, not the viewer’s clock. The greeting uses the viewer’s clock.

| Collection | Shape | Size |
| --- | --- | --- |
| Products `P` | title, variant, price, compare, cost, sku, barcode, stock, status, category, vendor, tone, tags, collections, optional options and per-variant quantities, description | 12 |
| Collections `COLLS` | names only, plus editor state created at runtime | 5 names |
| Customers `C` + `CX` | name, email, phone, street, city, zip, order count, since, lifetime spend, marketing opt-in, tags, note, addresses | 12 |
| Orders `O` | id, date label, customer index, channel, line items as `[productIndex, qty]`, optional discount `[code, percent]`, ship method, pay, fulfillment, note, tags | 12 hand-written + 22 generated (`#1035` down to `#1014`) |
| Shipping prices | שליח עד הבית 29.9, נקודת איסוף 19.9, איסוף עצמי 0, דואר ישראל 14.9 | |
| Risk order ids | 1045, 1040, 1033, 1027 | |
| Segments `SEGS` | vip, repeat, subs, big | 4 |
| Discounts `D` | code or title, type, method, value, eligibility, limits, schedule, uses, revenue | 10 |
| Integrations | Meta and GA4 start connected; seven more are available | |
| Automations | Three active templates (cart, welcome, thanks) plus a gallery | |
| Gift cards | Empty until created in the session | |

Status maps:

- Payment: paid, pending, partially_refunded, refunded
- Fulfillment: unfulfilled, fulfilled, partial, onhold
- Product: active, draft, archived
- Discount: active, scheduled, expired, derived from `TODAY = 2026-10-12`

Order totals are computed: line subtotal, percent discount rounded to cents, plus shipping, then rounded to cents. VAT copy is 18% included (`total * 18 / 118`). Payment copy is simulated (“ויזה •••• 4821”) and must stay labeled as mock data.

Session mutations in the prototype (all local, none persisted):

- Product create/update/delete and status bulk edit
- Order pay, fulfill, refund, comments (`ovr` and `events` overlays)
- Customer notes, tags, addresses, timeline
- Discount, collection, post, and automation save
- Inventory quantity commit
- Gift card create
- Integration connect/disconnect
- Segment draft fields
- Abandoned-checkout note and recovery email (toast only)

## 8. Interactions to preserve

Sidebar expand/collapse and mobile drawer. Nested nav only on the active module. Menus close on outside click and on navigation. Tabs and saved-view menus. Search and dashed filter chips. Table selection with a bulk bar that replaces the search toolbar. Pagination controls are visible and disabled in v2 (single page). Dashboard range and metric selection. Chart hover. Assistant submit. Toasts. Dirty bar with discard and a spinning save state. Leave dialog. Confirmation dialogs. Status changes. Variant rows on the product editor. RTL: sidebar on the right, back chevrons point right, previous/next pair puts previous on the right, money and ids are `dir="ltr"`, chart axis stays left-to-right.

## 9. Visual tokens to implement

From the live v2 shell and components (these override the design-system swatches where they differ):

| Token | Value | Use |
| --- | --- | --- |
| shell | `#1a1a1a` | Page, sidebar, top bar, primary filled buttons on index headers, toast |
| nav-active | `#303030` | Active nav, search well, primary button |
| nav-hover | `#2a2a2a` | Nav and icon hover |
| nav-text | `#e3e3e3` | Sidebar label |
| nav-muted | `#b5b5b5` | Inactive child, shortcut, placeholder |
| nav-section | `#8a8a8a` | Section label |
| canvas | `#fafafa` | Content panel |
| text | `#303030` | Body |
| text-secondary | `#616161` | Meta |
| text-strong | `#1a1a1a` | Hero title |
| text-soft | `#4a4a4a` | Greeting, some labels |
| border | `#e3e3e3` / `#ebebeb` | Dividers |
| border-input | `#8a8a8a` | Inputs |
| focus | `#005bd3` | Focus ring and links |
| link-hover | `#004299` | |
| chart | `#2c6ecb` | Current series |
| chart-compare | `#9cc3ee` | Previous series |
| positive | `#1f7a4d` | Metric delta up |
| negative | `#8e1f0b` | Metric delta down, errors |
| critical | `#e51c00` | Notification badge, input error border |
| critical-fill | `#c70a24` | Destructive primary |
| warning-bg / fg | `#ffeb78` / `#4f4700` | Unfulfilled |
| attention-bg / fg | `#ffd6a4` / `#5e4200` | Payment pending |
| success-bg / fg | `#cdfee1` / `#0c5132` | Active |
| info-bg / fg | `#e0f0ff` / `#00527c` | Draft |
| assistant | `#ede7fb` / `#5b3fc4` | Assistant mark |
| card radius | 12px | Data cards |
| hero card radius | 16px | Assistant, tips, dialogs |
| control radius | 8px | Nav, fields, compact buttons |
| index button radius | 10px | Index header buttons |
| panel radius | 14px | Content panel |
| sidebar width | 240px | |
| field / button height | 32px (index actions often 30px) | |
| font | Assistant, Heebo, system-ui | |

Card shadow used on dashboard blocks: `0 0 0 1px rgba(26,26,26,.07), 0 1px 0 rgba(26,26,26,.07)`.  
Popover shadow: `0 0 0 1px rgba(0,0,0,.08), 0 8px 24px rgba(0,0,0,.16)`.

## 10. Architecture for this migration

```
src/app/admin/                 routes
src/components/admin/layout/   shell
src/components/admin/dashboard/
src/components/admin/shared/   placeholder and later shared index pieces
src/components/ui/             icons, menu, badge
src/data/mock/                 deterministic fixtures
src/lib/                       formatting, chart math, navigation, order totals
src/types/
reference/prototype/           copies of the source files (originals stay in the repo root)
```

Domain types and mock fixtures stay out of presentational components so a later `commerce-admin` package can take the UI and a store-specific app can supply data. No Supabase, auth, payments, or email in this phase. Toasts that mention CSV, PDF, or email are simulated and do not send anything.

Unbuilt designed screens use the prototype’s module-placeholder layout so navigation works. That placeholder is visually correct only for `soon` destinations. Designed screens that are not migrated yet are a known gap, recorded in the milestone report.

## 11. Known limitations

- The original runtime cannot be screenshotted here, so pixel parity cannot be claimed against a live prototype render.
- `live-globe.js` is a canvas visualization for a later milestone.
- Global search, column picking, saved views, logout, export, and print are toasts or inert controls in v2.
- Pagination buttons are disabled because every list is one page.
- The attach button on the assistant has no behavior.
- Design-system color names for the sidebar do not match the dark v2 shell.
- Orders list row height in markup (33px) does not match the geometry note (44px).
- Dashboard tip 1 navigates to `soon` automations even though a full automations screen exists. The route map points at the real automations screen.
- Product photos are color swatches. `uploads/` is reference material only.
- Greeting text depends on the current hour, so two captures taken across a day-part boundary will differ. Chart numbers do not; they are seeded.

## 12. Milestones after this audit

1. Foundation and dashboard (this implementation pass).
2. Orders list, order details, products list, product editor, with the same shell.
3. Remaining designed screens, still on these tokens.
4. Visual, navigation, interaction, responsive, accessibility, typecheck, and production build checks across the full set.
