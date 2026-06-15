# Tài liệu mô tả dự án GreenHome Kitchen System

## 1. Giới thiệu

GreenHome Kitchen System là hệ thống web bán hàng trực tuyến dành cho các sản phẩm nhà bếp. Hệ thống hỗ trợ người dùng duyệt sản phẩm, tìm kiếm, quản lý giỏ hàng, đặt hàng, thanh toán và theo dõi đơn hàng. Bên cạnh đó, hệ thống cung cấp các chức năng nội bộ cho nhân viên xử lý đơn hàng, quản lý kho và quản trị viên.

Tài liệu này được tạo để mô tả tổng quan dự án, phạm vi, người dùng, chức năng, kiến trúc thư mục và các yêu cầu chính cần được triển khai.

## 2. Mục đích

Mục đích của dự án là xây dựng một nền tảng thương mại điện tử cơ bản, tập trung vào quy trình bán sản phẩm nhà bếp. Hệ thống giúp khách hàng mua sắm thuận tiện hơn, đồng thời giúp đội ngũ vận hành quản lý đơn hàng, sản phẩm và tồn kho tập trung trên một hệ thống duy nhất.

Tài liệu này có thể dùng cho thành viên dự án, giảng viên, tester và các bên liên quan để hiểu phạm vi và định hướng phát triển của hệ thống.

## 3. Phạm vi dự án

Hệ thống bao gồm các nhóm chức năng chính sau:

- Quản lý tài khoản và xác thực người dùng.
- Duyệt, tìm kiếm và xem chi tiết sản phẩm.
- Quản lý giỏ hàng.
- Đặt hàng và xử lý đơn hàng.
- Thanh toán thông qua Payment Gateway.
- Quản lý tồn kho và cảnh báo hàng sắp hết.
- Quản lý sản phẩm, danh mục và tài khoản nhân viên.
- Đánh giá sản phẩm.
- Gửi email thông báo.
- Báo cáo và thống kê cơ bản cho quản trị viên.

Các chức năng chưa thuộc phạm vi hiện tại gồm ứng dụng mobile, quản lý shipper, theo dõi giao hàng thời gian thực, gợi ý sản phẩm bằng AI, hệ thống hỗ trợ khách hàng dạng ticket và kế toán nâng cao.

## 4. Người dùng và tác nhân hệ thống

| Tác nhân | Mô tả | Chức năng chính |
| --- | --- | --- |
| Guest | Người dùng chưa đăng nhập. | Xem sản phẩm, tìm kiếm, xem chi tiết sản phẩm, đăng ký tài khoản. |
| Customer | Khách hàng đã đăng ký. | Đăng nhập, quản lý hồ sơ, quản lý giỏ hàng, đặt hàng, thanh toán, xem lịch sử mua hàng, đánh giá sản phẩm. |
| Staff | Nhân viên xử lý đơn hàng. | Xem đơn hàng, xác nhận đơn hàng, cập nhật trạng thái xử lý, hủy đơn nếu cần. |
| Warehouse Manager | Người quản lý kho. | Xem tồn kho, cập nhật số lượng, điều chỉnh tồn kho, theo dõi cảnh báo hàng sắp hết. |
| Admin | Quản trị viên hệ thống. | Quản lý sản phẩm, danh mục, tài khoản nhân viên, cấu hình hệ thống, báo cáo và phân quyền. |
| Payment Gateway | Dịch vụ thanh toán bên ngoài. | Nhận yêu cầu thanh toán và trả kết quả giao dịch. |
| Email Service | Dịch vụ email bên ngoài. | Gửi thông báo đăng ký, đơn hàng, thanh toán và trạng thái hệ thống. |

## 5. Chức năng hệ thống

### 5.1 Xác thực và quản lý tài khoản

Hệ thống cho phép người dùng đăng ký tài khoản khách hàng, đăng nhập, đăng xuất và cập nhật thông tin cá nhân. Các chức năng quản trị và vận hành được bảo vệ bằng phân quyền theo vai trò.

### 5.2 Quản lý sản phẩm và danh mục

Khách truy cập và khách hàng có thể xem danh sách sản phẩm, tìm kiếm và xem chi tiết từng sản phẩm. Quản trị viên có thể thêm, sửa, ẩn hoặc cập nhật thông tin sản phẩm và danh mục.

