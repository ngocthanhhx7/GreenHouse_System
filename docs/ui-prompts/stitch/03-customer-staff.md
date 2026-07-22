# Stitch prompts — Customer & Staff

Apply every prompt in the one GreenHome Kitchen Responsive UI Stitch project after the established Master Design DNA and Shared Responsive Shell. Each output must contain exactly two named frames using its prompt ID and screen name.

## P13 — Customer cart
Route: /cart
Component: CartPage
Goal: Review selected products, adjust quantities, remove lines, then checkout.

~~~text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established. Design Customer route /cart. Create exactly two frames named “GH-P13-Cart-Desktop” at 1440×1024 and “GH-P13-Cart-Mobile” at 390×844. Use Customer Header and Footer. Forest #173E31, leaf #2F6B42, ivory #F7F3E8, paper #FFFDF8, gold #D8A75B; Fraunces editorial headings and Outfit UI/data. All UI copy Vietnamese. Show “Chảo gốm chống dính GreenHome”, “Nước rửa chén sinh học 500 ml”, “Dao bếp inox 8 inch”, quantities and VND subtotals. Desktop line-item table + sticky summary; mobile product cards + safe-area checkout. Include empty, loading skeleton, retryable error, successful quantity update, remove confirmation and disabled checkout. WCAG AA, focus, 44px. No purple/generic SaaS/bubbly-card treatment.
~~~

## P14 — Customer checkout
Route: /checkout
Component: CheckoutPage
Goal: Place an order with delivery address, payment method and note.

~~~text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established. Design /checkout. Create exactly two frames named “GH-P14-Checkout-Desktop” at 1440×1024 and “GH-P14-Checkout-Mobile” at 390×844 with Customer Header/Footer. Use the same GreenHome colors, Fraunces headings and Outfit UI; Vietnamese only. Show “Địa chỉ nhận hàng — Phương thức thanh toán — Xác nhận đơn”; saved default-address selector; new address form: người nhận, điện thoại, tỉnh/thành, quận/huyện, phường/xã, địa chỉ chi tiết, optional save-address/label. Payment only “Thanh toán khi nhận hàng” and “Thanh toán trực tuyến”; note; realistic VND order summary and “Đặt hàng”. Desktop sticky summary; mobile stacks with thumb submit. Show field/phone validation, empty-cart disabled submit, skeleton, submitting, error and success transition. Do not invent voucher, shipping choice or provider.
~~~

## P15 — Customer orders
Route: /orders
Component: OrderHistoryPage
Goal: Scan and open prior orders.

~~~text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established. Design /orders. Create exactly two frames named “GH-P15-Orders-Desktop” at 1440×1024 and “GH-P15-Orders-Mobile” at 390×844 with Customer Header/Footer. Use GreenHome colors, Fraunces title, Outfit data, Vietnamese copy. Show “Lịch sử mua hàng”, realistic orders GH-240718-081 and GH-240713-052, VND totals, payment method/status, order status chips and “Xem chi tiết”. Desktop table; mobile structured order cards. Include skeleton, no-orders state “Mua thêm sản phẩm”, error/retry, current nav, WCAG AA/focus/44px. No filters or actions outside lifecycle.
~~~

## P16 — Customer order detail
Route: /orders/:id
Component: OrderDetailPage
Goal: View information and take only state-permitted actions.

~~~text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established. Design /orders/:id. Create exactly two frames named “GH-P16-Order-Detail-Desktop” at 1440×1024 and “GH-P16-Order-Detail-Mobile” at 390×844, Customer Header/Footer, GreenHome palette, Fraunces headings, Outfit UI, Vietnamese copy. Present GH-240718-081 with timeline Chờ xác nhận, Đã xác nhận, Đã đóng gói, Đang giao, Đã giao; address, receiver, note, payment status, products, VND total. Conditional variants: online pending gives “Thanh toán online”; Pending/WaitingForPayment plus unpaid/failed gives “Hủy đơn hàng” confirmation; Delivered gives required “Lý do” return/refund form. Include loading, not-found/error, success, validation, confirmation and disabled/submitting. Mobile stacks facts and condenses timeline. Never return before Delivered or cancel outside allowed state. WCAG AA/44px.
~~~

