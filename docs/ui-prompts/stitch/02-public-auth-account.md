# GreenHome Kitchen — Public, Authentication & Account Screens

Use these prompts after the Master Design DNA and Shared Responsive Shell have been created. Every prompt asks for exactly two frames: one Desktop `1440×1024` frame and one Mobile `390×844` frame. All UI copy must be Vietnamese.

## P01 — Home

**Route:** `/`
**Component:** `HomePage` inside `PublicLayout`
**Goal:** Preserve and harmonize the approved Home experience; show the GreenHome Kitchen storefront and discovery path.

```text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established.

Create exactly two frames named “GH-P01-Home-Desktop” at 1440×1024 and “GH-P01-Home-Mobile” at 390×844. Preserve the existing polished Home design rather than redesigning it; refine only where needed to harmonize with the project system. Use the public Header and Footer. All visible UI copy must be Vietnamese.

Keep the exact information architecture and actions: a hero for “Căn bếp xanh cho gia đình Việt hiện đại”, keyword search that goes to the product catalog, CTAs “Mua sắm ngay” and “Tìm hiểu GreenHome”; the four quick categories “Nồi chảo cao cấp”, “Dụng cụ sơ chế”, “Bàn ăn & phục vụ”, “Lưu trữ thông minh”; the weekly featured-products area (up to six product tiles with image, name, formatted price and “Xem chi tiết”); buying-trust content, customer reviews, and the closing CTA with “Mua sắm ngay” and “Tạo tài khoản”. Show the existing no-products message and “Đi tới catalog” as an explicit empty state. Include a featured-product loading skeleton. Do not invent checkout, wishlist, discount, or newsletter features.

Desktop should retain an editorial image-led rhythm with generous ivory space; mobile must stack sections, keep the search usable, and make CTAs full-width or easy to tap. Use forest #173E31, leaf #2F6B42, ivory #F7F3E8, paper #FFFDF8, warm gold #D8A75B, Fraunces for display and Outfit for UI. No purple gradients, generic SaaS dashboard, or uniformly bubbly cards. Meet WCAG AA, visible focus, semantic labels, and 44px minimum touch targets.
```

## P02 — Product catalog

**Route:** `/products`
**Component:** `ProductListingPage`
**Goal:** Help shoppers find kitchen products through search, category and price filters.

```text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established.

Create exactly two frames named “GH-P02-Product-Catalog-Desktop” at 1440×1024 and “GH-P02-Product-Catalog-Mobile” at 390×844. Use the public Header and Footer. All visible UI copy must be Vietnamese.

Design the existing catalog only: eyebrow “Catalog GreenHome”, title “Sản phẩm nhà bếp”, its existing explanatory paragraph, then a filter form with keyword field “Tìm sản phẩm”, category select default “Tất cả danh mục”, numeric “Giá từ” and “Giá đến”, and submit action “Lọc sản phẩm”. Below it show product cards using exact available data: image or “Chưa có ảnh”, product name, category fallback “Sản phẩm nhà bếp”, formatted price, “Xem chi tiết”, and the quick action “+ Thêm”. The quick action must communicate its existing states: loading, “Đã thêm”, anonymous user goes to login, and a brief error for a non-Customer role. Include loading skeletons, request-error alert, and exact empty-state intent “Không tìm thấy sản phẩm phù hợp” with advice to relax filters or shorten the keyword. Do not add sort, wishlist, pagination, ratings, or other filters.

On desktop place the filter row clearly above an editorial product grid; on mobile turn filtering into a compact, vertically ordered form and maintain product-card scanability. Apply forest #173E31, leaf #2F6B42, ivory #F7F3E8, paper #FFFDF8 and warm gold #D8A75B, Fraunces display / Outfit UI. Avoid purple gradients, generic SaaS styling and identical rounded cards. Meet WCAG AA, visible keyboard focus and 44px touch targets.
```

## P03 — Product detail

**Route:** `/products/:id`
**Component:** `ProductDetailPage`
**Goal:** Present product information, cart action and eligible customer reviews.