### 5.3 Quản lý giỏ hàng

Khách hàng có thể thêm sản phẩm vào giỏ hàng, thay đổi số lượng, xóa sản phẩm và kiểm tra thông tin giỏ hàng trước khi tạo đơn hàng.

### 5.4 Đặt hàng và xử lý đơn hàng

Khách hàng tạo đơn hàng từ các sản phẩm trong giỏ hàng. Nhân viên có thể xem chi tiết đơn hàng, xác nhận đơn, cập nhật trạng thái và xử lý các tình huống như hủy đơn hoặc hoàn tiền nếu đã thanh toán.

### 5.5 Thanh toán

Hệ thống gửi yêu cầu thanh toán đến Payment Gateway, nhận phản hồi giao dịch và cập nhật trạng thái thanh toán cho đơn hàng. Thông tin phản hồi có thể gồm mã giao dịch, trạng thái thanh toán và thông tin callback.

### 5.6 Quản lý kho

Warehouse Manager quản lý tồn kho, cập nhật số lượng hàng, điều chỉnh thông tin tồn kho và nhận cảnh báo khi sản phẩm xuống dưới ngưỡng tồn kho tối thiểu.

### 5.7 Đánh giá sản phẩm

Khách hàng có thể gửi đánh giá cho sản phẩm đã mua hoặc đã sử dụng. Dữ liệu đánh giá được lưu để hỗ trợ người mua khác tham khảo.

### 5.8 Báo cáo và thông báo

Admin có thể xem báo cáo cơ bản và thống kê người dùng. Hệ thống sử dụng Email Service để gửi thông báo liên quan đến đăng ký, đơn hàng, thanh toán và các hoạt động quan trọng.

## 6. Luồng nghiệp vụ tiêu biểu

### 6.1 Luồng mua hàng

1. Guest hoặc Customer xem danh sách sản phẩm.
2. Người dùng tìm kiếm hoặc lọc sản phẩm.
3. Customer thêm sản phẩm vào giỏ hàng.
4. Customer kiểm tra giỏ hàng và tạo đơn hàng.
5. Hệ thống gửi yêu cầu thanh toán đến Payment Gateway.
6. Payment Gateway trả kết quả thanh toán.
7. Hệ thống cập nhật trạng thái đơn hàng và gửi email thông báo.
8. Staff xử lý đơn hàng và cập nhật trạng thái.

### 6.2 Luồng xử lý đơn hàng

1. Staff đăng nhập vào hệ thống.
2. Staff xem danh sách đơn hàng đang chờ xử lý.
3. Staff mở chi tiết đơn hàng và kiểm tra trạng thái.
4. Nếu đơn hợp lệ, Staff xác nhận đơn hàng.
5. Hệ thống cập nhật trạng thái đơn hàng.
6. Nếu cần giao hàng, hệ thống kiểm tra tồn kho và chuyển sang trạng thái vận chuyển.

### 6.3 Luồng quản lý tồn kho

1. Warehouse Manager đăng nhập vào hệ thống.
2. Warehouse Manager xem danh sách sản phẩm và số lượng tồn.
3. Warehouse Manager cập nhật số lượng hoặc điều chỉnh tồn kho.
4. Hệ thống kiểm tra ngưỡng tồn kho tối thiểu.
5. Nếu số lượng thấp, hệ thống tạo cảnh báo hàng sắp hết.

## 7. Kiến trúc kỹ thuật dự kiến

Hệ thống được tổ chức theo mô hình frontend và backend tách riêng:

- Frontend chịu trách nhiệm hiển thị giao diện, điều hướng màn hình và gọi REST API.
- Backend chịu trách nhiệm xử lý request, kiểm tra dữ liệu, xử lý nghiệp vụ, kết nối cơ sở dữ liệu và tích hợp dịch vụ bên ngoài.
- Database lưu trữ người dùng, sản phẩm, danh mục, giỏ hàng, đơn hàng, thanh toán, tồn kho, đánh giá và thông báo.

## 8. Cấu trúc thư mục

