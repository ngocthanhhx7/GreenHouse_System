# GreenHome Kitchen System - Final Demo Readiness Plan

## 1. Thong tin phase

| Muc | Noi dung |
| --- | --- |
| Phase | Final Demo Readiness |
| Owner chinh | Nguyen Ngoc Thanh |
| Nguoi day code va merge | Nguyen Ngoc Thanh |
| Muc tieu | Dong goi repo de mentor co the clone, seed data, chay test va demo theo tung role |
| Branch de xuat | `feature/thanh-final-demo-readiness` |
| Commit/merge owner | Nguyen Ngoc Thanh `<thanhnnhe186491@fpt.edu.vn>` |

Phase nay khong them module nghiep vu moi. Muc tieu la chot do san sang demo sau khi cac phase Auth, Catalog, Cart/Order, Payment, Staff, Warehouse, After-sale, Report, Setting va Audit da duoc merge len `main`.

## 2. Cach chay du an sau khi clone

### 2.1. Backend

```bash
cd server
npm install
copy .env.example .env
npm run seed:demo
npm start
```

Backend mac dinh chay tai:

```text
http://localhost:5000
```

Health check:

```text
GET http://localhost:5000/api/health
```

### 2.2. Frontend

```bash
cd client
npm install
npm run dev
```

Frontend mac dinh chay tai:

```text
http://localhost:5173
```

## 3. Tai khoan demo dung chung

Tat ca tai khoan demo dung chung mat khau:

```text
GreenHome@123
```

| Role | Email | Nguoi phu trach demo | Man hinh chinh |
| --- | --- | --- | --- |
| Customer | `customer@greenhome.test` | Nguyen Quang Huy | Cart, Checkout, Order History, Payment, Return/Refund, Support, Review |
| Staff | `staff@greenhome.test` | Nguyen Huu Anh Nhat | Staff Dashboard, Order Queue, Invoice, Return/Refund Queue, Support Queue |
| WarehouseManager | `warehouse@greenhome.test` | Le Vu Cuong | Warehouse Dashboard, Inventory, Low Stock, Stock Export, Replenishment |
| Admin | `admin@greenhome.test` | Nguyen Ngoc Thanh | Admin Dashboard, Product, Category, Replenishment Approval, Settings, Audit Logs |

## 4. Thu tu demo cho mentor

| Buoc | Role | Owner | Flow can demo | Ket qua mong doi |
| --- | --- | --- | --- | --- |
| 1 | Guest | Pham Thanh Chung | Mo Home, Product Listing, Product Detail, search/filter | Xem duoc san pham active va danh muc |
| 2 | Customer | Nguyen Quang Huy | Login, them san pham vao cart, checkout COD | Tao duoc order moi va xem trong Order History |
| 3 | Customer | Nguyen Quang Huy | Tao online payment mock va xem Payment Result | Payment status cap nhat dung |
| 4 | Staff | Nguyen Huu Anh Nhat | Xem Order Queue, confirm order, request stock export | Order chuyen dung trang thai |
| 5 | WarehouseManager | Le Vu Cuong | Xem Stock Export Queue, approve/export stock | Ton kho giam va co transaction |
| 6 | Staff | Nguyen Huu Anh Nhat | Cap nhat Packed, Shipped, Delivered va mo invoice | Trang thai order di theo state machine hop le |
| 7 | Customer | Le Vu Cuong | Gui support request va product review | Staff thay support, public thay review |
| 8 | Staff | Nguyen Huu Anh Nhat | Approve/reject return/refund request | Refund decision duoc luu va order/payment cap nhat |
| 9 | Admin | Le Vu Cuong | Mo Admin Dashboard va Settings | Bao cao va setting hien thi du lieu seed |
| 10 | Admin | Nguyen Ngoc Thanh | Mo Audit Logs, filter action/user/date | Audit log hien dung va chi Admin truy cap duoc |

## 5. Checklist truoc khi push/merge

Nguyen Ngoc Thanh can kiem tra cac muc sau truoc khi merge len `main`:

- [ ] `git status` sach, khong co file la ngoai y muon.
- [ ] Backend test pass: `cd server && npm test`.
- [ ] Frontend test pass: `cd client && npm test`.
- [ ] Frontend build pass: `cd client && npm run build`.
- [ ] Seed demo data chay duoc: `cd server && npm run seed:demo`.
- [ ] Frontend khong trang trang tai `http://localhost:5173`.
- [ ] Login duoc 4 role demo.
- [ ] Sidebar cua moi role chi hien link dung quyen.
- [ ] Admin khong bi loi khi mo Audit Logs, Settings, Products, Categories, Replenishments.
- [ ] Customer flow khong bi dut o cart, checkout, order, payment.
- [ ] Staff flow khong cho skip trang thai sai.
- [ ] Warehouse export khong cho ton kho am.

## 6. Checklist ownership theo thanh vien

| Thanh vien | Phan can tu demo | Bang chung can co khi mentor hoi |
| --- | --- | --- |
| Nguyen Ngoc Thanh | Auth/RBAC, layout, API client, audit log, final merge | Login theo role, protected route, audit logs, commit merge tren `main` |
| Pham Thanh Chung | Product, category, public catalog | Product listing/search/filter, admin CRUD product/category |
| Nguyen Quang Huy | Cart, checkout, order, payment | Add cart, checkout COD/online, order history, cancel pending order |
| Nguyen Huu Anh Nhat | Staff processing, invoice, refund decision | Staff queue, status transition, invoice, return/refund approve/reject |
| Le Vu Cuong | Warehouse, support, review, notification, report, settings | Inventory, stock export, low stock, support/review, admin report/settings |

## 7. Risk va cach xu ly khi demo

| Risk | Dau hieu | Cach xu ly nhanh |
| --- | --- | --- |
| MongoDB chua chay | Backend loi ket noi database | Start MongoDB local, kiem tra `MONGODB_URI` trong `server/.env` |
| Chua co data | Man hinh danh sach rong | Chay `cd server && npm run seed:demo` |
| Sai role khi demo | Bi chuyen sang Forbidden | Logout va login dung email demo trong bang tai khoan |
| Frontend trang trang | Console co loi runtime | Chay `npm test` trong `client`, kiem tra import/page route moi |
| API unauthorized | Response 401 | Kiem tra token sau login va header Authorization trong `apiClient` |
| Role forbidden | Response 403 | Dung dung account role cua flow can demo |

## 7.1 Customer order and review UX addendum 2026-07-25

Customer demo sau checkout dùng hai lối vào trong dropdown avatar:

1. `Đơn hàng của tôi`: lọc theo trạng thái, xem snapshot từng sản phẩm, theo dõi
   thanh toán/giao hàng và mở đúng thao tác hợp lệ.
2. `Đánh giá của tôi`: tab `Chờ đánh giá` chiếu riêng từng sản phẩm thuộc đơn đã
   giao; tab `Đã đánh giá` cho sửa nội dung/điểm và quản lý trạng thái hiển thị.
3. Product Detail chỉ dùng để đọc số sao, tổng lượt và đánh giá công khai, không
   còn form Customer.

Ownership không đổi: Nguyễn Quang Huy sở hữu Order, Lê Vũ Cường sở hữu Review,
Nguyễn Ngọc Thành sở hữu Header/final integration.

Pre-merge evidence sau remediation: focused integration `76/76`, full server
`1052/1052`, full client `276/276`, client production build exit `0`; warning
chunk lớn của Vite không chặn release và đã tồn tại ở baseline. Independent
review không có P0; ba P1 đã được owner đóng bằng regression test trước gate
merge cuối.

## 8. Definition of Done cho phase chot

- [ ] Co tai lieu demo readiness trong `docs`.
- [ ] README tro den tai lieu demo readiness.
- [ ] Test backend/frontend/build pass.
- [ ] Nguyen Ngoc Thanh commit va push branch.
- [ ] Nguyen Ngoc Thanh merge vao `main` sau khi verify.
- [ ] Mentor co the doc repo va tu chay demo theo tung role.