```text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established.

Create exactly two frames named “GH-P03-Product-Detail-Desktop” at 1440×1024 and “GH-P03-Product-Detail-Mobile” at 390×844. Use the public Header and Footer. All visible UI copy must be Vietnamese.

Design only the current page behavior. Use a gallery with one large product image, a “Chưa có ảnh phù hợp” fallback, and thumbnail image selectors only when there is more than one image. Beside it show category fallback “Sản phẩm nhà bếp”, product name, SKU, description fallback, formatted price, and “Tồn kho: [quantity] [unit]”. A Customer sees “Thêm vào giỏ hàng”; a guest or non-customer instead sees “Đăng nhập để mua”; everyone can use “Quay lại catalog”. Show the success message “Đã thêm sản phẩm vào giỏ hàng.” and error alert state.

Below, retain “Đánh giá sản phẩm”, total reviews and average rating, review rows with rating/content, and the no-review message. Only the Customer review form is shown: delivered-order select “Chọn đơn hàng”, rating choices 5 to 1, required “Nội dung đánh giá”, and “Gửi đánh giá”; include its success and error states. Include product loading and product-load-error state with “Quay lại danh sách sản phẩm”. Do not add quantity controls, buy-now, wishlist, related products or invented specifications.

Desktop is an asymmetric, calm product editorial layout; mobile puts gallery before purchase information and keeps gallery thumbnails reachable. Use the established GreenHome palette and typography, no purple gradients, generic SaaS patterns, or uniformly bubbly cards. WCAG AA, 44px touch targets, clear selected thumbnail state, form validation and focus are mandatory.
```

## P04 — About GreenHome

**Route:** `/about`
**Component:** `AboutPage`
**Goal:** Preserve the existing designed brand story and values page.

```text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established.

Create exactly two frames named “GH-P04-About-Desktop” at 1440×1024 and “GH-P04-About-Mobile” at 390×844. Preserve the existing polished About design rather than redesigning it; use the public Header and Footer. All visible UI copy must be Vietnamese.

Retain the exact narrative structure: the hero “Câu chuyện về GreenHome Kitchen” with its current kitchen-green mission copy and kitchen image; the alternating mission section “Sứ mệnh của chúng tôi” with the two existing mission paragraphs and cookware image; then “Giá trị cốt lõi” and its explanatory sentence, followed by precisely three values: “Chất lượng tuyển chọn”, “Minh bạch & Tin cậy”, and “Bền vững”, each with its established description. Preserve meaningful image alt text. Do not add metrics, a team, timeline, CTA, or invented content.

Desktop should keep the spacious editorial grid and deliberate image/copy alternation. Mobile should naturally stack media and text without shrinking the story into tiny cards. Use the established forest #173E31, leaf #2F6B42, ivory #F7F3E8, paper #FFFDF8, warm gold #D8A75B and Fraunces/Outfit pairing. No purple gradients, generic SaaS, or uniform bubbly cards. Ensure WCAG AA and 44px minimum header/footer touch targets.
```

## P05 — Contact

**Route:** `/contact`
**Component:** `ContactPage`
**Goal:** Provide direct contact methods, message form and Hanoi location.

```text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established.

Create exactly two frames named “GH-P05-Contact-Desktop” at 1440×1024 and “GH-P05-Contact-Mobile” at 390×844. Use the public Header and Footer. All visible UI copy must be Vietnamese.

Keep the exact content and actions: hero “Liên hệ với chúng tôi” with its supporting paragraph; contact panel “Thông tin liên hệ” containing GreenHome Kitchen, Hà Nội, Việt Nam; phone “0856 464 980” and “Thứ 2 - Chủ nhật / 8:00 - 18:00”; email “kitchennhas@greenhome.com”; social actions for map, email and telephone. Alongside it build “Gửi tin nhắn” with required fields “Họ và tên”, “Email”, “Chủ đề”, “Nội dung tin nhắn” and the “Gửi tin nhắn” button. Show native-required validation and the existing success text that GreenHome will respond soon. Include the Hanoi map block with “Mở Google Maps” and the final support/FAQ link “Xem trung tâm hỗ trợ & FAQ →”. Do not invent support categories, chat, ticket number or address fields.

Desktop uses a composed two-column contact/form composition with map below; mobile stacks it in the same priority order. Use the established palette and Fraunces/Outfit, no purple gradients, generic SaaS, or uniform bubbly cards. Meet WCAG AA, visible focus/errors, labels instead of placeholder-only fields, and 44px targets.
```

## P06 — Login

**Route:** `/login`
**Component:** `LoginPage`
**Goal:** Let any existing account sign in and continue to its role-specific dashboard.

```text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established.

Create exactly two frames named “GH-P06-Login-Desktop” at 1440×1024 and “GH-P06-Login-Mobile” at 390×844. Use the public Header and Footer. All visible UI copy must be Vietnamese.

Create a focused authentic GreenHome sign-in surface with title “Đăng nhập”, supporting copy “Truy cập tài khoản GreenHome Kitchen của bạn.”, required Email and “Mật khẩu” inputs, primary action “Đăng nhập”, request-error alert space, and the exact cross-link “Chưa có tài khoản? Đăng ký”. Successful login goes to the role-appropriate dashboard, but do not show or invent role selection, social login, remember-me, password reset, OTP, or onboarding.

Desktop may use restrained brand photography/texture only if it does not distract from the form; mobile is one calm, edge-aware column. Do not use a generic floating SaaS auth card or purple gradient. Use forest #173E31, leaf #2F6B42, ivory #F7F3E8, paper #FFFDF8, warm gold #D8A75B and Fraunces display / Outfit UI. Show invalid/disabled/submitting and request-error states, WCAG AA contrast, labels, focus indicators, and 44px controls.
```

