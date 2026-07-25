# Customer Order and Review UX Design

## 1. Objective

Hoàn thiện khu vực hậu mua hàng cho Customer theo mô hình thao tác quen thuộc của
Shopee nhưng giữ nguyên nhận diện GreenHome Kitchen:

- Customer theo dõi và thao tác với đơn hàng tại `/orders`.
- Customer đánh giá riêng từng sản phẩm thuộc đơn đã giao tại `/reviews`.
- Trang chi tiết sản phẩm chỉ hiển thị điểm tổng hợp và đánh giá công khai, không
  chứa form tạo hoặc chỉnh sửa đánh giá.
- Dropdown avatar và menu di động có lối vào rõ ràng tới đơn hàng và đánh giá.

Thiết kế không sao chép màu cam, typography hoặc tài sản thương hiệu của Shopee.

## 2. Ownership

| Phạm vi | Owner | Git identity |
|---|---|---|
| Order History/Detail customer UX | Nguyễn Quang Huy | `Nguyễn Quang Huy <quanghuyn267@gmail.com>` |
| Customer Review UX và Product public review display | Lê Vũ Cường | `Lê Vũ Cường <levucuong0319@gmail.com>` |
| Header/avatar integration, final review và merge | Nguyễn Ngọc Thành | `Nguyễn Ngọc Thành <thanhnnhe186491@fpt.edu.vn>` |

Các thay đổi của từng owner phải nằm trong commit riêng. Merge cuối dùng
`--no-ff` và danh tính Nguyễn Ngọc Thành.

## 3. Actors and Authorization

### Public/Guest

- Xem điểm trung bình, tổng số đánh giá và danh sách đánh giá đã công khai trên
  trang chi tiết sản phẩm.
- Không thấy form tạo, sửa, rút hoặc đăng lại đánh giá.

### Customer

- Chỉ xem đơn hàng thuộc `customerId` của chính mình.
- Chỉ đánh giá sản phẩm xuất hiện trong `OrderDetail` của đơn thuộc chính mình
  có `orderStatus = Delivered`.
- Mỗi Customer có tối đa một Review identity cho mỗi Product; mua lại không tạo
  thêm Review identity.
- Có thể cập nhật nội dung/điểm và quản lý publication theo version hiện tại.

Không mở rộng quyền cho Staff, WarehouseManager hoặc Admin.

## 4. Order Experience

Trang `/orders` dùng bố cục thẻ thay cho bảng:

- Header “Đơn hàng của tôi” và CTA tiếp tục mua sắm.
- Thanh tab gồm: Tất cả, Chờ thanh toán, Chờ xác nhận, Đang xử lý, Đang giao,
  Hoàn thành, Đã hủy.
- Bộ lọc được tính phía client từ trạng thái Order/Payment hiện có; không phát
  sinh trạng thái backend mới.
- Mỗi thẻ hiển thị mã đơn, ngày đặt, trạng thái, ảnh/tên/SKU snapshot, số lượng,
  đơn giá, tổng tiền và trạng thái thanh toán.
- Thao tác chỉ xuất hiện khi hợp lệ:
  - Xem chi tiết: mọi trạng thái.
  - Thanh toán: online order còn thời hạn và chưa thanh toán.
  - Hủy đơn: dùng đúng predicate/rule hiện có của Order Detail.
  - Đánh giá: đơn `Delivered`, điều hướng tới `/reviews` cùng order context.
  - Mua lại: điều hướng về catalog; không tự động ghi Cart để tránh bỏ qua kiểm
    tra publication, giá và tồn kho hiện tại.

Trạng thái tải, rỗng, lỗi và responsive mobile phải có thông điệp riêng.

## 5. Review Experience

Trang `/reviews` có hai tab:

### Chờ đánh giá

- Lấy danh sách đơn của Customer, chỉ giữ đơn `Delivered`, tải detail của từng
  đơn rồi chiếu thành từng sản phẩm.
- Loại các Product đã có Review identity trong danh sách `GET /customer/reviews`.
- Mỗi item hiển thị order code, thời điểm giao, ảnh/tên/SKU snapshot và form
  1–5 sao + nội dung tối đa 1.000 ký tự.
- Submit dùng `orderDetailId`, `expectedVersion = 0` và Idempotency-Key.
- Thành công chuyển item sang tab “Đã đánh giá” mà không reload toàn trang.

### Đã đánh giá

- Hiển thị sản phẩm, order evidence, số sao, nội dung, trạng thái hiển thị và
  trạng thái kiểm duyệt bằng nhãn tiếng Việt.
