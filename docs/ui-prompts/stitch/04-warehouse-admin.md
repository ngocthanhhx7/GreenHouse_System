# Stitch prompts — Warehouse & Admin

Run every prompt below in the single existing Stitch project: **GreenHome Kitchen Responsive UI**. Continue each screen from the shared project context; do not create a separate project or treat prompts as independent.

## P29 — Warehouse dashboard

- **Route:** `/warehouse`
- **Component:** `WarehouseDashboardPage`
- **Goal:** Give the warehouse manager a fast, actionable snapshot of stock work.

```text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established.
Apply the MASTER DESIGN DNA and SHARED RESPONSIVE SHELL: forest #173E31, leaf #2F6B42, ivory #F7F3E8, paper #FFFDF8, gold #D8A75B; Outfit for UI/data with tabular figures, Fraunces only for a major brand-level title. Create exactly two frames. All visible UI copy is Vietnamese. Desktop uses InternalTopbar plus a fixed Warehouse sidebar; mobile uses a menu drawer. The topbar says “GreenHome Kitchen / Không gian vận hành”, shows only user identity, role “Quản lý kho”, and “Đăng xuất”; do not add notification, profile, cart, search, or invented navigation. Sidebar labels: “Tổng quan kho”, “Tồn kho”, “Phiếu xuất kho”, “Kiểm hàng đổi trả”, “Cảnh báo sắp hết”, “Bổ sung hàng”.
Name those two frames “GH-P29-Warehouse-Dashboard-Desktop” at 1440×1024 and “GH-P29-Warehouse-Dashboard-Mobile” at 390×844.

Design “Tổng quan kho” as an operational snapshot, not a generic SaaS dashboard. Show exactly three metrics with the current demo values: “Mặt hàng tồn kho” 8, “Cảnh báo sắp hết” 0 with a restrained warning treatment, and “Phiếu xuất chờ xử lý” 1. Beneath them place four direct actions: “Tồn kho”, “Hàng đợi xuất kho”, “Sắp hết hàng”, “Bổ sung hàng”. Do not add charts or extra metrics. Make the loading state a skeleton/“Đang tải số liệu kho...”; error state says “Không tải được số liệu kho: …” with retry; keep success/empty acknowledgement styling available where an action resolves. Mobile stacks metrics and actions with 44px minimum controls. WCAG AA, clear keyboard focus, no purple gradients, no generic bubbly cards.
```

## P30 — Inventory list

- **Route:** `/warehouse/inventory`
- **Component:** `InventoryListPage`
- **Goal:** Inspect inventory and make small manual stock adjustments safely.

```text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established.
Apply the MASTER DESIGN DNA and SHARED RESPONSIVE SHELL: forest #173E31, leaf #2F6B42, ivory #F7F3E8, paper #FFFDF8, gold #D8A75B; Outfit for UI/data with tabular figures, Fraunces only for a major brand-level title. Create exactly two frames. All visible UI copy is Vietnamese. Use the fixed Warehouse sidebar and InternalTopbar on desktop, and its drawer equivalent on mobile; preserve exactly the Warehouse sidebar labels and topbar constraints from the shared shell. No notifications, profile page, cart, search, or invented features.
Name those two frames “GH-P30-Inventory-Desktop” at 1440×1024 and “GH-P30-Inventory-Mobile” at 390×844.

Design page title “Tồn kho”. Desktop has one dense, readable table with exact columns: “Sản phẩm”, “Tồn”, “Đã giữ”, “Khả dụng”, “Hỏng”, “Ngưỡng cảnh báo”, “Trạng thái”, and action column. Status is only “Sắp hết hàng” or “Ổn định”. Each row has compact “+1” and “-1” manual adjustment buttons; pressing either opens a confirmation dialog that identifies product, change (+1/-1), and reason respectively “Nhập bù thủ công từ kho” or “Điều chỉnh giảm thủ công từ kho”, with “Hủy” and “Xác nhận”. Show the success banner “Đã cập nhật tồn kho cho [tên sản phẩm].”, inline validation/error, loading skeleton, and empty message “Chưa có bản ghi tồn kho.” Mobile converts each table row into a stock card retaining every field and both actions; do not make a horizontally scrolling mobile table. VND is not needed here; use Vietnamese numbers, 44px touch targets, AA contrast and visible focus.
```

## P31 — Low-stock alerts

- **Route:** `/warehouse/low-stock`
- **Component:** `LowStockPage`
- **Goal:** Surface products that need replenishment without diluting the alert signal.

