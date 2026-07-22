# Thiết kế tích hợp frontend responsive từ Stitch

## 1. Mục tiêu

Chuyển bộ thiết kế Stitch thành giao diện React responsive thống nhất cho GreenHome Kitchen mà không làm thay đổi API, RBAC, route hoặc state machine nghiệp vụ hiện có.

Kết quả cần đạt:

- Một Design DNA dùng chung cho storefront, Customer và không gian vận hành nội bộ.
- Header, Footer, Internal Topbar, Sidebar và Account Layout đồng nhất trên desktop/mobile.
- Toàn bộ route hiện hữu có giao diện phù hợp ở desktop và mobile.
- Tên, giá, ảnh, tồn kho, đơn hàng, thông báo và KPI luôn lấy từ API; không hard-code dữ liệu trong mockup.
- Mỗi module được triển khai và commit bằng đúng danh tính owner trong tài liệu nhóm.

## 2. Nguồn thiết kế và phạm vi

Nguồn tham chiếu nằm tại `D:\WW\GreenHouse_System\thiết kế stitch` và chỉ được dùng làm design input, không commit vào Git.

Kết quả kiểm kê:

- 88 file `code.html` và 88 file `screen.png`.
- 41 route có cặp Desktop/Mobile.
- Ba cặp shell: Public, Customer và Internal.
- P04 About không có export mới; giữ phần thân About hiện tại và chỉ đồng bộ shell/token.
- Sáu bản `DESIGN.md` có cùng SHA-256 và được xem là một nguồn token duy nhất.
- `part 3/gh_p22_staff_order_queue_desktop/screen.png` bị lỗi tải; `code.html` vẫn đầy đủ và là nguồn để dựng lại hình khi QA.

Các HTML Stitch là prototype Tailwind CDN, dùng Google Fonts, Material Symbols, ảnh `lh3.googleusercontent.com`, link `#` và dữ liệu minh họa. Không copy nguyên HTML hoặc phụ thuộc runtime vào các tài nguyên này.

### 2.1 Ma trận route canonical

`Export key` là tên folder dùng để tìm cặp `_desktop`/`_mobile`; đường dẫn file đều nằm dưới `client/src/`.