## P07 — Register

**Route:** `/register`
**Component:** `RegisterPage`
**Goal:** Create a Customer account for ordering and order tracking.

```text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established.

Create exactly two frames named “GH-P07-Register-Desktop” at 1440×1024 and “GH-P07-Register-Mobile” at 390×844. Use the public Header and Footer. All visible UI copy must be Vietnamese.

Create only the existing customer registration form: title “Đăng ký”; supporting sentence about creating a customer account to order and follow purchases; required “Họ và tên”, “Email”, “Số điện thoại”, “Mật khẩu”, and “Địa chỉ” fields; primary “Đăng ký”; request-error alert; and exact cross-link “Đã có tài khoản? Đăng nhập”. Registration succeeds by returning to login. Do not add confirmation password, role picker, terms checkbox, social sign-up, OTP, profile image, or marketing consent.

Desktop supports the longer form with clear grouping and breathing room; mobile makes the full sequence one easy-scroll column with no clipped CTA. Use the established GreenHome palette and Fraunces/Outfit. Avoid purple gradients, generic SaaS authentication, and uniform bubbly cards. Depict native required validation, error, submitting and success/redirect feedback; meet WCAG AA, labels, focus and 44px touch targets.
```

## P08 — Authentication required

**Route:** `/unauthorized`
**Component:** `UnauthorizedPage`
**Goal:** Explain that login is required and offer the only recovery action.

```text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established.

Create exactly two frames named “GH-P08-Authentication-Required-Desktop” at 1440×1024 and “GH-P08-Authentication-Required-Mobile” at 390×844. Use the public Header and Footer. All visible UI copy must be Vietnamese.

Create a concise, dignified access-state page with exactly: title “Cần đăng nhập”, message “Vui lòng đăng nhập trước khi truy cập trang này.”, and primary action “Đi tới đăng nhập” leading to login. Use a clear illustrative access/lock cue consistent with a warm kitchen brand, not an alarming system-error screen. Do not add back, home, registration, support, error codes, or any other action.

Desktop centers the content within a generous public-page field; mobile keeps it vertically balanced without hiding the Header/Footer interaction. Use the established palette and typography, no purple gradients, generic SaaS or bubbly cards. WCAG AA, a visible focus state and a 44px minimum button are required.
```

## P09 — Access forbidden

**Route:** `/forbidden`
**Component:** `ForbiddenPage`
**Goal:** Explain role-based access denial and return the signed-in user to profile.

```text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established.

Create exactly two frames named “GH-P09-Access-Forbidden-Desktop” at 1440×1024 and “GH-P09-Access-Forbidden-Mobile” at 390×844. Use the public Header and Footer. All visible UI copy must be Vietnamese.

Create a calm, respectful permission-state page with exactly: title “Không có quyền truy cập”, message “Vai trò hiện tại của bạn không được phép vào khu vực này.”, and action “Quay lại hồ sơ” leading to profile. It may use a subtle permission/shield visual but must remain a brand-consistent customer-facing page. Do not add admin-contact, retry, home or other actions.

Desktop centers the state with editorial restraint; mobile preserves legibility and the reachable action. Use the GreenHome palette and Fraunces/Outfit system. No purple gradients, generic SaaS error treatment or uniform bubbly cards. Meet WCAG AA, visible focus and 44px target sizing.
```

## P10 — Profile

**Route:** `/profile`
**Component:** `ProfilePage` inside `AccountLayout`
**Goal:** Let users update profile, password and—only for Customers—saved delivery addresses.