```text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established.
Apply the MASTER DESIGN DNA and SHARED RESPONSIVE SHELL: forest #173E31, leaf #2F6B42, ivory #F7F3E8, paper #FFFDF8, gold #D8A75B; Outfit for UI/data with tabular figures, Fraunces only for a major brand-level title. Create exactly two frames. All visible UI copy is Vietnamese. Desktop uses the InternalTopbar and fixed Warehouse sidebar; mobile uses its drawer. Preserve the shared Warehouse navigation only, and do not introduce notification/profile/cart or fictional tools.
Name those two frames “GH-P31-Low-stock-Alerts-Desktop” at 1440×1024 and “GH-P31-Low-stock-Alerts-Mobile” at 390×844.

Create title “Cảnh báo sắp hết hàng” with a calm but unmistakable amber warning cue. The complete data view has exactly: “Sản phẩm”, “Tồn”, “Đã giữ”, “Khả dụng”, “Ngưỡng cảnh báo”. Use examples where available quantity makes the alert understandable; all numbers use Vietnamese formatting and tabular numerals. No adjust or approve action exists on this route. Show “Đang tải cảnh báo tồn kho...” as skeleton/loading content, error alert with retry, and the exact empty copy “Không có sản phẩm sắp hết hàng.” On mobile, make one compact alert card per product with every field in a two-column data layout and no horizontal table. Include a subtle static success confirmation treatment only for a successful retry/refresh, plus accessible focus and 44px controls. Avoid generic SaaS metric cards and purple gradients.
```

## P32 — Stock-export queue

- **Route:** `/warehouse/stock-exports`
- **Component:** `StockExportQueuePage`
- **Goal:** Let warehouse staff open the correct pending stock-export slip quickly.

```text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established.
Apply the MASTER DESIGN DNA and SHARED RESPONSIVE SHELL: forest #173E31, leaf #2F6B42, ivory #F7F3E8, paper #FFFDF8, gold #D8A75B; Outfit for UI/data with tabular figures, Fraunces only for a major brand-level title. Create exactly two frames. All visible UI copy is Vietnamese. Use the exact shared InternalTopbar and Warehouse sidebar on desktop; use a drawer on mobile. Do not add notifications, profile, cart, filters, or actions absent from the current page.
Name those two frames “GH-P32-Stock-Export-Queue-Desktop” at 1440×1024 and “GH-P32-Stock-Export-Queue-Mobile” at 390×844.

Create title “Hàng đợi xuất kho”. The data view is a concise queue table with exact columns “Đơn hàng”, “Trạng thái”, “Tổng tiền”, and action. Use Vietnamese status labels such as “Chờ xử lý”, “Đã duyệt”, “Đã xuất kho”, and VND formatting such as “1.250.000 ₫”. Each row offers only “Mở phiếu”. Include loading skeleton/copy “Đang tải phiếu xuất kho...”, error banner and retry, empty copy “Chưa có phiếu xuất kho.” On mobile, convert rows to cards that preserve order code, status, total, and a full-width “Mở phiếu” button. Show a success acknowledgement after a successful refresh, disabled/loading button state, AA contrast, visible focus, and 44px actions. Keep the operational visual language editorial and grounded rather than generic rounded SaaS panels.
```

## P33 — Stock-export detail

- **Route:** `/warehouse/stock-exports/:id`
- **Component:** `StockExportDetailPage`
- **Goal:** Review one export request and transition it through the permitted warehouse states.

```text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established.
Apply the MASTER DESIGN DNA and SHARED RESPONSIVE SHELL: forest #173E31, leaf #2F6B42, ivory #F7F3E8, paper #FFFDF8, gold #D8A75B; Outfit for UI/data with tabular figures, Fraunces only for a major brand-level title. Create exactly two frames. All visible UI copy is Vietnamese. Desktop uses only the shared InternalTopbar and Warehouse sidebar; mobile uses its drawer. No notification/profile/cart or invented process controls.
Name those two frames “GH-P33-Stock-Export-Detail-Desktop” at 1440×1024 and “GH-P33-Stock-Export-Detail-Mobile” at 390×844.

Show eyebrow “Phiếu xuất kho”, order code as the title, then status in the exact paired form “[trạng thái phiếu] / [trạng thái đơn hàng]”, and “Địa chỉ giao hàng”. Include item table columns exactly “Sản phẩm”, “SL”, “Tạm tính”; amounts are VND. State-specific action rules must be explicit: for “Chờ xử lý”, show “Duyệt xuất kho” and “Từ chối”; for “Đã duyệt”, show “Xác nhận đã xuất kho”; for any terminal state, show no approval action. Every state-changing action uses a confirmation dialog with contextual Vietnamese consequence and “Hủy”/confirm, a disabled submitting state, success banner “Đã chuyển phiếu xuất kho sang [trạng thái].”, and error handling. Add loading “Đang tải phiếu xuất kho...”, unavailable/error state, and an empty detail state. Mobile uses item cards, keeps address and state actions prominent, with 44px targets and AA focus treatment.
```