```text
GreenHouse_System/
├── client/
│   ├── public/
│   │   └── assets/
│   └── src/
│       ├── components/
│       ├── contexts/
│       ├── hooks/
│       ├── pages/
│       └── services/
├── server/
│   ├── src/
│   │   ├── config/
│   │   ├── controller/
│   │   ├── middlewares/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   └── utils/
│   └── uploads/
├── docs/
└── skill/
```

## 9. Mô tả các thư mục chính

| Thư mục | Mô tả |
| --- | --- |
| `client/public/assets` | Lưu tài nguyên tĩnh như hình ảnh, icon hoặc file public. |
| `client/src/components` | Chứa các component giao diện có thể tái sử dụng. |
| `client/src/contexts` | Chứa context dùng để chia sẻ state toàn cục ở frontend. |
| `client/src/hooks` | Chứa custom hooks phục vụ logic giao diện. |
| `client/src/pages` | Chứa các trang chính của ứng dụng. |
| `client/src/services` | Chứa các hàm gọi API từ frontend. |
| `server/src/config` | Chứa cấu hình môi trường, database và các dịch vụ ngoài. |
| `server/src/controller` | Nhận request, gọi service và trả response. |
| `server/src/middlewares` | Xử lý xác thực, phân quyền và lỗi. |
| `server/src/models` | Định nghĩa schema dữ liệu. |
| `server/src/routes` | Khai báo các endpoint REST API. |
| `server/src/services` | Chứa logic nghiệp vụ chính. |
| `server/src/utils` | Chứa hàm tiện ích dùng chung. |
| `server/uploads` | Lưu file upload nếu hệ thống có chức năng tải ảnh hoặc tài liệu. |

## 10. Dữ liệu chính

Các nhóm dữ liệu chính của hệ thống gồm:

- User: thông tin tài khoản, vai trò, trạng thái.
- Product: tên, mô tả, giá, danh mục, hình ảnh, trạng thái.
- Category: nhóm sản phẩm.
- Cart: sản phẩm và số lượng khách hàng đang chọn.
- Order: thông tin đơn hàng, khách hàng, tổng tiền, trạng thái.
- Payment: thông tin giao dịch và trạng thái thanh toán.
- Inventory: số lượng tồn kho và ngưỡng cảnh báo.
- Review: đánh giá sản phẩm từ khách hàng.
- Notification: thông báo gửi cho người dùng.

## 11. Yêu cầu phi chức năng

- Usability: giao diện dễ sử dụng, rõ ràng cho cả khách hàng và người dùng nội bộ.
- Performance: các chức năng phổ biến phản hồi nhanh, đặc biệt là xem sản phẩm, tìm kiếm và đặt hàng.
- Reliability: trạng thái đơn hàng, thanh toán và tồn kho cần được cập nhật chính xác.
- Security: bảo vệ mật khẩu, phân quyền theo vai trò và kiểm soát truy cập API.
- Maintainability: mã nguồn cần tách rõ route, controller, service, model và middleware.
- Portability: hệ thống có thể triển khai trên môi trường web phổ biến.

## 12. Quy tắc nghiệp vụ chính

- Guest chỉ được xem thông tin công khai và đăng ký tài khoản.
- Customer phải đăng nhập để quản lý giỏ hàng, đặt hàng, thanh toán và đánh giá sản phẩm.
- Staff chỉ xử lý các đơn hàng thuộc phạm vi quyền hạn.
- Warehouse Manager quản lý số lượng tồn kho và cảnh báo hàng sắp hết.
- Admin có quyền quản lý dữ liệu hệ thống và phân quyền.
- Đơn hàng chỉ được xác nhận khi trạng thái hiện tại hợp lệ.
- Thanh toán thành công cần được ghi nhận trước khi cập nhật các trạng thái phụ thuộc.
- Tồn kho cần được kiểm tra trước khi chuyển đơn hàng sang bước giao hàng.

## 13. Thành viên nhóm

| Họ tên | MSSV |
| --- | --- |
| Nguyễn Ngọc Thành | HE186491 |
| Phạm Thành Chung | HE189007 |
| Nguyễn Quang Huy | HE186466 |
| Nguyễn Hữu Anh Nhật | HE176402 |
| Lê Vũ Cường | HE187396 |