| P | Route | Role/shell | Page file | Owner | Export key |
|---|---|---|---|---|---|
| P01 | `/` | Public | `pages/public/HomePage.jsx` | Thành | `gh_p01_home` |
| P02 | `/products` | Public | `pages/public/ProductListingPage.jsx` | Chung | `gh_p02_product_catalog` |
| P03 | `/products/:id` | Public | `pages/public/ProductDetailPage.jsx` | Chung | `gh_p03_product_detail` |
| P04 | `/about` | Public | `pages/public/AboutPage.jsx` | Thành | Không có export; giữ body hiện tại |
| P05 | `/contact` | Public | `pages/public/ContactPage.jsx` | Thành | `gh_p05_contact` |
| P06 | `/login` | Public | `pages/auth/LoginPage.jsx` | Thành | `gh_p06_login` |
| P07 | `/register` | Public | `pages/auth/RegisterPage.jsx` | Thành | `gh_p07_register` |
| P08 | `/unauthorized` | Public | `pages/errors/UnauthorizedPage.jsx` | Thành | `c_n_ng_nh_p` |
| P09 | `/forbidden` | Public | `pages/errors/ForbiddenPage.jsx` | Thành | `kh_ng_c_quy_n_truy_c_p` |
| P10 | `/profile` | Account | `pages/profile/ProfilePage.jsx` | Thành | `h_s_c_nh_n` |
| P11 | `/notifications` | Account | `pages/notifications/NotificationPage.jsx` | Thành | `th_ng_b_o` |
| P12 | `/notifications/:id` | Account | `pages/notifications/NotificationDetailPage.jsx` | Thành | `chi_ti_t_th_ng_b_o` |
| P13 | `/cart` | Customer | `pages/customer/CartPage.jsx` | Huy | `gh_p13_cart` |
| P14 | `/checkout` | Customer | `pages/customer/CheckoutPage.jsx` | Huy | `gh_p14_checkout` |
| P15 | `/orders` | Customer | `pages/customer/OrderHistoryPage.jsx` | Huy | `gh_p15_orders` |
| P16 | `/orders/:id` | Customer | `pages/customer/OrderDetailPage.jsx` | Huy | `gh_p16_order_detail` |
| P17 | `/orders/:id/payment` | Customer | `pages/customer/PaymentPage.jsx` | Huy | `gh_p17_online_payment` |
| P18 | `/payments/result/:id` | Customer | `pages/customer/PaymentResultPage.jsx` | Huy | `gh_p18_payment_result` |
| P19 | `/return-refunds` | Customer | `pages/customer/ReturnRefundPage.jsx` | Nhật | `gh_p19_return_refund_history` |
| P20 | `/support` | Customer | `pages/customer/SupportPage.jsx` | Cường | `gh_p20_support` |
| P21 | `/staff` | Staff | `pages/staff/StaffDashboardPage.jsx` | Nhật | `gh_p21_staff_dashboard` |
| P22 | `/staff/orders` | Staff | `pages/staff/StaffOrderQueuePage.jsx` | Nhật | `gh_p22_staff_order_queue` |
| P23 | `/staff/orders/:id` | Staff | `pages/staff/StaffOrderDetailPage.jsx` | Nhật | `gh_p23_staff_order_detail` |
| P24 | `/staff/orders/:id/invoice` | Staff | `pages/staff/InvoicePrintPage.jsx` | Nhật | `gh_p24_staff_invoice_print` |
| P25 | `/staff/return-refunds` | Staff | `pages/staff/ReturnRefundQueuePage.jsx` | Nhật | `gh_p25_staff_return_refund_queue` |
| P26 | `/staff/return-refunds/:id` | Staff | `pages/staff/ReturnRefundDetailPage.jsx` | Nhật | `gh_p26_staff_return_refund_detail` |
| P27 | `/staff/support-requests` | Staff | `pages/staff/SupportQueuePage.jsx` | Nhật | `gh_p27_staff_support_queue` |
| P28 | `/staff/support-requests/:id` | Staff | `pages/staff/SupportDetailPage.jsx` | Nhật | `gh_p28_staff_support_request_detail` |
| P29 | `/warehouse` | Warehouse | `pages/warehouse/WarehouseDashboardPage.jsx` | Cường | `gh_p29_warehouse_dashboard` |
| P30 | `/warehouse/inventory` | Warehouse | `pages/warehouse/InventoryListPage.jsx` | Cường | `gh_p30_inventory` |
| P31 | `/warehouse/low-stock` | Warehouse | `pages/warehouse/LowStockPage.jsx` | Cường | `c_nh_b_o_s_p_h_t_h_ng` |
| P32 | `/warehouse/stock-exports` | Warehouse | `pages/warehouse/StockExportQueuePage.jsx` | Cường | `h_ng_i_xu_t_kho` |
| P33 | `/warehouse/stock-exports/:id` | Warehouse | `pages/warehouse/StockExportDetailPage.jsx` | Cường | `chi_ti_t_phi_u_xu_t_kho` |
| P34 | `/warehouse/replenishments` | Warehouse | `pages/warehouse/ReplenishmentPage.jsx` | Cường | `gh_p34_warehouse_replenishment` |
| P35 | `/warehouse/return-refunds` | Warehouse | `pages/warehouse/ReturnRefundQueuePage.jsx` | Cường | `gh_p35_return_inspection_queue` |
| P36 | `/warehouse/return-refunds/:id` | Warehouse | `pages/warehouse/ReturnRefundInspectionPage.jsx` | Cường | `gh_p36_return_inspection_detail` |
| P37 | `/admin` | Admin | `pages/admin/AdminDashboardPage.jsx` | Cường | `gh_p37_admin_dashboard` |
| P38 | `/admin/products` | Admin | `pages/admin/ProductManagementPage.jsx` | Chung | `gh_p38_product_management` |
| P39 | `/admin/audit-logs` | Admin | `pages/admin/AuditLogPage.jsx` | Thành | `gh_p39_audit_logs` |
| P40 | `/admin/categories` | Admin | `pages/admin/CategoryManagementPage.jsx` | Chung | `gh_p40_category_management` |
| P41 | `/admin/replenishments` | Admin | `pages/admin/ReplenishmentAdminPage.jsx` | Cường | `gh_p41_admin_replenishment_approval` |
| P42 | `/admin/settings` | Admin | `pages/admin/SystemSettingsPage.jsx` | Cường | `gh_p42_system_settings` |