## P34 — Warehouse replenishment

- **Route:** `/warehouse/replenishments`
- **Component:** `ReplenishmentPage`
- **Goal:** Submit a replenishment request for a low-stock product and receive approved stock.

```text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established.
Apply the MASTER DESIGN DNA and SHARED RESPONSIVE SHELL: forest #173E31, leaf #2F6B42, ivory #F7F3E8, paper #FFFDF8, gold #D8A75B; Outfit for UI/data with tabular figures, Fraunces only for a major brand-level title. Create exactly two frames. All visible UI copy is Vietnamese. Use the shared InternalTopbar plus Warehouse sidebar desktop shell and drawer mobile shell only; do not add notifications, profile, cart, search, supplier fields, or unimplemented approval flows.
Name those two frames “GH-P34-Warehouse-Replenishment-Desktop” at 1440×1024 and “GH-P34-Warehouse-Replenishment-Mobile” at 390×844.

Title: “Bổ sung hàng”. At top, show the compact request form with exact fields: select “Chọn sản phẩm sắp hết” (option format “[tên] ([khả dụng] khả dụng / ngưỡng [ngưỡng])”), quantity numeric input minimum 1 default 20, reason text default “Bổ sung hàng do tồn kho thấp”, and “Tạo yêu cầu”. Directly below show requests with exactly “Sản phẩm”, “SL”, “Trạng thái”, action; only an “Đã duyệt” row shows “Nhập hàng”. “Nhập hàng” uses a confirmation dialog for received quantity equal to requested quantity. Provide validation, submitting/disabled state, loading “Đang tải yêu cầu bổ sung...”, empty “Chưa có yêu cầu bổ sung hàng.”, error, and success messages “Đã tạo yêu cầu bổ sung hàng.” / “Đã nhập bổ sung cho [tên].” Mobile stacks the form and turns rows into complete cards. Controls are 44px and contrast meets WCAG AA.
```

## P35 — Return/refund inspection queue

- **Route:** `/warehouse/return-refunds`
- **Component:** `ReturnRefundQueuePage`
- **Goal:** Route awaiting-inspection return requests into physical inspection.

```text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established.
Apply the MASTER DESIGN DNA and SHARED RESPONSIVE SHELL: forest #173E31, leaf #2F6B42, ivory #F7F3E8, paper #FFFDF8, gold #D8A75B; Outfit for UI/data with tabular figures, Fraunces only for a major brand-level title. Create exactly two frames. All visible UI copy is Vietnamese. Use the exact shared InternalTopbar and Warehouse navigation on desktop, with mobile drawer counterpart. Do not introduce notifications, profile, cart, filters, or status decisions on this queue.
Name those two frames “GH-P35-Return-Inspection-Queue-Desktop” at 1440×1024 and “GH-P35-Return-Inspection-Queue-Mobile” at 390×844.

Title: “Kiểm hàng đổi trả”. Display only requests awaiting inspection in a table with exact columns “Yêu cầu”, “Đơn hàng”, “Trạng thái”, action. Use request code (falling back to ID), order code, the Vietnamese status “Chờ kiểm hàng”, and one action “Kiểm hàng”. Include skeleton/loading, retryable error alert, and exact empty state “Không có yêu cầu chờ kiểm hàng.” A success acknowledgement may appear after a successful refresh; button has disabled/loading state. On mobile, each request becomes a clear card with code, order, status pill, and full-width “Kiểm hàng” control. Do not use a mobile horizontal table. Meet WCAG AA, use 44px targets and visible focus; keep the palette calm and operational, avoiding uniform bubbly cards or purple gradients.
```

## P36 — Return/refund inspection detail

- **Route:** `/warehouse/return-refunds/:id`
- **Component:** `ReturnRefundInspectionPage`
- **Goal:** Record received, sellable, and damaged quantities before refund processing.

