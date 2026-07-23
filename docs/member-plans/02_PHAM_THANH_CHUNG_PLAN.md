# Phạm Thành Chung - Product, Category, Catalog Plan

## 1. Owner Information

| Field | Detail |
|---|---|
| Owner | Phạm Thành Chung |
| Role in team | Product/catalog owner |
| Main responsibility | Product Management, Category Management, Public Catalog, Search/Filter, Product Detail |
| Git branch | `feature/chung-product-catalog` |
| Priority | Must Have |

## 2. Business Objective

Tạo nền tảng sản phẩm để hệ thống bán hàng có dữ liệu đầu vào. Nếu catalog không tốt, Customer không thể chọn sản phẩm, Huy không thể làm cart/order, Nhật và Cường không có product/stock để xử lý nghiệp vụ tiếp theo.

## 3. Module Ownership

- Product & Category Management.
- Product Browsing/Search/Filter.
- Product Detail.
- Public active product/category display.
- Admin product/category CRUD.
- Product card/filter UI components.

## 4. Important Flows Owned

| Flow | Trigger | Expected result |
|---|---|---|
| Guest browse products | Guest opens Home/Product Listing | Active products displayed |
| Guest search/filter | Guest enters keyword/category/price | Matching active products displayed |
| Guest view detail | Guest clicks product | Product detail, stock status, reviews shown |
| Admin create product | Admin submits product form | Product created and visible if Active |
| Admin disable product | Admin changes status | Product hidden from Guest/Customer |

## 5. Frontend Scope

### Pages

| Page | Path suggestion | Purpose |
|---|---|---|
| Home product integration | `client/src/pages/public/HomePage.jsx` | Cung cấp dữ liệu/component Product/Category cho Home do Thành sở hữu; không sở hữu layout Home |
| Product Listing Page | `client/src/pages/public/ProductListingPage.jsx` | Browse/filter active products |
| Search Result Page | `client/src/pages/public/SearchResultPage.jsx` | Display keyword results |
| Product Detail Page | `client/src/pages/public/ProductDetailPage.jsx` | Show product information and reviews |
| Admin Product List | `client/src/pages/admin/ProductManagementPage.jsx` | Manage products |
| Admin Product Form | `client/src/pages/admin/ProductFormPage.jsx` | Create/update product |
| Admin Category List | `client/src/pages/admin/CategoryManagementPage.jsx` | Manage categories |

### Components

| Component | Purpose |
|---|---|
| ProductCard | Display product thumbnail, name, price, stock status |
| ProductFilterSidebar | Category, price, availability filters |
| ProductSearchBar | Keyword search |
| ProductTable | Admin product list |
| CategoryTable | Admin category list |
| ProductStatusBadge | Active/Inactive/Out of stock display |

### Services

| File | Purpose |
|---|---|
| `client/src/services/productService.js` | Public/admin product API calls |
| `client/src/services/categoryService.js` | Public/admin category API calls |

## 6. Backend Scope

### Models

| Model | Fields |
|---|---|
| Product | name, description, imageUrls, price, unit, categoryId, status, createdAt, updatedAt |
| Category | name, description, status, createdAt, updatedAt |
| Inventory dependency | productId, stockQuantity, lowStockThreshold, status fields for stock display |

### Routes/Controllers/Services

| Layer | File suggestion | Responsibility |
|---|---|---|
| Route | `server/src/routes/product.routes.js` | Public product endpoints |
| Route | `server/src/routes/adminProduct.routes.js` | Admin product CRUD |
| Route | `server/src/routes/category.routes.js` | Public/admin category endpoints |
| Controller | `server/src/controller/product.controller.js` | Request/response handling |
| Controller | `server/src/controller/category.controller.js` | Request/response handling |
| Service | `server/src/services/product.service.js` | Search/filter/business rules |
| Service | `server/src/services/category.service.js` | Category business rules |

## 7. API Scope

| Method | Endpoint | Permission | Request/query | Response | Error cases |
|---|---|---|---|---|---|
| GET | `/api/products` | Public | keyword, categoryId, minPrice, maxPrice, availability, page | Active product list | Invalid query |
| GET | `/api/products/:id` | Public | product id | Active product detail | Not found/inactive |
| GET | `/api/categories` | Public | status optional | Active category list | None |
| POST | `/api/admin/products` | Admin | name, description, imageUrls, price, unit, categoryId, status | Created product | Invalid price/category |
| PATCH | `/api/admin/products/:id` | Admin | product fields | Updated product | Product not found |
| PATCH | `/api/admin/products/:id/status` | Admin | status | Updated status | Invalid status |
| POST | `/api/admin/categories` | Admin | name, description, status | Created category | Duplicate name |
| PATCH | `/api/admin/categories/:id` | Admin | category fields | Updated category | Category not found |
| PATCH | `/api/admin/categories/:id/status` | Admin | status | Updated status | Invalid status |

