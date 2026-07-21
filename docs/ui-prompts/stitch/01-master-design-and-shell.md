# 01. Master design DNA and shared responsive shell

Run these two prompts first in the same Stitch project. All P01–P42 screen prompts depend on them.

## MASTER DESIGN DNA

```text
Create the master design language for “GreenHome Kitchen”, a Vietnamese premium kitchenware commerce platform with customer shopping flows and operational workspaces for Staff, Warehouse Manager, and Admin.

This is a design-system foundation, not a request to invent new product features. Preserve all existing business roles and flows. All visible interface copy must be natural Vietnamese. Use VND currency formatting such as “459.000 ₫” and clear Vietnamese date/status labels.

MEMORABLE IMPRESSION
GreenHome Kitchen should feel like a trustworthy, carefully curated Vietnamese kitchen brand. Customer-facing pages feel warm, tactile, editorial, and premium. Internal workspaces feel fast, disciplined, highly legible, and unmistakably part of the same brand rather than a generic SaaS dashboard.

VISUAL DNA
- Primary forest: #173E31; deep forest: #12392D; leaf: #2F6B42.
- Warm ivory background: #F7F3E8; paper surface: #FFFDF8.
- Restrained warm-gold accent: #D8A75B, used for highlights and premium details, never for large text blocks.
- Muted text: #657367; borders: #DCE5D8.
- Semantic colors: success #237A45, warning #B54708, error #B42318, information #175CD3. Always pair semantic color with text or an icon.
- Customer-facing display type: Fraunces with full Vietnamese support. UI, body, form, price, table, and operational type: Outfit. Use tabular numerals for data and money.
- Use a restrained radius hierarchy: 6px controls, 10px panels, 16px featured customer cards. Do not make every surface pill-shaped or bubbly.
- Use soft natural shadows only where elevation communicates interaction. Prefer borders, spacing, and hierarchy over excessive card containers.
- Product photography should feel real, clean, daylight-lit, and related to modern Vietnamese kitchens. Avoid generic technology illustrations.

LAYOUT SYSTEM
- Desktop frame: 1440×1024. Use a 12-column grid, 80px outer margins for public pages, and a max readable content width around 1280px.
- Mobile frame: 390×844. Use 16px side padding, one-column forms, safe-area-aware sticky controls, and no horizontal page overflow.
- Support an implied tablet transition from 768–1024px even though the requested primary frames are desktop and mobile.
- Minimum touch target is 44×44px. Maintain WCAG AA contrast, visible keyboard focus, semantic labels, and reduced-motion-safe transitions.

CUSTOMER-FACING COMPONENTS
Define coherent variants for navigation, buttons, search, product cards, product media, filter controls, form fields, address cards, order status timelines, review cards, notification items, empty/error states, and footer.

INTERNAL COMPONENTS
Define coherent variants for operational topbar, role sidebar, KPI blocks, filters, compact forms, status badges, queue tables, mobile queue cards, detail summaries, audit rows, confirmation dialogs, toast/inline feedback, skeletons, and partial-data warnings.

STATE CONTRACT
For every applicable component provide clear visual behavior for default, hover, focus, active, disabled, loading, empty, error, success, validation, and destructive confirmation. Loading must not erase stable navigation or filter controls. Never represent an unavailable metric as zero; use an em dash and an explanatory warning.

ANTI-PATTERNS
No purple/violet gradients. No generic SaaS dashboard aesthetic. No three identical feature cards with icons in colored circles. No gradient primary buttons. No excessive glassmorphism. No uniform oversized rounded corners. No English placeholder interface. No fabricated analytics or actions.

Create a compact design-system overview showing color tokens, typography hierarchy, spacing/radius rules, customer components, operational components, and responsive examples. Name this foundation “GreenHome Kitchen — Master Design DNA”.
```

## SHARED RESPONSIVE SHELL

```text
Continue in the same GreenHome Kitchen Stitch project and strictly follow the MASTER DESIGN DNA already established.

Design the shared responsive application shells used by all subsequent screens. Do not invent routes or change role permissions. Create representative Desktop 1440×1024 and Mobile 390×844 shell frames for the public/customer experience and the internal operational experience.

PUBLIC SHELL
- Premium header with GreenHome Kitchen logo, links “Trang chủ”, “Sản phẩm”, “Về GreenHome”, “Liên hệ”, plus “Đăng nhập” and “Đăng ký” for guests.
- Authenticated Customer variant adds cart, notification bell, avatar menu, and account actions without overcrowding the header.
- Desktop navigation is horizontal and calm. Mobile uses a compact top bar with accessible menu and cart/account actions; opened navigation is a full-height drawer or sheet with clear close behavior.
- Premium footer contains brand summary, product links, company links, contact phone numbers, email, address, and copyright. On mobile it becomes a readable accordion or stacked groups, not tiny columns.

ACCOUNT SHELL
- `/profile`, `/notifications`, and `/notifications/:id` use the storefront Header and Footer for Customer.
- For Staff, Warehouse Manager, and Admin, those shared account pages use only the operational topbar above the account content. They do not gain customer cart controls or the role sidebar unless the current product shell already includes it.

INTERNAL OPERATIONAL SHELL
- Desktop: fixed left sidebar, persistent operational topbar, fluid main content. The topbar shows “GreenHome Kitchen”, “Không gian vận hành”, user identity, translated role, and “Đăng xuất”. It intentionally has no notification bell, profile link, or cart.
- Mobile: sticky operational topbar with menu button, identity reduced to avatar/name, and an off-canvas role navigation drawer. Keep logout discoverable but prevent accidental taps.
- Staff navigation: “Tổng quan xử lý đơn”, “Hàng đợi đơn hàng”, “Đổi trả / hoàn tiền”, “Yêu cầu hỗ trợ”.
- Warehouse navigation: “Tổng quan kho”, “Tồn kho”, “Phiếu xuất kho”, “Kiểm hàng đổi trả”, “Cảnh báo sắp hết”, “Bổ sung hàng”.
- Admin navigation: “Tổng quan quản trị”, “Nhật ký hệ thống”, “Sản phẩm”, “Danh mục”, “Duyệt nhập hàng”, “Cấu hình”.
- Active navigation must be obvious through shape, text weight, and contrast, not color alone.

RESPONSIVE CONTENT RULES
- Desktop queue and management screens may use tables with sticky headers and aligned tabular numerals.
- Mobile converts each table row into a structured card or stacked row with label/value pairs; never squeeze a desktop table horizontally.
- Primary page actions stay near the heading on desktop and become a full-width or sticky bottom action when appropriate on mobile.
- Filters collapse into a compact expandable panel on mobile while showing active-filter chips and a clear reset action.
- Detail screens prioritize status and next action, followed by grouped information sections.

Create named reference frames:
1. GH-Shell-Public-Desktop
2. GH-Shell-Public-Mobile
3. GH-Shell-Customer-Desktop
4. GH-Shell-Customer-Mobile
5. GH-Shell-Internal-Desktop
6. GH-Shell-Internal-Mobile

Also show navigation-open and avatar-menu-open component states as small variants. The result becomes the shared shell reference for P01–P42.
```

## Shell approval checklist

- The public and customer shells remain visually compatible with current Home and About.
- Internal topbar has no notification, profile, or cart controls.
- Desktop and mobile navigation patterns are both present.
- Role links and Vietnamese labels match the routes exactly.
- Mobile tables are represented as cards/lists, not compressed tables.
- Focus, active, open, and reduced-motion behavior are visible or annotated.