```text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established.
Apply the MASTER DESIGN DNA and SHARED RESPONSIVE SHELL: forest #173E31, leaf #2F6B42, ivory #F7F3E8, paper #FFFDF8, gold #D8A75B; Outfit for UI/data with tabular figures, Fraunces only for a major brand-level title. Create exactly two frames. All visible UI copy is Vietnamese. Use the shared Warehouse topbar/sidebar desktop and drawer mobile shell; do not add notification/profile/cart or refund-approval actions.
Name those two frames “GH-P36-Return-Inspection-Detail-Desktop” at 1440×1024 and “GH-P36-Return-Inspection-Detail-Mobile” at 390×844.

Title “Kiểm hàng đổi trả”; show “[mã đơn hàng] / [trạng thái]”. When status is “Chờ kiểm hàng”, present inspection rows with exactly “Sản phẩm”, “SL yêu cầu”, “Nhận lại”, “Bán lại được”, “Hư hỏng”. “Nhận lại” is numeric min 0 and max requested quantity; the last two are numeric min 0. Add textarea label “Ghi chú kiểm hàng” and primary action “Xác nhận kiểm hàng”. Validate quantities inline, especially impossible quantities; action opens confirmation, then success “Đã lưu kiểm hàng và chuyển yêu cầu sang chờ hoàn tiền.” Handle server error and disabled submitting state. For other statuses, replace form with “Yêu cầu này không còn ở trạng thái chờ kiểm hàng.” Include loading “Đang tải yêu cầu đổi trả...”, not-found/error, and empty item state. On mobile, each product becomes a field card, never a horizontal table; retain 44px touch targets, AA contrast and focus.
```

## P37 — Admin dashboard

- **Route:** `/admin`
- **Component:** `AdminDashboardPage`
- **Goal:** Provide the current reporting snapshot and period controls for an administrator.

```text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established.
Apply the MASTER DESIGN DNA and SHARED RESPONSIVE SHELL: forest #173E31, leaf #2F6B42, ivory #F7F3E8, paper #FFFDF8, gold #D8A75B; Outfit for UI/data with tabular figures, Fraunces only for a major brand-level title. Create exactly two frames. All visible UI copy is Vietnamese. Desktop uses InternalTopbar and a fixed Admin sidebar; mobile uses drawer navigation. Exact Admin sidebar labels: “Tổng quan quản trị”, “Nhật ký hệ thống”, “Sản phẩm”, “Danh mục”, “Duyệt nhập hàng”, “Cấu hình”. Topbar only has “GreenHome Kitchen / Không gian vận hành”, user identity and role “Quản trị viên”, and “Đăng xuất”. No notification, profile, cart, search or invented dashboard items.
Name those two frames “GH-P37-Admin-Dashboard-Desktop” at 1440×1024 and “GH-P37-Admin-Dashboard-Mobile” at 390×844.

Title “Tổng quan quản trị” with links “Nhật ký hệ thống” and “Cấu hình”. Period form uses “Từ ngày”, “Đến ngày”, “Áp dụng”, “Xóa lọc”; display “Kỳ báo cáo: Từ … đến …” when set and validate that from-date is not after to-date. Show the current unfiltered demo values: “Đơn hàng” 5, “Đã giao” 1, “Doanh thu đã thanh toán” 459.000 ₫, “Doanh thu thuần” 459.000 ₫, “Đã hoàn tiền” 0 ₫, “Sản phẩm hiện có” 8, “Sắp hết hiện tại” 0, “Hỗ trợ đang mở” 2, “Đánh giá TB” 5.0. Use VND and tabular numbers. Then section “Trạng thái đơn hàng” table “Trạng thái”/“Số lượng”; empty copy “Chưa có đơn hàng. Hãy thêm sản phẩm và kiểm tra trải nghiệm catalog trước.” Add skeleton “Đang tải báo cáo...”, retryable error, disabled filters and subtle success reload. Mobile stacks date inputs, metrics, and status cards. AA contrast, 44px targets; no generic SaaS charts or purple gradients.
```

## P38 — Product management

- **Route:** `/admin/products`
- **Component:** `ProductManagementPage`
- **Goal:** Create, edit, publish, and manage product images with the current fields only.