## P17 — Customer online payment
Route: /orders/:id/payment
Component: PaymentPage
Goal: Present the existing mock online-payment attempt and outcomes.

~~~text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established. Design /orders/:id/payment. Create exactly two frames named “GH-P17-Online-Payment-Desktop” at 1440×1024 and “GH-P17-Online-Payment-Mobile” at 390×844, Customer Header/Footer, same customer DNA, Vietnamese copy and realistic VND. This is controlled demo payment, not a provider checkout: GH-240718-081, 1.248.000 ₫, “Chờ thanh toán”, “Mô phỏng thanh toán thành công”, destructive-outline “Mô phỏng thanh toán thất bại”, “Quay lại đơn hàng”. Include preparation skeleton, callback submitting/disabled, error/retry and safe back. Quiet transaction card only; do not invent QR, bank or receipt. Mobile stacks 44px actions; WCAG AA.
~~~

## P18 — Customer payment result
Route: /payments/result/:id
Component: PaymentResultPage
Goal: Confirm returned payment status and return customer to order.

~~~text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established. Design /payments/result/:id. Create exactly two frames named “GH-P18-Payment-Result-Desktop” at 1440×1024 and “GH-P18-Payment-Result-Mobile” at 390×844 with Customer Header/Footer, GreenHome palette, Fraunces customer hierarchy and Outfit UI. Vietnamese copy only. One calm composition supports Paid success “Thanh toán thành công” and Failed/Unknown amber warning “Thanh toán chưa hoàn tất”. Show GH-240718-081, 1.248.000 ₫, explanation, “Xem đơn hàng”; only failed state can offer “Thử lại thanh toán” back to attempt. Include verification loading, error/retry and icon-plus-text status. No receipt/provider features; WCAG AA and 44px.
~~~

## P19 — Customer return/refund history
Route: /return-refunds
Component: ReturnRefundPage
Goal: Track previously submitted requests.

~~~text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established. Design /return-refunds. Create exactly two frames named “GH-P19-Return-Refund-History-Desktop” at 1440×1024 and “GH-P19-Return-Refund-History-Mobile” at 390×844 with Customer Header/Footer, GreenHome premium botanical styling and Vietnamese copy. Show “Yêu cầu đổi trả / hoàn tiền” for GH-240701-043 and GH-240628-019: statuses Chờ xử lý, Chờ kiểm hàng, Sẵn sàng hoàn tiền, Từ chối, Hoàn tất; VND refund amount, reason, staff note. Desktop readable table; mobile descriptive cards. Include skeleton, empty explanation that requests begin from an eligible delivered order, error/retry, long reason readability. No new-request action. WCAG AA/44px/no generic SaaS.
~~~

## P20 — Customer support
Route: /support
Component: SupportPage
Goal: Submit a request and see customer request history.

~~~text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established. Design /support. Create exactly two frames named “GH-P20-Support-Desktop” at 1440×1024 and “GH-P20-Support-Mobile” at 390×844 with Customer Header/Footer, GreenHome customer system and Vietnamese copy. Form “Gửi yêu cầu hỗ trợ”: required Chủ đề/Nội dung, optional Mã đơn hàng. “Yêu cầu của tôi” shows realistic tickets, optional order code, statuses Mới/Đang mở/Đang xử lý/Đã giải quyết and staff response. Desktop form then table; mobile stack/cards. Include validation, guidance, disabled/submitting, success refresh, skeleton, empty and retryable error. Do not add attachment, live chat, priority or ticket actions. WCAG AA/44px.
~~~

## P21 — Staff dashboard
Route: /staff
Component: StaffDashboardPage
Goal: Operational snapshot and queue access.

