# Data Schema Gap Review - GreenHome Kitchen

Owner: Nguyễn Ngọc Thành  
Source diagram: `C:\Users\nguye\OneDrive - nguyenngocthanhhx7\19190\Tài liệu\Kỳ 8\WDP\diagram\E-commerce Order Management-2026-06-17-053807.svg`

## 1. Kết luận nhanh

Backend hiện tại đã có đủ nhóm entity chính cho GreenHome Kitchen:

| Nhóm nghiệp vụ | Entity/model hiện có | Đánh giá |
| --- | --- | --- |
| Người dùng & phân quyền | `User`, `Role`, `AuditLog` | Khớp scope dự án |
| Catalog | `Product`, `Category`, `ProductReview` | Khớp entity, đã bổ sung `sku` |
| Giỏ hàng & đặt hàng | `ShoppingCart`, `CartItem`, `Order`, `OrderDetail`, `Payment` | Khớp entity, đã bổ sung field giao hàng/thanh toán |
| Kho | `Inventory`, `InventoryTransaction`, `StockExportRequest`, `ReplenishmentRequest` | Khớp entity |
| Sau bán | `ReturnRefundRequest`, `SupportRequest`, `Notification` | Khớp entity, đã bổ sung mã yêu cầu/target/evidence |
| Cấu hình | `SystemSetting` | Khớp scope quản trị |

Schema cũ đủ cho demo chức năng cơ bản, nhưng chưa đủ tốt cho UX/UI production-like vì thiếu nhiều field hiển thị quan trọng trong checkout, hóa đơn, theo dõi đơn, hỗ trợ và đối soát thanh toán.

## 2. Field đã bổ sung để align ERD

### Order

| Field | Lý do |
| --- | --- |
| `receiverName`, `receiverPhone` | Checkout Việt Nam cần tên và số điện thoại người nhận rõ ràng. |
| `subtotal`, `shippingFee`, `currency` | UI cần tách tạm tính, phí giao hàng, tổng tiền VND. |
| `customerNote` | Khách hàng có thể ghi chú giao hàng. |
| `confirmedAt`, `packedAt`, `shippedAt`, `deliveredAt` | Timeline trạng thái đơn hàng. |

### Payment

| Field | Lý do |
| --- | --- |
| `paymentProvider` | Ghi nhận cổng thanh toán. |
| `gatewayResponseCode`, `gatewayMessage` | Đối soát callback/thất bại thanh toán. |
| `providerMessageId` | Mã message từ provider/email/gateway. |
| `currency` | Đồng bộ hiển thị VND. |

### Product / OrderDetail

| Field | Lý do |
| --- | --- |
| `Product.sku` | Quản lý hàng hóa và đối chiếu kho. |
| `OrderDetail.productImageSnapshot` | Hóa đơn/chi tiết đơn không phụ thuộc ảnh sản phẩm hiện tại. |
| `OrderDetail.skuSnapshot` | Dữ liệu đơn hàng ổn định khi SKU sản phẩm đổi. |

### ReturnRefundRequest

| Field | Lý do |
| --- | --- |
| `requestCode` | Mã yêu cầu để khách hàng/nhân viên tra cứu. |
| `evidenceImages` | Ảnh bằng chứng khi đổi trả. |
| `paymentId` | Liên kết giao dịch cần hoàn tiền. |
| `requestedAt`, `handledAt` | Timeline xử lý yêu cầu. |

### SupportRequest

| Field | Lý do |
| --- | --- |
| `ticketCode` | Mã ticket hỗ trợ. |
| `requestType` | Phân loại: đơn hàng, sản phẩm, thanh toán, đổi trả, khác. |
| `priority` | Ưu tiên xử lý. |
| `productId` | Hỗ trợ có thể liên quan trực tiếp đến sản phẩm. |
| `closedAt` | Thời điểm đóng ticket. |

### Notification

| Field | Lý do |
| --- | --- |
| `targetCollection`, `targetId` | Điều hướng thông báo về đơn hàng/thanh toán/đổi trả/hỗ trợ. |
| `recipientEmail` | Email nhận thông báo khi gửi qua mail. |
| `providerMessageId` | Đối soát trạng thái gửi email/provider. |

## 3. Field khác tên nhưng chấp nhận được

| Diagram | Model hiện tại | Ghi chú |
| --- | --- | --- |
| `phoneNumber` | `User.phone` | Có thể giữ để code gọn, UI hiển thị là số điện thoại. |
| `settingKey`, `settingValue` | `SystemSetting.key`, `SystemSetting.value` | Tên ngắn hơn nhưng cùng ý nghĩa. |
| `handledBy` | `resolvedBy` trong ReturnRefund | Nên chuẩn hóa sau nếu cần thống nhất ngôn ngữ nghiệp vụ. |
| `price` / `unitPrice` | `priceSnapshot` trong OrderDetail | Phù hợp vì đơn hàng cần snapshot giá tại thời điểm mua. |

## 4. Khuyến nghị phase tiếp theo

- Tách `shippingAddress` dạng object gồm họ tên, điện thoại, tỉnh/thành, quận/huyện, phường/xã, địa chỉ chi tiết.
- Nếu dùng SKU thật, thêm validation unique cho `sku` nhưng cần migration xử lý sản phẩm cũ có SKU trống.
- Khi tích hợp cổng thanh toán thật, map `paymentProvider`, `gatewayResponseCode`, `gatewayMessage`, `providerMessageId` từ callback thật.
- Khi hoàn thiện support, tạo format sinh `ticketCode` và `requestCode` theo ngày để mentor dễ demo.
- Cập nhật seed demo để có dữ liệu VND, SKU, phí ship, người nhận và timeline trạng thái đầy đủ.

## 5. Test evidence

- Đã thêm `server/src/models/schemaAlignment.model.test.js`.
- Test xác nhận các field ERD quan trọng tồn tại trong Mongoose schema.
- `server npm test`: pass 82/82 sau khi bổ sung schema.