Desktop và Mobile có thể minh họa hai state khác nhau của cùng route. State/action runtime luôn do API quyết định; không ép hai breakpoint dùng cùng mock record và không hard-code status để khớp ảnh.

## 3. Nguồn sự thật và thứ tự ưu tiên

Khi có mâu thuẫn, áp dụng thứ tự ưu tiên:

1. Backend model, API contract, RBAC và state machine hiện tại.
2. `docs/srs-sds-reconciliation/`.
3. `docs/member-plans/` và ownership addendum mới nhất.
4. Component/page React và test contract hiện tại.
5. Bộ prompt responsive đã được commit.
6. Stitch HTML/PNG chỉ quyết định presentation.

Không thêm route, quyền, field, trạng thái hoặc mutation chỉ vì chúng xuất hiện trong Stitch.

## 4. Design DNA chuẩn

### 4.1 Màu

| Token | Giá trị | Mục đích |
|---|---:|---|
| `--gh-forest` | `#173E31` | Navigation, primary action |
| `--gh-forest-deep` | `#12392D` | Heading, strong text |
| `--gh-leaf` | `#2F6B42` | Success, secondary emphasis |
| `--gh-ivory` | `#F7F3E8` | Page background |
| `--gh-paper` | `#FFFDF8` | Card, form, header surface |
| `--gh-gold` | `#D8A75B` | Premium badge, limited accent |
| `--gh-border` | `#DCE5D8` | Divider and input border |
| `--gh-muted` | `#657367` | Secondary text |
| `--gh-ink` | `#1C1C15` | Body text |
| `--gh-error` | `#BA1A1A` | Destructive/error state |

`#173E31` là primary canonical. Giá trị `#00281C` trong semantic map Stitch không thay thế primary brand.

### 4.2 Typography

- Fraunces: wordmark, page title và heading editorial.
- Outfit: navigation, UI controls, form, table, KPI và price.
- Body tối thiểu line-height 1.5 để bảo đảm dấu tiếng Việt không va chạm.
- Giá dùng tabular figures và định dạng hiện có, ví dụ `459.000 ₫`.

Fraunces và Outfit được self-host bằng WOFF2 trong `client/public/fonts/`, kèm license tương ứng, và khai báo một lần trong `tokens.css`. Dùng `font-display: swap`, preload các file thực sự cần ở application HTML và giữ fallback hệ thống. Không dùng Google Fonts runtime hoặc lặp font import theo page.

### 4.3 Kích thước và hình khối

- Base spacing: 4px.
- Desktop container: tối đa 1280px, gutter 40px.
- Mobile gutter: 16px.
- Control radius: 6px.
- Panel radius: 10px.
- Product/feature card radius: tối đa 16px.
- Touch target tối thiểu: 44x44px.
- Shadow chỉ dùng nhẹ: `0 10px 30px -10px rgba(23, 62, 49, 0.12)`.

## 5. Kiến trúc CSS và component

Không tiếp tục dồn toàn bộ style mới vào `client/src/styles.css`. Migration tạo các layer có scope rõ ràng và được import sau legacy CSS:

- `client/src/styles/tokens.css`: token màu, font, spacing, elevation và breakpoint.
- `client/src/styles/base.css`: body, heading, form control, focus và reduced motion.
- `client/src/styles/shared-shell.css`: Header, Footer, InternalTopbar, Sidebar, drawer và AccountLayout.
- `client/src/styles/storefront.css`: Home, Catalog, Product Detail, Auth và Customer flow.
- `client/src/styles/operations.css`: Staff, Warehouse và Admin.

`styles.css` vẫn tồn tại trong quá trình migration để tránh refactor ngoài phạm vi. `client/src/main.jsx` do Nguyễn Ngọc Thành sở hữu và import đúng thứ tự: legacy `styles.css` → `tokens.css` → `base.css` → `shared-shell.css` → `storefront.css` → `operations.css`. Selector mới phải bắt đầu từ shell/page class nhằm hạn chế override Home/About đã hoàn thiện. Chỉ branch Foundation được sửa import root và shared global layers; owner module sửa page layer tương ứng.