- Cho phép sửa điểm/nội dung với `expectedVersion` hiện tại.
- Cho phép rút hoặc đăng lại publication theo transition hiện có.
- Không hiển thị thuật ngữ kỹ thuật như “Customer publication”, “Staff
  moderation” hoặc “Phiên bản” cho người dùng cuối.

Nếu một order detail không còn đủ dữ liệu hiển thị, UI fail closed cho thao tác
đánh giá và vẫn tải được các item hợp lệ khác.

## 6. Product Detail Experience

Trang `/products/:id` giữ:

- Điểm trung bình một chữ số thập phân.
- Tổng số lượt đánh giá.
- Danh sách đánh giá công khai có người đánh giá đã che danh tính, dấu “Đã mua
  hàng”, nội dung và thời gian.
- Phân trang hiện có.

Trang không gọi eligibility hoặc own-review API và không render form Customer.

## 7. Header Navigation

Dropdown avatar của Customer và menu account trên mobile thêm:

- `Đơn hàng của tôi` → `/orders`
- `Đánh giá của tôi` → `/reviews`

Hai mục nằm sau “Thông báo” và trước các luồng đổi trả/hỗ trợ. Các role khác
không nhận hai link Customer này. Hành vi đóng dropdown, Escape, focus và mobile
drawer hiện tại phải được giữ nguyên.

## 8. Visual Language

- Dùng font local, token màu xanh đậm, kem, trắng và vàng nhấn hiện có.
- Tab active dùng đường viền/màu xanh GreenHome, không dùng màu cam Shopee.
- Thẻ đơn hàng có border/radius/shadow cùng hệ thống surface hiện tại.
- Desktop ưu tiên quét nhanh theo hàng; mobile xếp dọc, nút full-width khi cần.
- Star control có label accessible và trạng thái focus rõ ràng.

## 9. Data Flow and Invariants

1. `GET /orders/my` trả danh sách order thuộc Customer.
2. UI tải `GET /orders/:id` khi cần OrderDetail snapshot.
3. `GET /customer/reviews` xác định Review identity hiện có.
4. Chỉ detail của order `Delivered` và chưa có Review mới vào “Chờ đánh giá”.
5. `POST /products/:productId/reviews` vẫn là nguồn thẩm quyền cuối cùng; backend
   tái kiểm tra actor, ownership, delivered evidence và identity uniqueness.
6. UI không tin dữ liệu filter phía client để cấp quyền.

Không thay đổi schema, migration, Order state machine, payment invariant hoặc
Review domain contract.

## 10. Error Handling

- Lỗi tải order: thông báo riêng “Không thể tải đơn hàng của bạn”.
- Lỗi tải review: thông báo riêng “Không thể tải danh sách đánh giá”.
- Lỗi eligibility của một order detail không làm hỏng toàn trang.
- Field error cho rating, content và orderDetailId hiển thị cạnh đúng control.
- Duplicate/stale command dùng message từ API và refresh Review hiện tại.
- Nút mutation bị khóa trong lúc pending để tránh double submit.

## 11. Acceptance Criteria

1. Product Detail không còn form tạo/chỉnh sửa đánh giá.
2. Public Product Detail vẫn hiển thị aggregate và danh sách review.
3. `/orders` có tab trạng thái và thẻ sản phẩm responsive.
4. Customer chỉ thấy/thao tác trên order của chính mình.
5. `/reviews` có “Chờ đánh giá” và “Đã đánh giá”.
6. Một order nhiều sản phẩm tạo từng item đánh giá độc lập.
7. Chỉ OrderDetail thuộc đơn `Delivered` mới có thể submit.
8. Review đã tồn tại không xuất hiện ở “Chờ đánh giá”.
9. Tạo/sửa/rút/đăng lại Review giữ idempotency và version contract.
10. Dropdown avatar và mobile menu có “Đơn hàng của tôi” và “Đánh giá của tôi”.
11. Role khác không có link Customer.
12. UI giữ font/màu GreenHome và hoạt động ở desktop/mobile.
13. Targeted tests, full server regression, full client regression, production
    client build và `git diff --check` đều exit 0 trước commit/merge.

## 12. Out of Scope

- Thêm trạng thái Order/Payment mới.
- Chat, voucher, Shopee Xu hoặc logistics tracking bên thứ ba.
- Tự động thêm lại toàn bộ order vào Cart.
- Review toàn đơn, review dịch vụ vận chuyển hoặc upload ảnh/video review.
- Thay đổi schema/migration hoặc business rule Review/Order hiện có.