~~~text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established. Design internal /staff. Create exactly two frames named “GH-P21-Staff-Dashboard-Desktop” at 1440×1024 and “GH-P21-Staff-Dashboard-Mobile” at 390×844. Desktop: InternalTopbar + persistent Staff Sidebar; mobile: InternalTopbar + drawer. Never notification/profile/cart in internal topbar. Outfit-led internal UI, forest #173E31/leaf #2F6B42/ivory #F7F3E8/paper #FFFDF8/gold #D8A75B, Vietnamese copy. Only real metrics: “Đơn chờ xử lý” 2, “Đổi trả chờ duyệt” 1, “Hỗ trợ đang mở” 2; links to three queues. Include skeleton, partial-data warning, error/retry, zero-work, current sidebar. Mobile full-width 44px actions. No charts, purple or generic SaaS.
~~~

## P22 — Staff order queue
Route: /staff/orders
Component: StaffOrderQueuePage
Goal: Filter and open orders requiring action.

~~~text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established. Design internal /staff/orders. Create exactly two frames named “GH-P22-Staff-Order-Queue-Desktop” at 1440×1024 and “GH-P22-Staff-Order-Queue-Mobile” at 390×844. InternalTopbar + Staff Sidebar desktop, drawer mobile, no notification/profile/cart. Outfit and GreenHome operational colors; Vietnamese copy. “Hàng đợi xử lý đơn” select defaults “Chờ xác nhận”; only choices Tất cả trạng thái, Chờ xác nhận, Đã xác nhận, Đang yêu cầu xuất kho, Đã đóng gói, Đang giao, Đã giao. Rows: code, COD/Trực tuyến/payment status, order status, VND total, “Mở đơn”. Desktop table; mobile cards. Include filter skeleton, no results, error/retry, focus and disabled loading control. No search/bulk/assignment/invented states. WCAG AA/44px.
~~~

## P23 — Staff order detail
Route: /staff/orders/:id
Component: StaffOrderDetailPage
Goal: Process order through only allowed transitions.

~~~text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established. Design /staff/orders/:id. Create exactly two frames named “GH-P23-Staff-Order-Detail-Desktop” at 1440×1024 and “GH-P23-Staff-Order-Detail-Mobile” at 390×844. Internal Staff shell; no notification/profile/cart. Outfit operational UI, GreenHome colors, Vietnamese copy. GH-240718-081 shows payment/status, address, product table, VND total and “In hóa đơn”. Exact conditional actions: Pending → “Xác nhận đơn”; Confirmed → “Yêu cầu xuất kho”; COD Packed/Shipped unpaid → “Đã thu COD”; only allowed next-status buttons; Pending/Confirmed allows required cancel reason + destructive “Hủy đơn”. Include confirmation, validation, submitting/success/error, loading/not-found. Mobile stacks facts/product cards. No arbitrary status or illegal cancellation. WCAG AA/44px.
~~~

## P24 — Staff invoice print
Route: /staff/orders/:id/invoice
Component: InvoicePrintPage
Goal: Review print-ready invoice and invoke browser print.

~~~text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established. Design /staff/orders/:id/invoice. Create exactly two frames named “GH-P24-Staff-Invoice-Print-Desktop” at 1440×1024 and “GH-P24-Staff-Invoice-Print-Mobile” at 390×844. Internal shell, no notification/profile/cart; Outfit, GreenHome colors and Vietnamese copy. Center document-like “Hóa đơn HD-240718-081” / GH-240718-081: receiver/phone, address, realistic products, quantities, unit prices, subtotals, total 1.248.000 ₫. Separate “In hóa đơn” and “Quay lại đơn hàng”; print-safe treatment removes navigation. Include skeleton, unavailable error/back/retry, print-in-progress. Mobile readable receipt/full-width print. Do not invent download, tax, provider or payment controls. WCAG AA/44px.
~~~

## P25 — Staff return/refund queue
Route: /staff/return-refunds
Component: ReturnRefundQueuePage
Goal: Filter and open return/refund requests.

~~~text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established. Design /staff/return-refunds. Create exactly two frames named “GH-P25-Staff-Return-Refund-Queue-Desktop” at 1440×1024 and “GH-P25-Staff-Return-Refund-Queue-Mobile” at 390×844. InternalTopbar + Sidebar desktop, drawer mobile, never notification/profile/cart. Outfit and GreenHome operational palette; Vietnamese copy. “Hàng đợi đổi trả / hoàn tiền” default “Chờ xử lý”; only Tất cả trạng thái, Chờ xử lý, Chờ kiểm hàng, Sẵn sàng hoàn tiền, Từ chối, Hoàn tất. Rows: order code, lifecycle status, VND refund, reason, “Mở yêu cầu”; mobile cards preserve data/action. Include skeleton, empty, error/retry, status key. No customer creation, bulk action, warehouse inspection or off-lifecycle statuses. WCAG AA/44px.
~~~