```text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established.
Apply the MASTER DESIGN DNA and SHARED RESPONSIVE SHELL: forest #173E31, leaf #2F6B42, ivory #F7F3E8, paper #FFFDF8, gold #D8A75B; Outfit for UI/data with tabular figures, Fraunces only for a major brand-level title. Create exactly two frames. All visible UI copy is Vietnamese. Use the exact shared Admin topbar/sidebar desktop shell and drawer mobile shell. Do not invent bulk actions, search, notifications, profile, cart, product variants, supplier data, or deletion.
Name those two frames “GH-P38-Product-Management-Desktop” at 1440×1024 and “GH-P38-Product-Management-Mobile” at 390×844.

Header eyebrow “Danh mục bán hàng”, title “Quản lý sản phẩm”, description “Tạo, cập nhật và quản lý hình ảnh sản phẩm hiển thị trên cửa hàng.” First surface is “Thêm sản phẩm mới” (or “Chỉnh sửa sản phẩm”) with fields exactly: “Tên sản phẩm” max 160, “Mã SKU” max 80 placeholder “Ví dụ: GH-NC-001”, “Giá bán (VND)” min 1000 step 1000, “Số lượng tồn” min 0, “Đơn vị”, “Danh mục” select, “Trạng thái” options “Đang bán”/“Ngừng bán”, and “Mô tả” max 2000. Include image management: image thumbnails, upload, reorder, and remove; no invented metadata. Actions: “Tạo sản phẩm”/“Lưu thay đổi”, “Hủy chỉnh sửa” or “Xóa nội dung”. Second surface “Danh sách sản phẩm” has exact columns “Sản phẩm”, “SKU”, “Danh mục”, “Giá”, “Tồn kho”, “Trạng thái”, “Thao tác”, row actions “Chỉnh sửa” and “Ngừng bán”/“Kích hoạt”; status change gets confirmation. Include validation, upload/save loading, success, error, list skeleton and empty state. Mobile converts list to cards and stacks form. Use VND, 44px targets, AA focus.
```

## P39 — Audit logs

- **Route:** `/admin/audit-logs`
- **Component:** `AuditLogPage`
- **Goal:** Filter and review immutable operational log records.

```text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established.
Apply the MASTER DESIGN DNA and SHARED RESPONSIVE SHELL: forest #173E31, leaf #2F6B42, ivory #F7F3E8, paper #FFFDF8, gold #D8A75B; Outfit for UI/data with tabular figures, Fraunces only for a major brand-level title. Create exactly two frames. All visible UI copy is Vietnamese. Use only the shared Admin topbar/sidebar on desktop and drawer on mobile. Do not add notification/profile/cart, editable log actions, exports, or unsupported filters.
Name those two frames “GH-P39-Audit-Logs-Desktop” at 1440×1024 and “GH-P39-Audit-Logs-Mobile” at 390×844.

Title “Nhật ký hệ thống” and a “Làm mới” action. Show exact filter controls: text “Hành động”, text “Mã người dùng”, datetime-local from, datetime-local to, and “Lọc”. The results table has exactly “Thời gian”, “Hành động”, “Người dùng”, “Đối tượng”, “Mô tả”. Date examples must follow vi-VN medium-date/short-time convention such as “22 thg 7, 2026, 09:30”; target displays entity plus optional ID. Include filter validation (invalid date range), loading skeleton, disabled filter submit while loading, retryable error, successful refresh acknowledgement, and empty copy “Không tìm thấy nhật ký hệ thống.” Mobile turns each row into a labeled audit card, retaining all fields. Meet AA contrast, tabular numbers, focus styling and 44px controls; avoid generic SaaS design.
```

## P40 — Category management

- **Route:** `/admin/categories`
- **Component:** `CategoryManagementPage`
- **Goal:** Create and review product categories using the current simple workflow.

```text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established.
Apply the MASTER DESIGN DNA and SHARED RESPONSIVE SHELL: forest #173E31, leaf #2F6B42, ivory #F7F3E8, paper #FFFDF8, gold #D8A75B; Outfit for UI/data with tabular figures, Fraunces only for a major brand-level title. Create exactly two frames. All visible UI copy is Vietnamese. Use the exact shared Admin topbar/sidebar desktop shell and drawer mobile shell. Do not add notification/profile/cart, search, edit, delete, or status-changing actions that are absent from the current workflow.
Name those two frames “GH-P40-Category-Management-Desktop” at 1440×1024 and “GH-P40-Category-Management-Mobile” at 390×844.

Title “Quản lý danh mục”. Present a compact creation form with exactly “Tên danh mục” (required), “Mô tả”, status select options “Đang hoạt động” and “Ngừng hoạt động”, plus “Tạo danh mục”. Below it, show a table with exactly “Tên”, “Mô tả”, “Trạng thái”; use status labels “Đang hoạt động”/“Ngừng hoạt động”. Include inline required-field validation, disabled/submitting state, success banner after create, error alert, list loading skeleton and an intentional empty state. On mobile, stack all form fields and turn table rows into labeled category cards; do not use a horizontal table. All interactive targets are at least 44px, WCAG AA, with clear focus rings and calm paper/forest surfaces rather than bubbly generic cards or purple gradients.
```

