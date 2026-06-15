# GreenHome Kitchen System

GreenHome Kitchen System là hệ thống web hỗ trợ bán hàng trực tuyến cho các sản phẩm nhà bếp như dụng cụ nấu ăn, bộ đồ ăn, dụng cụ vệ sinh, phụ kiện lưu trữ và các sản phẩm liên quan đến không gian bếp.

Dự án hướng đến việc xây dựng một nền tảng thương mại điện tử cơ bản, cho phép khách hàng xem sản phẩm, tìm kiếm, quản lý giỏ hàng, đặt hàng, thanh toán, theo dõi trạng thái đơn hàng và đánh giá sản phẩm. Đồng thời, hệ thống cung cấp các chức năng quản trị cho nhân viên, quản lý kho và quản trị viên.

## Mục tiêu dự án

- Cung cấp website bán hàng trực tuyến cho sản phẩm nhà bếp.
- Hỗ trợ quy trình mua hàng từ xem sản phẩm, thêm vào giỏ hàng, đặt hàng đến thanh toán.
- Hỗ trợ nhân viên xử lý đơn hàng và cập nhật trạng thái đơn hàng.
- Hỗ trợ quản lý kho theo dõi tồn kho, cập nhật số lượng và cảnh báo hàng sắp hết.
- Hỗ trợ quản trị viên quản lý sản phẩm, danh mục, tài khoản nhân viên, báo cáo và cấu hình hệ thống.
- Tích hợp cổng thanh toán và dịch vụ email để xử lý giao dịch và gửi thông báo.

## Vai trò người dùng

| Vai trò | Mô tả |
| --- | --- |
| Guest | Người dùng chưa đăng nhập, có thể xem danh mục, tìm kiếm sản phẩm, xem chi tiết sản phẩm và đăng ký tài khoản. |
| Customer | Người dùng đã đăng ký, có thể quản lý hồ sơ, giỏ hàng, đặt hàng, thanh toán, xem lịch sử mua hàng và đánh giá sản phẩm. |
| Staff | Nhân viên xử lý đơn hàng, xác nhận đơn hàng và cập nhật trạng thái xử lý. |
| Warehouse Manager | Người quản lý kho, cập nhật tồn kho, điều chỉnh số lượng hàng và theo dõi cảnh báo hàng sắp hết. |
| Admin | Quản trị viên hệ thống, quản lý sản phẩm, danh mục, tài khoản nhân viên, báo cáo và phân quyền. |
| Payment Gateway | Dịch vụ bên ngoài dùng để xử lý thanh toán. |
| Email Service | Dịch vụ bên ngoài dùng để gửi email thông báo cho người dùng. |

## Chức năng chính

### 1. Xác thực và quản lý tài khoản

- Đăng ký tài khoản khách hàng.
- Đăng nhập, đăng xuất.
- Quản lý thông tin cá nhân.
- Phân quyền truy cập theo vai trò.

### 2. Quản lý sản phẩm và danh mục

- Xem danh sách sản phẩm.
- Xem chi tiết sản phẩm.
- Tìm kiếm và duyệt sản phẩm theo danh mục.
- Quản trị viên thêm, sửa, ẩn hoặc cập nhật thông tin sản phẩm.

### 3. Quản lý giỏ hàng

- Thêm sản phẩm vào giỏ hàng.
- Cập nhật số lượng sản phẩm.
- Xóa sản phẩm khỏi giỏ hàng.
- Kiểm tra thông tin giỏ hàng trước khi đặt hàng.

### 4. Quản lý đơn hàng

- Khách hàng tạo đơn hàng từ giỏ hàng.
- Nhân viên xem chi tiết đơn hàng.
- Nhân viên xác nhận, xử lý, hủy hoặc cập nhật trạng thái đơn hàng.
- Khách hàng theo dõi trạng thái đơn hàng và lịch sử mua hàng.

### 5. Thanh toán

- Gửi yêu cầu thanh toán đến Payment Gateway.
- Nhận phản hồi thanh toán gồm mã giao dịch và trạng thái.
- Cập nhật trạng thái thanh toán vào đơn hàng.

### 6. Quản lý kho

- Xem danh sách tồn kho.
- Cập nhật số lượng hàng.
- Điều chỉnh thông tin tồn kho.
- Cảnh báo khi số lượng sản phẩm thấp hơn ngưỡng quy định.

### 7. Đánh giá sản phẩm

- Khách hàng gửi đánh giá sản phẩm.
- Lưu thông tin đánh giá phục vụ tham khảo cho người mua khác.

### 8. Báo cáo và thông báo

- Quản trị viên xem báo cáo cơ bản và thống kê người dùng.
- Hệ thống gửi email thông báo đăng ký, đơn hàng, thanh toán và các hoạt động quan trọng.

## Kiến trúc thư mục

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

## Mô tả các package chính

| Package | Mô tả |
| --- | --- |
| `server/src/models` | Định nghĩa schema dữ liệu, dự kiến dùng cho các collection trong MongoDB. |
| `server/src/controller` | Nhận request, kiểm tra dữ liệu, gọi service và trả response. |
| `server/src/routes` | Định nghĩa API endpoint và ánh xạ đến controller. |
| `server/src/services` | Xử lý nghiệp vụ chính của hệ thống. |
| `server/src/middlewares` | Xác thực JWT, phân quyền và xử lý lỗi. |
| `server/src/config` | Cấu hình kết nối cơ sở dữ liệu và biến môi trường. |
| `client/src/components` | Component giao diện có thể tái sử dụng. |
| `client/src/pages` | Các màn hình chính được định tuyến ở frontend. |
| `client/src/services` | Gọi REST API từ frontend đến backend. |

## Công nghệ dự kiến

- Frontend: React hoặc framework JavaScript tương đương.
- Backend: Node.js, Express.js.
- Database: MongoDB.
- Authentication: JWT.
- External services: Payment Gateway, Email Service.

## Yêu cầu phi chức năng

- Giao diện dễ sử dụng cho khách hàng và nhân viên nội bộ.
- Hệ thống phản hồi nhanh cho các thao tác phổ biến như xem sản phẩm, tìm kiếm, thêm vào giỏ hàng và đặt hàng.
- Bảo vệ thông tin tài khoản, mật khẩu và dữ liệu thanh toán.
- Phân quyền rõ ràng giữa Customer, Staff, Warehouse Manager và Admin.
- Dễ bảo trì bằng cách tách rõ controller, service, model, route và middleware.
- Có khả năng triển khai trên môi trường web phổ biến.

## Phạm vi chưa bao gồm

Theo tài liệu yêu cầu hiện tại, hệ thống chưa bao gồm:

- Theo dõi giao hàng thời gian thực.
- Quản lý shipper.
- Ứng dụng mobile.
- Gợi ý sản phẩm bằng AI.
- Kế toán nâng cao.
- Tối ưu logistics phức tạp.
- Hệ thống ticket hỗ trợ khách hàng.
- Quản lý hóa đơn nâng cao.
- Audit log chi tiết.

## Tài liệu liên quan

- `docs/PROJECT_DESCRIPTION.md`: Bản mô tả dự án chi tiết.
- `docs/PROJECT_DESCRIPTION.docx`: Bản mô tả dự án định dạng Word.

## Thành viên nhóm

| Họ tên | MSSV |
| --- | --- |
| Nguyễn Ngọc Thành | HE186491 |
| Phạm Thành Chung | HE189007 |
| Nguyễn Quang Huy | HE186466 |
| Nguyễn Hữu Anh Nhật | HE176402 |
| Lê Vũ Cường | HE187396 |