Component dùng lại logic hiện có, không chuyển prototype HTML thành một component khổng lồ.

### 5.1 Header storefront

Ba trạng thái dùng cùng cấu trúc:

- Guest: logo, public navigation, search và Login/Register; không cart/bell/avatar.
- Customer: public navigation, search, cart, notification bell và avatar menu.
- Mobile: hamburger/drawer, compact wordmark và đúng các action theo trạng thái đăng nhập.

Search tiếp tục điều hướng `/products?keyword=...`. Cart chỉ dành cho Customer. Không thêm wishlist hoặc bottom navigation.

### 5.2 Internal Topbar và Sidebar

- Staff/Warehouse/Admin dùng InternalTopbar, không dùng storefront Header/Footer.
- InternalTopbar có brand, “Không gian vận hành”, notification bell, user identity, translated role và account menu.
- Account menu chỉ có Profile, Notifications và Logout.
- Sidebar giữ nguyên `ROLE_LINKS`; không gộp menu của nhiều role.
- Desktop sidebar persistent; mobile dùng drawer có overlay, Escape/click-outside và scroll lock.

Quyết định này chủ động thay đổi contract cũ chỉ có identity/logout: notification là shared account capability theo reconciliation mới nhất, nhưng dashboard vẫn tuyệt đối không có cart hoặc public navigation. Branch Foundation phải cập nhật `components/layout/Layout.test.js`, thêm test visibility/unread/menu và xóa assertion cũ cấm `NotificationBell` trong InternalTopbar.

### 5.3 Footer

- Chỉ xuất hiện ở Public/Customer.
- Dùng cùng một desktop/mobile information architecture.
- Chỉ hiển thị route và contact hiện hữu.
- Không newsletter, social URL giả, careers, blog, floating chat hoặc bottom navigation.

### 5.4 Account Layout

- Customer dùng Customer Header/Footer.
- Internal role dùng InternalTopbar và compact account navigation, không dùng sidebar nghiệp vụ.
- Address Book chỉ hiển thị cho Customer.

## 6. Quy tắc tích hợp dữ liệu

- Product name, price, image và stock lấy từ `productService` và formatter hiện có.
- Home không tạo `productShowcase` tĩnh; loading/error/empty là ba state khác nhau.
- Category tile chỉ truyền category ID hợp lệ từ API; không đoán ID theo mockup.
- Quick-add giữ Guest redirect, non-Customer denial, Customer request pending/success/error.
- Review chỉ dành cho Customer có đơn Delivered chứa product; backend tiếp tục enforcement cuối.
- Cart, Checkout, Order và Payment giữ payload/service hiện tại.
- Staff/Warehouse/Admin KPI luôn lấy từ query/service thật.
- Mọi mutation nội bộ tiếp tục tuân thủ state machine hiện tại.

## 7. Những phần Stitch không được triển khai

- Wishlist/favorites hoặc bottom navigation có “Yêu thích”.
- Pagination, sort, quick view hoặc badge/rating nếu API không cung cấp.
- Buy now, color variant, quantity selector ở Product Detail nếu contract hiện tại không có.
- Visa/MoMo/ZaloPay/QR/chuyển khoản thật cho payment mock.
- Auto refund/e-wallet trước Warehouse inspection.
- Attachment, voice input, draft, reopen hoặc priority cho Support.
- Staff HR/report/QR scanner/create-order route.
- Admin/Warehouse cross-role navigation.
- Product/Category delete hoặc Category Draft khi API chỉ hỗ trợ Active/Inactive.
- Audit export/severity/abnormal-login action không có endpoint.
- Settings ngoài ba key canonical hiện có.
- Bất kỳ tên, giá, số KPI, order code hoặc người dùng demo nào.

## 8. Responsive và accessibility

Breakpoint kiểm thử chính: 390px, 768px, 1024px và 1440px.