## P41 — Admin replenishment approval

- **Route:** `/admin/replenishments`
- **Component:** `ReplenishmentAdminPage`
- **Goal:** Approve or reject warehouse replenishment requests without changing warehouse receipt flow.

```text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established.
Apply the MASTER DESIGN DNA and SHARED RESPONSIVE SHELL: forest #173E31, leaf #2F6B42, ivory #F7F3E8, paper #FFFDF8, gold #D8A75B; Outfit for UI/data with tabular figures, Fraunces only for a major brand-level title. Create exactly two frames. All visible UI copy is Vietnamese. Use the exact shared Admin InternalTopbar/sidebar desktop shell and mobile drawer; no notification/profile/cart, suppliers, purchase orders, or additional request fields.
Name those two frames “GH-P41-Admin-Replenishment-Approval-Desktop” at 1440×1024 and “GH-P41-Admin-Replenishment-Approval-Mobile” at 390×844.

Title “Duyệt bổ sung hàng”. Show the request table with exact columns “Sản phẩm”, “SL”, “Trạng thái”, action. Only when status is pending approval show “Duyệt” and “Từ chối”; all other statuses are read-only. Both decisions must require a confirmation dialog naming the product and the outcome; system note is represented as “[Đã duyệt/Đã từ chối] bởi quản trị viên”. Show disabled/submitting controls, successful result “Đã duyệt yêu cầu cho [tên].” or “Đã từ chối yêu cầu cho [tên].”, error alert, loading “Đang tải yêu cầu bổ sung...”, and empty “Chưa có yêu cầu chờ duyệt.” On mobile, use one request card containing every field and full-width decision actions only while pending. Preserve status pills, Vietnamese numbers, 44px touch targets, WCAG AA contrast/focus, and avoid generic SaaS dashboard patterns.
```

## P42 — System settings

- **Route:** `/admin/settings`
- **Component:** `SystemSettingsPage`
- **Goal:** Safely maintain the three system-wide operational thresholds.

```text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established.
Apply the MASTER DESIGN DNA and SHARED RESPONSIVE SHELL: forest #173E31, leaf #2F6B42, ivory #F7F3E8, paper #FFFDF8, gold #D8A75B; Outfit for UI/data with tabular figures, Fraunces only for a major brand-level title. Create exactly two frames. All visible UI copy is Vietnamese. Use the exact shared Admin topbar/sidebar desktop shell and mobile drawer; do not add notifications, profile, cart, tabs, extra settings, or invented integrations.
Name those two frames “GH-P42-System-Settings-Desktop” at 1440×1024 and “GH-P42-System-Settings-Mobile” at 390×844.

Title “Cấu hình hệ thống”. Use a focused settings form with exactly three numeric fields: “Ngưỡng cảnh báo tồn kho mặc định” (minimum 0, value 5), “Số ngày cho phép đổi trả” (minimum 0, value 7), and “Thời gian chờ thanh toán (phút)” (minimum 1, value 15). Offer only “Lưu cấu hình”. On submit, validate each minimum inline, present a confirmation dialog that the values apply system-wide, then success “Đã cập nhật cấu hình hệ thống.” and disabled saving state. Include initial loading/skeleton state, retryable error, and success/error banners. Desktop uses a restrained two-column form; mobile is one column with a sticky-but-not-obstructive save action. All numeric input uses tabular figures, controls are 44px minimum, focus states clear, colors WCAG AA. Keep surfaces paper-like and crisp; no purple gradients or uniform bubbly cards.
```

## Output checklist for Codex

- Generate exactly two frames per prompt, using the exact names and dimensions stated in P29–P42.
- Keep the selected frame route, component, Vietnamese labels, field constraints, and allowed actions faithful to the prompt; do not add features.
- Use the shared internal shell consistently: desktop `InternalTopbar + Sidebar`, mobile menu drawer, no notification/profile/cart shortcuts.
- Include desktop and mobile responsive behavior, table-to-card transformation, loading, empty, error, success, validation, confirmation, disabled, keyboard-focus, and 44px touch states.
- Return the Stitch frame links or exports to Codex, labelled by prompt ID and route, so implementation can begin.
