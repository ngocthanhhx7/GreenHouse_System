# Kế hoạch hoàn thiện Tài khoản, Media, Thông báo và Địa chỉ

> Người điều phối và người review/merge: **Nguyễn Ngọc Thành**
> Phạm vi: bổ sung các luồng còn thiếu sau khi đối chiếu SRS/SDS, đồng thời áp dụng logic quen thuộc của các hệ thống thương mại điện tử production-like.

## 1. Mục tiêu

- Cho phép Admin/Staff tải ảnh sản phẩm từ máy local, lưu ổn định trong thư mục `server/uploads/products` và hiển thị qua URL public.
- Bổ sung avatar và hồ sơ có thể chỉnh sửa, không biến trang hồ sơ thành màn hình chỉ đọc.
- Tách trang Hồ sơ và Thông báo khỏi dashboard nghiệp vụ.
- Bell trên Header mở dropdown xem nhanh; chỉ khi chọn thông báo mới đi tới trang chi tiết.
- Quản lý trạng thái đã đọc/chưa đọc và không cho xóa thông báo chưa đọc.
- Cho phép Customer chọn địa chỉ đã lưu/mặc định khi checkout hoặc nhập địa chỉ mới.
- Giữ nguyên các luồng Product, Cart, Checkout, Order, Staff và Warehouse đang có; thay đổi phải có kiểm thử hồi quy.

## 2. Logic tham chiếu từ sản phẩm lớn

| Nhu cầu | Logic tham chiếu | Quyết định cho GreenHome |
|---|---|---|
| Media sản phẩm | Shopify cho phép tải nhiều media, media đầu tiên là ảnh đại diện, có thể thay thế/xóa | `imageUrls` vẫn là mảng; thêm endpoint upload nhiều ảnh, chọn ảnh chính và xóa ảnh không còn dùng |
| Hồ sơ và địa chỉ | Shopify cho phép Customer sửa thông tin, thêm/sửa địa chỉ và đặt địa chỉ mặc định; thông tin đã lưu được dùng để điền checkout | Tách `User` và `UserAddress`; checkout chỉ tạo snapshot địa chỉ trong Order |
| Thông báo | eBay có khu vực Messages và số lượng chưa đọc; Google Merchant có notification center, phân loại và dismiss | Bell hiển thị unread count + tối đa 5 thông báo mới; trang riêng có lọc, chi tiết và thao tác đọc/xóa theo rule |
| An toàn dữ liệu | Các hệ thống production không cho thay đổi dữ liệu đơn hàng quá khứ khi hồ sơ/địa chỉ hiện tại thay đổi | Order lưu `receiverName`, `receiverPhone`, `shippingAddress` snapshot tại thời điểm đặt |