## P26 — Staff return/refund detail
Route: /staff/return-refunds/:id
Component: ReturnRefundDetailPage
Goal: Decide, await warehouse inspection, then complete refund.

~~~text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established. Design /staff/return-refunds/:id. Create exactly two frames named “GH-P26-Staff-Return-Refund-Detail-Desktop” at 1440×1024 and “GH-P26-Staff-Return-Refund-Detail-Mobile” at 390×844. Internal Staff shell, no notification/profile/cart, Outfit and GreenHome colors, Vietnamese copy. Show request GH-240701-043: status, reason, order total, products. Exact lifecycle: Pending has “Số tiền hoàn”, required “Ghi chú quyết định”, “Duyệt để kiểm hàng” and destructive “Từ chối”; AwaitingInspection says staff cannot refund; ReadyForRefund gives optional “Ghi chú hoàn tiền” + “Hoàn tất hoàn tiền”; Rejected/Completed read-only. Include validation, all confirmations, disabled submitting, success/error, skeleton/not-found. Desktop table becomes mobile product cards. Never manual inspection or refund before ReadyForRefund. WCAG AA/44px.
~~~

## P27 — Staff support queue
Route: /staff/support-requests
Component: SupportQueuePage
Goal: Filter and open customer support requests.

~~~text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established. Design /staff/support-requests. Create exactly two frames named “GH-P27-Staff-Support-Queue-Desktop” at 1440×1024 and “GH-P27-Staff-Support-Queue-Mobile” at 390×844. Staff InternalTopbar/Sidebar desktop, drawer mobile; no notification/profile/cart. GreenHome operational colors, Outfit, Vietnamese copy. “Hàng đợi hỗ trợ” filters Tất cả trạng thái, Mới, Đang mở, Đang xử lý, Đã giải quyết. Rows: subject, optional order code, status, “Mở yêu cầu”, e.g. “Cần hỗ trợ giao hàng” / GH-240718-081. Desktop table/mobile cards. Include skeleton, no-results, error/retry, focus and disabled filter. No assignment, priority, chat, attachment, search or bulk action. WCAG AA/44px.
~~~

## P28 — Staff support request detail
Route: /staff/support-requests/:id
Component: SupportDetailPage
Goal: Read request and send the only lifecycle-valid response/status update.

~~~text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established. Design /staff/support-requests/:id. Create exactly two frames named “GH-P28-Staff-Support-Request-Detail-Desktop” at 1440×1024 and “GH-P28-Staff-Support-Request-Detail-Mobile” at 390×844. InternalTopbar + Sidebar desktop/drawer mobile; no notification/profile/cart. Outfit, #173E31/#2F6B42/#F7F3E8/#FFFDF8/#D8A75B, Vietnamese copy. Show subject, optional order, status, customer content. Unresolved requests show required “Phản hồi” textarea and only lifecycle-valid select: New/Open → “Đang xử lý”; InProgress → “Đã giải quyết”. Resolved read-only with stored response. Include validation, disabled/submitting, success, save error/retry, skeleton, not-found. Mobile stacks facts/form with safe 44px action. Do not add reopen, arbitrary status, assignment, internal note, attachment or chat. WCAG AA/no generic SaaS.
~~~

## Handoff checklist for Codex

- [ ] Each P13–P28 output has exactly Desktop — 1440 × 1024 and Mobile — 390 × 844.
- [ ] Export/share 32 primary frame links/images (16 desktop-mobile pairs) in P13–P28 order, retaining frame names.
- [ ] Include the requested conditional/lifecycle state variants.
- [ ] All visible copy is Vietnamese and example money is VND.
- [ ] Preserve Home/About direction through the same Master and Shared Shell tokens.