```text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established.

Create exactly two frames named “GH-P10-Profile-Desktop” at 1440×1024 and “GH-P10-Profile-Mobile” at 390×844. All visible UI copy must be Vietnamese. For Customer, use Header and Footer plus the compact account navigation (“Hồ sơ cá nhân”, “Thông báo”); for Staff, WarehouseManager or Admin use InternalTopbar and the same compact account navigation, with no sidebar dashboard. Do not expose customer-only address management to internal roles.

Retain the exact page: eyebrow “Tài khoản của bạn”, title “Hồ sơ cá nhân”, role-aware supporting copy, identity area with avatar or initials, name, email, translated role, “Thay ảnh”, conditional “Xóa ảnh”, and JPEG/PNG/WebP maximum 5 MB note. Then “Thông tin cá nhân” with editable required “Họ và tên”, Vietnamese mobile “Số điện thoại”, required “Địa chỉ cơ bản”, and “Lưu thay đổi”; plus “Đổi mật khẩu” with current/new/confirmation password and “Đổi mật khẩu”. Show loading, success alert, error alert, busy button labels and validation.

For Customer only, include “Sổ địa chỉ”: address cards with label, default badge, receiver/phone/full address; actions “Chỉnh sửa”, conditional “Đặt mặc định”, and “Xóa” with confirmation; empty state; and the add/edit address form with Nhãn địa chỉ, Người nhận, Số điện thoại, Tỉnh/Thành, Quận/Huyện, Phường/Xã, Địa chỉ chi tiết, default checkbox, save/update and conditional “Hủy”. Do not add preferences, delete account, order history, or settings.

Desktop uses an account workspace with concise navigation, not a SaaS admin sidebar; mobile turns navigation into a horizontal tab strip or compact control and stacks forms/cards. Use established palette/type, no purple gradients, generic SaaS or uniformly bubbly cards. WCAG AA, input labels, clear errors/success, focus and 44px targets are mandatory.
```

## P11 — Notifications inbox

**Route:** `/notifications`
**Component:** `NotificationPage` inside `AccountLayout`
**Goal:** List, filter, refresh, read and delete the user’s notifications.

```text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established.

Create exactly two frames named “GH-P11-Notifications-Inbox-Desktop” at 1440×1024 and “GH-P11-Notifications-Inbox-Mobile” at 390×844. All visible UI copy must be Vietnamese. For Customer, use Header and Footer; for Staff, WarehouseManager or Admin use InternalTopbar. Keep compact account navigation and do not use a sidebar dashboard.

Show eyebrow “Trung tâm thông báo”, title “Thông báo”, and the dynamic summary of unread notifications or no new notifications, with “Làm mới”. Use the exact tabs “Tất cả” and “Chưa đọc [count]”. Notification rows contain unread dot state, subject, Vietnamese formatted date/time, content preview and read status. Tapping a row opens detail; only read rows show the “Xóa” action. Include initial loading, load-more busy state and “Xem thêm” only when another cursor exists, request error alert, plus exact empty intentions: no unread notifications or no notifications at all. Do not add mark-all-read, search, notification preferences, bulk selection, or notification categories.

Desktop should read like a refined correspondence list; mobile turns each row into a touch-friendly vertical list item while retaining delete separation. Use the established palette/type, no purple gradients, generic SaaS or uniform bubbly cards. WCAG AA, selected-tab state, focus states and 44px controls are required.
```

## P12 — Notification detail

**Route:** `/notifications/:id`
**Component:** `NotificationDetailPage` inside `AccountLayout`
**Goal:** Display one notification, automatically mark it read, and link to its relevant work when available.

```text
Continue in the same GreenHome Kitchen Stitch project and strictly follow MASTER DESIGN DNA and SHARED RESPONSIVE SHELL already established.

Create exactly two frames named “GH-P12-Notification-Detail-Desktop” at 1440×1024 and “GH-P12-Notification-Detail-Mobile” at 390×844. All visible UI copy must be Vietnamese. For Customer, use Header and Footer; for Staff, WarehouseManager or Admin use InternalTopbar. Keep compact account navigation and do not use a sidebar dashboard.

Create the exact detail hierarchy: back link “← Quay lại thông báo”, translated notification-type eyebrow, subject, Vietnamese long date/time, full content, and error alert. On entry the item is marked read. When the notification has a supported target, show only “Xem nội dung liên quan”: Customer Order goes to that order; Staff Order goes to the staff order; Staff ReturnRefundRequest goes to its return/refund; WarehouseManager ReturnRefundRequest goes to warehouse inspection; other ReturnRefundRequest falls back to return/refunds. When the notification is read, show “Xóa thông báo”; after deletion return to the inbox. Include loading state and full load-error state with the back link. Do not add mark unread, share, pin, reply or any generic activity controls.

Desktop presents a quiet readable letter-like surface; mobile keeps the back/action controls reachable and content comfortably line-length limited. Use established palette/type, no purple gradients, generic SaaS or uniform bubbly cards. Ensure WCAG AA, visible focus, semantic time/action labelling and 44px targets.
```

## What to send back to Codex

- Stitch project/share link and the 24 exact frame names above.
- Exported Desktop and Mobile screenshots for P01–P12, or inspectable frame links.
- Any image assets used that are not already in the repository, with licensing/source note.
- A brief list of intentional deviations from the prompts; do not silently add features or change Vietnamese copy.