- Table nội bộ chuyển thành card/list có label ở mobile; không ép table tràn ngang nếu action chính bị che.
- CTA quan trọng có thể sticky ở mobile nhưng không che Footer hoặc safe area.
- Drawer/dropdown hỗ trợ keyboard, Escape, click-outside và focus return.
- `focus-visible` rõ ràng; contrast đạt WCAG AA.
- Loading skeleton tôn trọng `prefers-reduced-motion`.
- Error không chỉ dùng màu; status có text/icon đi kèm.
- Tên dài và dấu tiếng Việt không bị truncate nếu đó là dữ liệu chính.

## 9. Phân chia theo owner

| Owner | Phạm vi frontend |
|---|---|
| Nguyễn Ngọc Thành | Design DNA, shared shell, Home, Contact, Auth, errors, Profile, Notifications, Audit UI, integration/review |
| Phạm Thành Chung | Catalog, Product Detail, Product Card/Filter, Admin Product và Category |
| Nguyễn Quang Huy | Cart, Checkout, Order History/Detail, Payment/Result |
| Nguyễn Hữu Anh Nhật | Customer Return/Refund và toàn bộ Staff Order/Refund/Support/Invoice |
| Lê Vũ Cường | Customer Support, Warehouse, Admin Dashboard/Replenishment/Settings |

Ranh giới Support: Cường sở hữu `pages/customer/SupportPage.jsx`, `services/supportService.js` và service contract tests; Nhật sở hữu `pages/staff/SupportQueuePage.jsx`, `pages/staff/SupportDetailPage.jsx` và test presentation/flow Staff, đồng thời chỉ tiêu thụ các hàm service đã thống nhất. Thành sở hữu `Layout.test.js`, `Header.test.js`, `Footer.test.js`, `AccountLayout.test.js`, `styles.test.js` và route/role regression dùng chung; owner module chỉ sửa test page/service trong phạm vi của mình.

Mỗi phạm vi dùng branch `feature/<owner-short>-<module>`, commit đúng tên/email trong reconciliation. Nguyễn Ngọc Thành review, merge `--no-ff` vào `main`, chạy regression, push `main` và xóa feature branch. Không stage `thiết kế stitch` hoặc các thay đổi cục bộ không liên quan.

## 10. Trình tự migration

1. Foundation: token, base style, canonical Header/Footer/InternalTopbar/Sidebar/AccountLayout.
2. Public/Auth/Account: Home/About harmonization, Contact, Login/Register/errors, Profile/Notifications.
3. Catalog/Admin catalog: Product Listing/Detail/Card/Filter và Admin Product/Category.
4. Customer purchase: Cart, Checkout, Orders và Payment.
5. Staff operations: Dashboard, Orders, Invoice, Return/Refund và Support.
6. Warehouse/Admin closure: Inventory, exports, replenishment, inspection, report/audit/settings.
7. Integration: full test/build, responsive QA và regression theo role.

Mỗi batch phải hoàn tất test và visual QA trước khi batch tiếp theo override cùng shared style.

## 11. Kiểm thử và tiêu chí hoàn thành

Mỗi branch phải chạy các test liên quan trước, sau đó full suite ở integration:

- Client unit tests.
- Client production build.
- Server tests khi UI phụ thuộc contract hoặc phát hiện mismatch cần xác minh.
- Layout contract tests cho guest/customer/internal separation.
- Header drawer, account menu, notification/cart visibility và logout behavior.
- Data passthrough test để chống tái diễn lỗi tên/giá Home.
- Route/role regression cho Customer, Staff, WarehouseManager và Admin.
- Visual QA ở 390/768/1440 cho ít nhất một route đại diện mỗi shell và mọi màn có table/form phức tạp.
- Console không có error, asset 404 hoặc React warning.

Hoàn thành chỉ khi 42 route hoạt động, P04 About không bị regression, không có mock data Stitch trong runtime, và mọi branch đã được Thành review/merge/push/xóa đúng quy trình.

## 12. Luồng prompt song song

Prompt Stitch tiếp tục được tạo/chạy song song để chuẩn hóa component hoặc bổ sung reference. Output mới không tự động thay đổi scope code. Mọi output vẫn phải qua cùng audit API/RBAC/state-machine trước khi được đưa vào implementation.