Nguồn tham khảo: [Shopify product media](https://help.shopify.com/en/manual/products/product-media/add-media), [Shopify customer accounts](https://help.shopify.com/en/manual/customers/customer-accounts), [Shopify managing customers](https://help.shopify.com/en/manual/customers/manage-customers?lang=en-US), [eBay My eBay](https://www.ca.ebay.com/help/account/my-ebay.html), [Google Merchant notification center](https://support.google.com/merchants/answer/15294848?hl=en).

## 3. Phân công chính

| Owner | Branch đề xuất | Phạm vi bắt buộc | Kết quả cần pull |
|---|---|---|---|
| Nguyễn Ngọc Thành | `feature/thanh-account-media-notification` | User/avatar/profile, upload foundation, Notification API/UI, AccountLayout, integration | API + màn hình Hồ sơ/Thông báo + test |
| Phạm Thành Chung | `feature/chung-product-media-upload` | Product image upload UI, preview, chọn ảnh chính, nối Product API | Admin product media + test |
| Nguyễn Quang Huy | `feature/huy-checkout-address-book` | Address selector tại checkout, địa chỉ mặc định, nhập địa chỉ mới và snapshot | Checkout address flow + test |
| Nguyễn Hữu Anh Nhật | `feature/nhat-order-return-reconciliation` | Staff order/return/support theo plan riêng | Không sở hữu Notification chung |
| Lê Vũ Cường | `feature/cuong-warehouse-admin-reconciliation` | Warehouse, Reports, Settings; phát event nghiệp vụ để Thành xử lý notification | Màn hình vận hành + API/test |

### Quy tắc ownership

- Thành sở hữu `Notification` dùng chung, `AccountLayout`, Header bell/dropdown và các route profile/account.
- Chung chỉ sở hữu media nghiệp vụ sản phẩm và tích hợp endpoint upload do Thành cung cấp; không sửa Header/Footer dùng chung.
- Huy chỉ tích hợp Address Book vào checkout; không sửa cách lưu snapshot của Order nếu không có contract.
- Nhật và Cường tạo event/domain payload, không tự tạo cơ chế notification thứ hai.
- Mọi PR ghi rõ actor, API, frontend, test evidence và dependency; Thành review rồi mới merge vào `main`.

## 4. Workstream A - Nguyễn Ngọc Thành

### A1. Schema và migration

- Đối chiếu `User` theo diagram: bổ sung/align `phoneNumber`, `address` object, `avatarUrl`, `lastLoginAt`, `status`, timestamp.
- Tạo `UserAddress`: `userId`, `label`, `receiverName`, `phoneNumber`, `province`, `district`, `ward`, `addressLine`, `isDefault`, timestamps.
- Bổ sung Notification: `readAt`, `deletedAt`, giữ `targetCollection`, `targetId`, `type`, `isRead` và index theo user/time.
- Không hard-delete notification; dùng `deletedAt` để audit và tránh mất dữ liệu vận hành.
- Viết model tests, unique/default-address rule và seed dữ liệu demo không chứa thông tin cá nhân thật.

### A2. Upload foundation

- Tạo `server/uploads/products/.gitkeep` và `server/uploads/avatars/.gitkeep`; ignore file runtime, chỉ commit `.gitkeep`.
- Dùng middleware upload giới hạn MIME (`jpeg`, `png`, `webp`), kích thước, số lượng và tên file UUID; không dùng tên file client làm đường dẫn.
- Chặn file thực thi, path traversal và upload không có actor/role phù hợp.
- Expose static URL có kiểm soát; trả `url`, `originalName`, `mimeType`, `size`.
- Có chiến lược dọn file mồ côi khi xóa/thay ảnh; không xóa ảnh đang được tham chiếu trong OrderDetail snapshot.

### A3. Profile và Address Book API

- `GET/PATCH /api/profile` cho thông tin được phép sửa: họ tên, số điện thoại, thông tin địa chỉ cơ bản.
- `PATCH /api/profile/password` yêu cầu mật khẩu hiện tại, kiểm tra độ mạnh và không trả password hash.
- `POST /api/profile/avatar`, `DELETE /api/profile/avatar` dùng upload foundation.
- `GET/POST/PATCH/DELETE /api/profile/addresses` và `PATCH /api/profile/addresses/:id/default`.
- Chỉ owner được đọc/sửa/xóa address; luôn bảo đảm tối đa một địa chỉ mặc định.

### A4. Notification API

- `GET /api/notifications?status=all|unread&limit=&cursor=` trả danh sách + `unreadCount`.
- `GET /api/notifications/:id` trả chi tiết và target để deep-link đúng màn hình.
- `PATCH /api/notifications/:id/read` đánh dấu đã đọc, idempotent.
- `DELETE /api/notifications/:id` chỉ thành công khi `isRead=true`; unread trả lỗi nghiệp vụ `NOTIFICATION_UNREAD_CANNOT_DELETE` (HTTP 409).
- Khi đọc chi tiết từ dropdown, đánh dấu đọc trước khi điều hướng; nếu target không còn tồn tại vẫn hiển thị nội dung fallback.

### A5. Frontend account và notification

- Tạo `AccountLayout` cho `/profile`, `/notifications`, `/orders`, `/support`, `/returns` nếu cần; không đưa Profile/Notifications vào sidebar dashboard nội bộ.
- `NotificationBell`: badge unread, keyboard accessible, click mở dropdown, click item mới điều hướng.
- Trang Notifications: tab Tất cả/Chưa đọc, trạng thái empty/loading/error, detail view, nút xóa chỉ hiện cho item đã đọc.
- Profile: form chỉnh sửa, avatar preview/remove, đổi mật khẩu, Address Book, chọn địa chỉ mặc định, optimistic state có rollback khi lỗi.
- Header public/customer hiển thị đúng Guest/Logged-in; Header nội bộ chỉ dùng bell và account menu, không hiện giỏ hàng.

### A6. Kiểm thử và bàn giao

- Model/service/controller tests cho authorization, unread delete guard, default address và upload validation.
- Client tests cho dropdown, unread badge, route detail và profile form.
- Chạy `npm test`, `npm run build` ở client và server test suite.
- Commit/push đúng danh tính Thành; PR nhỏ, không chứa file upload runtime.

## 5. Workstream B - Phạm Thành Chung: Product Media

- Thay input URL đơn bằng file picker + drag/drop nhẹ, preview thumbnail, progress, retry/error.
- Gọi upload endpoint; sau khi upload thành công mới cập nhật Product `imageUrls`.
- Cho phép sắp xếp ảnh, chọn ảnh đầu tiên làm featured, xóa ảnh không còn dùng.
- Public Product Card/Detail dùng ảnh thật, fallback khi ảnh lỗi và alt text tiếng Việt.
- Không tự xử lý avatar hoặc notification; không đổi contract chung nếu chưa được Thành review.

## 6. Workstream C - Nguyễn Quang Huy: Checkout Address

- Checkout hiển thị danh sách địa chỉ đã lưu, đánh dấu mặc định, cho phép chọn nhanh.
- Có nút “Thêm địa chỉ mới”; validate số điện thoại, tỉnh/thành, quận/huyện, phường/xã và địa chỉ chi tiết.
- Cho phép dùng địa chỉ mới một lần mà không bắt buộc lưu; nếu chọn lưu thì gọi Address Book API.
- Trước khi đặt đơn, gửi một payload địa chỉ chuẩn; backend Order tạo snapshot, không đọc lại UserAddress về sau.
- Bảo đảm retry/idempotency không tạo đơn trùng khi customer đổi địa chỉ hoặc refresh checkout.

## 7. Workstream D - Nhật và Cường

- Nhật giữ ownership Staff order, Return/Refund, Support và chỉ phát sự kiện có `type`, `targetCollection`, `targetId`, `recipientUserId`.
- Cường giữ ownership Inventory, Stock Export, Replenishment, Reports, Settings; các cảnh báo tồn kho/replenishment gửi qua Notification service của Thành.
- Cường không sửa logic unread/read/delete hoặc UI bell; chỉ kiểm thử integration event -> notification.

## 8. Dependency và thứ tự thực hiện

1. Thành chốt schema, upload contract, notification contract và AccountLayout.
2. Chung tích hợp Product Media; Huy tích hợp Address Book vào Checkout.
3. Nhật/Cường phát event theo contract; Thành hoàn thiện dropdown/detail và kiểm thử tích hợp.
4. Thành review từng PR, chạy regression, merge vào `main`, sau đó xóa branch feature local/remote.

## 9. Definition of Done

- [x] Có API contract và authorization test cho Workstream A của Thành.
- [x] Có UI tiếng Việt cho loading/empty/error/success của Profile và Notification.
- [x] Upload foundation chỉ nhận file hợp lệ, không commit file runtime.
- [x] Avatar/profile/address sửa được và không làm đổi Order snapshot cũ.
- [x] Bell có unread count, dropdown và deep-link detail.
- [x] Notification chưa đọc không thể xóa; notification đã đọc có thể xóa.
- [ ] Checkout chọn được địa chỉ lưu hoặc nhập mới.
- [x] Không có duplicate layout/sidebar/cart sai vai trò trong Workstream A.
- [x] Workstream A đạt 192 server tests, 61 client tests và production build; đã kiểm tra mobile/desktop và console.

### Tiến độ theo owner

| Owner | Workstream | Trạng thái | Bằng chứng hiện tại |
|---|---|---|---|
| Nguyễn Ngọc Thành | Account, avatar, upload foundation, notification, Address Book | Hoàn thành, chờ merge | Backend 192/192; frontend 61/61; build pass; seed demo pass |
| Phạm Thành Chung | Product Media và dữ liệu catalog production-like | Chưa bắt đầu | Thực hiện sau khi foundation của Thành vào `main` |
| Nguyễn Quang Huy | Address Book tại Checkout và Order snapshot | Chưa bắt đầu | Thực hiện sau Product Media hoặc song song từ `main` mới |

## 10. Checklist pull/merge

- [ ] Branch không có tiền tố `codex/`.
- [ ] Commit author đúng owner được phân công.
- [ ] PR mô tả files frontend/backend, API, migration, test evidence.
- [ ] Thành review diff và kiểm tra không ảnh hưởng flow hiện có.
- [ ] Thành merge `--no-ff` vào `main`.
- [ ] Push `main`, xóa branch feature sau merge; chỉ giữ `main` và `BA`.