## 8. Database/Model Scope

| Collection | Required indexes | Business constraints |
|---|---|---|
| Product | name text/search, categoryId, status, price | Public only sees Active; price > 0 |
| Category | name unique, status | Public only sees Active |
| Inventory | productId unique | Active product should have inventory before being sold |

## 9. UI Screens/Components

| Screen | Main data | Main actions |
|---|---|---|
| Home integration | Featured/active products, active categories | Thành sở hữu layout; Chung bảo đảm dữ liệu sản phẩm/danh mục và link tìm kiếm |
| Product Listing | Product cards, filters | Filter/search/pagination |
| Product Detail | Product information, stock status, reviews | Add to cart if logged in, login prompt if Guest |
| Admin Product Management | Product table | Create, edit, disable |
| Admin Category Management | Category table | Create, edit, disable |

## 10. Validation And Error Cases

| Case | Expected handling |
|---|---|
| Product price <= 0 | Reject with validation error |
| Missing product name/category | Reject with field-level error |
| Category does not exist | Reject product save |
| Category inactive | Prevent assigning active product to inactive category |
| Product inactive | Do not show in public APIs |
| No product match | Show "No products found" on UI |

## 11. Integration Dependencies

| Dependency | Owner |
|---|---|
| Admin auth/role guard | Nguyễn Ngọc Thành |
| Cart add-to-cart button and stock validation | Nguyễn Quang Huy |
| Inventory stock status | Lê Vũ Cường |
| Product reviews on detail page | Lê Vũ Cường |

## 12. Phase-by-Phase Task List

### Phase 2 - Main Delivery

- [ ] Create Category model.
- [ ] Create Product model.
- [ ] Implement public category list API.
- [ ] Implement public product list/detail APIs.
- [ ] Implement search/filter by keyword/category/price/availability.
- [ ] Implement Admin product CRUD APIs.
- [ ] Implement Admin category CRUD APIs.
- [ ] Support Thành's Home data integration; build Product Listing/Product Detail screens.
- [ ] Build Admin Product/Category screens.

### Phase 3 - Cart Support

- [ ] Expose product id, active status, price, stock status for Cart.
- [ ] Coordinate with Huy on add-to-cart payload.

### Phase 6 - Inventory Support

- [ ] Confirm product detail can show stock from Inventory.
- [ ] Coordinate productId references with Cường.

### Phase 8 - Report Support

- [ ] Provide product status/category data for product reports.
- [ ] Verify inactive products do not break historical order details.

## 13. Git Branch/PR Suggestion

| PR | Branch | Content |
|---|---|---|
| PR 1 | `feature/chung-category-product-models` | Product/Category models and admin APIs |
| PR 2 | `feature/chung-public-catalog` | Public catalog/search/filter/detail UI and APIs |
| PR 3 | `feature/chung-catalog-polish` | Empty states, validation, integration fixes |

## 14. Testing Checklist

- [ ] Guest can view active products.
- [ ] Guest cannot view inactive product detail.
- [ ] Search by keyword returns correct products.
- [ ] Filter by category returns correct products.
- [ ] Price filter rejects invalid range.
- [ ] Admin can create product with valid category.
- [ ] Admin cannot create product with invalid price.
- [ ] Admin can disable product and it disappears from public catalog.
- [ ] Category duplicate name is rejected.

## 15. Demo Script For Mentor

1. Login as Admin.
2. Create a category "Cookware".
3. Create a product under that category.
4. Open public Product Listing and show product appears.
5. Search/filter by category.
6. Open Product Detail.
7. Disable product as Admin.
8. Refresh public listing and show product is hidden.

## 16. Risk And Mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| Public shows inactive products | Customer can buy unavailable items | Always filter status in public service |
| Product price changes after order | Historical order totals wrong | Huy snapshots price/name in OrderDetail |
| Category disabled while active products remain | Catalog inconsistency | Warn/block or auto-hide affected products |
| Missing stock display | Customer sees product but stock unclear | Integrate Inventory stock status when Cường's module is ready |

## 17. Final Checklist

- [ ] Product APIs complete.
- [ ] Category APIs complete.
- [ ] Public catalog UI complete.
- [ ] Admin product/category UI complete.
- [ ] Search/filter works.
- [ ] Inactive data hidden from public.
- [ ] Manual demo tested.

## Ownership Addendum 2026-07-20

Chung phụ trách **Product Media integration**, không còn ownership Homepage:

- File picker/drag-drop ảnh sản phẩm trong Admin Product Management.
- Preview, progress, retry, MIME/size error và sắp xếp ảnh.
- Chọn ảnh đầu tiên làm featured image, xóa ảnh không dùng và cập nhật `imageUrls`.
- Tích hợp upload contract do Thành cung cấp; không tự sửa Notification, Avatar hoặc Header/Footer.
