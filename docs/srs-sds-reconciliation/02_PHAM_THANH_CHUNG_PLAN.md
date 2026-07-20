# Plan - Phạm Thành Chung

## Owner

- Họ tên: Phạm Thành Chung
- Mã sinh viên: `HE189007`
- Email commit: `chungthanhpham2112@gmail.com`
- Vai trò: Product, Category, Catalog, Search/Filter và Product Detail owner.

## Goal

Đồng bộ thiết kế catalog trong SDS với yêu cầu SRS về active Product/Category, SKU, image URLs, price/unit/currency, availability và order snapshot.

## Phạm vi discrepancy cần sửa

- SDS có Product nhưng chưa mô tả rõ SKU, currency, imageUrls và active-category rule.
- SRS yêu cầu mọi active Product có đúng một Inventory record; SDS chưa thể hiện invariant này.
- SDS chưa có detailed design cho Guest browse/search/detail và Category management.
- Product snapshot trong Order Detail chưa thống nhất tên field.
- Public catalog phải dùng `AvailableQuantity`, không dùng StockQuantity trực tiếp.

## File cần kiểm tra/cập nhật ở phase triển khai

- `server/src/models/product.model.js`
- `server/src/models/category.model.js`
- `server/src/services/product.service.js`
- `server/src/services/category.service.js`
- `server/src/routes/product.routes.js`
- `server/src/routes/category.routes.js`
- `client/src/pages/public/ProductListingPage.jsx`
- `client/src/pages/public/ProductDetailPage.jsx`
- `client/src/components/product/ProductCard.jsx`
- `client/src/components/product/ProductFilter.jsx`
- `docs` SDS catalog/schema/query sections.

## Chi tiết thực hiện

1. Chuẩn hóa Product: `sku`, `productName`, `description`, `imageUrls`, `price`, `currency`, `unit`, `categoryId`, `status`, `averageRating`, `totalReviews`, `soldCount`.
2. Chuẩn hóa Category: name/description/image/status và active relationship với Product.
3. Quy định Product inactive hoặc Category inactive không xuất hiện ở public catalog, search và detail.
4. Đảm bảo giá là số dương, category hợp lệ, SKU có quy tắc unique nếu SRS yêu cầu.
5. Chuẩn hóa order snapshot: product name, SKU, image, unit, unit price và quantity không đổi sau khi catalog cập nhật.
6. Bổ sung empty state, invalid filter, out-of-stock và inactive-product UI behavior vào plan/test.
7. Cập nhật SDS class diagram, query list và sequence cho browse/search/detail/admin product/category.

## Acceptance checklist

- [ ] Guest xem được catalog active mà không cần đăng nhập.
- [ ] Search/filter không trả Product inactive.
- [ ] Category inactive không dùng được cho Product active.
- [ ] Product Detail hiển thị giá, đơn vị, ảnh, SKU và availability đúng.
- [ ] Order Detail snapshot không bị thay đổi khi Product đổi tên/giá/ảnh.
- [ ] Test có empty result, invalid category, invalid price và out-of-stock.

## Verification

```powershell
cd server
npm test -- --runInBand src/services/product.service.test.js src/services/category.service.test.js src/models/product.model.test.js
cd ..\client
npm test -- --runInBand src/pages/public/HomePage.test.js src/services/productService.test.js
npm run build
```

## Branch/commit

```text
feature/chung-catalog-schema-alignment
docs: align catalog reconciliation scope
```

## Trạng thái triển khai Product Media bổ sung

- [x] Upload tối đa 5 ảnh JPEG/PNG/WebP từ máy local vào `server/uploads/products`.
- [x] Preview, kéo thả, sắp xếp và chọn ảnh đầu tiên làm ảnh đại diện.
- [x] Form Admin hỗ trợ tạo, chỉnh sửa, kích hoạt/ngừng bán sản phẩm.
- [x] Chỉ xóa file media khi không còn Product hoặc OrderDetail snapshot tham chiếu.
- [x] Product Card, Home và Product Detail hỗ trợ URL upload nội bộ và fallback khi ảnh lỗi.
- [x] Seed catalog tiếng Việt có SKU ổn định, danh mục tiếng Việt và giá VND thực tế.
- [x] Browser QA desktop/mobile, upload-save-remove thật và console sạch.
- [x] Backend 196/196 tests, frontend 65/65 tests và production build pass.
- [ ] Nguyễn Ngọc Thành review/merge vào `main`.
