import { useEffect, useRef, useState } from 'react';

import ProductMediaManager from '../../components/product/ProductMediaManager.jsx';
import { resolveMediaUrl } from '../../services/apiClient.js';
import { categoryService } from '../../services/categoryService.js';
import { productService } from '../../services/productService.js';
import { formatCurrency, translateRequestStatus } from '../../utils/formatters.js';

const EMPTY_PRODUCT = {
  name: '',
  sku: '',
  skuCorrectionReason: '',
  description: '',
  mediaAssets: [],
  price: '',
  unit: 'cái',
  categoryId: '',
  status: 'Inactive',
};

const isManagedProductImage = (asset) => (
  /^\/uploads\/products\//.test(String(asset?.url || ''))
);

function createProductCommandKey() {
  const identity = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `product-create:${identity}`;
}

export default function ProductManagementPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ ...EMPTY_PRODUCT });
  const [editingProductId, setEditingProductId] = useState(null);
  const [removedMediaAssets, setRemovedMediaAssets] = useState([]);
  const [uploadedMediaAssets, setUploadedMediaAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const productCreateCommandKey = useRef(createProductCommandKey());

  async function loadData() {
    setLoading(true);
    try {
      const [productData, categoryData] = await Promise.all([
        productService.listAdminProducts(),
        categoryService.listAdminCategories(),
      ]);
      setProducts(productData);
      setCategories(categoryData.filter((category) => category.status === 'Active'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData().catch((requestError) => setError(requestError.message));
  }, []);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function cleanupImages(assets) {
    await Promise.allSettled(
      assets
        .filter(isManagedProductImage)
        .filter((asset, index, all) => (
          all.findIndex((candidate) => candidate.assetId === asset.assetId) === index
        ))
        .map((asset) => productService.deleteMedia(asset))
    );
  }

  function clearForm() {
    setForm({ ...EMPTY_PRODUCT });
    setEditingProductId(null);
    setRemovedMediaAssets([]);
    setUploadedMediaAssets([]);
    productCreateCommandKey.current = createProductCommandKey();
  }

  async function cancelEditing() {
    await cleanupImages(uploadedMediaAssets);
    clearForm();
    setError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const payload = {
        name: form.name,
        sku: form.sku,
        description: form.description,
        price: Number(form.price),
        unit: form.unit,
        categoryId: form.categoryId,
        currency: 'VND',
        imageUrls: form.mediaAssets.map((asset) => asset.url),
        ...(editingProductId && form.skuCorrectionReason
          ? { skuCorrectionReason: form.skuCorrectionReason }
          : {}),
      };
      if (editingProductId) await productService.updateProduct(editingProductId, payload);
      else {
        await productService.createProduct(payload, {
          idempotencyKey: productCreateCommandKey.current,
        });
      }

      await cleanupImages(removedMediaAssets.filter(
        (asset) => !form.mediaAssets.some((current) => current.url === asset.url),
      ));
      const successMessage = editingProductId ? 'Sản phẩm đã được cập nhật.' : 'Sản phẩm mới đã được tạo.';
      clearForm();
      setMessage(successMessage);
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function startEditing(product) {
    await cleanupImages(uploadedMediaAssets);
    setEditingProductId(product.id);
    setForm({
      name: product.name || '',
      sku: product.sku || '',
      skuCorrectionReason: '',
      description: product.description || '',
      mediaAssets: (product.imageUrls || []).map((url, index) => ({
        assetId: `attached-${product.id}-${index}`,
        url,
        status: 'Attached',
        expiresAt: null,
      })),
      price: product.price ?? '',
      unit: product.unit || 'cái',
      categoryId: product.category?.id || '',
      status: product.status || 'Inactive',
    });
    setRemovedMediaAssets([]);
    setUploadedMediaAssets([]);
    setMessage('');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function toggleStatus(product) {
    setError('');
    try {
      await productService.updateProductStatus(product.id, product.status === 'Active' ? 'Inactive' : 'Active');
      setMessage(product.status === 'Active' ? 'Đã ngừng hiển thị sản phẩm.' : 'Đã kích hoạt lại sản phẩm.');
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleImageRemoved(asset) {
    if (uploadedMediaAssets.some((item) => item.assetId === asset.assetId)) {
      await cleanupImages([asset]);
      setUploadedMediaAssets((current) => current.filter(
        (item) => item.assetId !== asset.assetId,
      ));
      return;
    }
    setRemovedMediaAssets((current) => [...current, asset]);
  }

  const hasDraft = Boolean(editingProductId || form.name || form.mediaAssets.length);

  return (
    <div className="product-management-page">
      <header className="internal-page-heading">
        <div><span className="eyebrow">Danh mục bán hàng</span><h1>Quản lý sản phẩm</h1><p>Tạo, cập nhật và quản lý hình ảnh sản phẩm hiển thị trên cửa hàng.</p></div>
      </header>

      {message && <div className="alert alert-success" role="status">{message}</div>}
      {error && <div className="alert alert-danger" role="alert">{error}</div>}

      <section className="surface product-editor">
        <div className="product-editor-heading">
          <div><h2>{editingProductId ? 'Chỉnh sửa sản phẩm' : 'Thêm sản phẩm mới'}</h2><p>Thông tin khách hàng nhìn thấy trên trang sản phẩm.</p></div>
          {hasDraft && <button className="btn btn-outline-secondary" type="button" onClick={cancelEditing}>{editingProductId ? 'Hủy chỉnh sửa' : 'Xóa nội dung'}</button>}
        </div>
        <form className="product-editor-form" autoComplete="off" onSubmit={handleSubmit}>
          <div className="product-fields-grid">
            <label>Tên sản phẩm<input name="name" autoComplete="off" className="form-control" value={form.name} onChange={(event) => updateField('name', event.target.value)} maxLength="160" required /></label>
            <label>Mã SKU<input name="sku" className="form-control" value={form.sku} onChange={(event) => updateField('sku', event.target.value)} placeholder="Ví dụ: GH-NC-001" maxLength="80" required /></label>
            {editingProductId && (
              <label>
                Lý do sửa SKU
                <input
                  name="skuCorrectionReason"
                  className="form-control"
                  value={form.skuCorrectionReason}
                  onChange={(event) => updateField('skuCorrectionReason', event.target.value)}
                  placeholder="Bắt buộc nếu mã SKU thay đổi"
                  maxLength="500"
                />
              </label>
            )}
            <label>Giá bán (VND)<input name="price" className="form-control" type="number" min="1" step="1" value={form.price} onChange={(event) => updateField('price', event.target.value)} required /></label>
            <label>Đơn vị<input name="unit" className="form-control" value={form.unit} onChange={(event) => updateField('unit', event.target.value)} required /></label>
            <label>Danh mục<select name="categoryId" className="form-select" value={form.categoryId} onChange={(event) => updateField('categoryId', event.target.value)} required><option value="">Chọn danh mục</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label className="full-width">Mô tả<textarea name="description" className="form-control" rows="4" maxLength="2000" value={form.description} onChange={(event) => updateField('description', event.target.value)} required /></label>
          </div>

          <ProductMediaManager
            images={form.mediaAssets}
            onChange={(mediaAssets) => updateField('mediaAssets', mediaAssets)}
            onRemoved={handleImageRemoved}
            onUploaded={(assets) => setUploadedMediaAssets((current) => [...current, ...assets])}
          />

          <div className="product-editor-submit">
            <button className="btn btn-success" type="submit" disabled={saving}>{saving ? 'Đang lưu...' : editingProductId ? 'Lưu thay đổi' : 'Tạo sản phẩm'}</button>
          </div>
        </form>
      </section>

      <section className="surface product-admin-list">
        <div className="product-editor-heading"><div><h2>Danh sách sản phẩm</h2><p>{products.length} sản phẩm trong hệ thống.</p></div></div>
        {loading ? <div className="account-state">Đang tải sản phẩm...</div> : (
          <div className="table-responsive">
            <table className="table align-middle">
              <thead><tr><th>Sản phẩm</th><th>SKU</th><th>Danh mục</th><th>Giá</th><th>Khả dụng</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <td><div className="admin-product-cell">{product.imageUrls?.[0] ? <img src={resolveMediaUrl(product.imageUrls[0])} alt="" /> : <span>Không ảnh</span>}<strong>{product.name}</strong></div></td>
                    <td>{product.sku || '-'}</td>
                    <td>{product.category?.name || '-'}</td>
                    <td>{formatCurrency(product.price)}</td>
                    <td>{product.availabilityStatus === 'InStock' ? 'Còn hàng' : 'Hết hàng'}</td>
                    <td><span className={`status-pill ${product.status === 'Active' ? 'success' : 'neutral'}`}>{translateRequestStatus(product.status)}</span></td>
                    <td><div className="table-actions"><button type="button" onClick={() => startEditing(product)}>Chỉnh sửa</button><button className={product.status === 'Active' ? 'danger' : ''} type="button" onClick={() => toggleStatus(product)}>{product.status === 'Active' ? 'Ngừng bán' : 'Kích hoạt'}</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
