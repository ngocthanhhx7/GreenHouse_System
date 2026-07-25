import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { cartService } from '../../services/cartService.js';
import { useCart } from '../../contexts/CartContext.jsx';
import { createCheckoutIdempotencyKey, orderService } from '../../services/orderService.js';
import { profileService } from '../../services/profileService.js';
import { formatCurrency } from '../../utils/formatters.js';
import { translateApiError } from '../../utils/errorMessages.js';

const EMPTY_ADDRESS = {
  label: 'Địa chỉ mới', receiverName: '', phoneNumber: '', province: '', district: '', ward: '', addressLine: '', isDefault: false,
};

const CHECKOUT_ISSUES = {
  PriceChanged: 'Giá sản phẩm đã thay đổi.',
  Unavailable: 'Sản phẩm hoặc danh mục không còn được bán.',
  InsufficientStock: 'Số lượng đã chọn không còn đủ.',
  InventoryReconciliation: 'Tồn kho đang được đối soát.',
};

export function formatShippingAddress(address) {
  return [address.addressLine, address.ward, address.district, address.province]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(', ');
}

function toFieldErrors(errors, errorCode) {
  return (Array.isArray(errors) ? errors : []).reduce((result, entry) => {
    const field = errorCode === 'CHECKOUT_STOCK_INSUFFICIENT'
      ? 'checkoutStock'
      : String(entry?.field || '').startsWith('expectedItems.')
      ? 'checkoutPrice'
      : entry?.field === 'savedAddressId' || entry?.field === 'deliveryAddress'
      ? 'addressSource'
      : entry?.field;
    if (field && entry?.message && !result[field]) result[field] = entry.message;
    return result;
  }, {});
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { resetCart } = useCart();
  const [cart, setCart] = useState({
    id: null,
    version: 0,
    items: [],
    subtotal: 0,
    shippingFee: 0,
    totalAmount: 0,
    canCheckout: false,
  });
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [addressMode, setAddressMode] = useState('new');
  const [newAddress, setNewAddress] = useState(EMPTY_ADDRESS);
  const [saveAddress, setSaveAddress] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('COD');
  const [customerNote, setCustomerNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [checkoutIdempotencyKey] = useState(() => createCheckoutIdempotencyKey());
  const submittingRef = useRef(false);

  useEffect(() => {
    let active = true;
    async function loadCheckout() {
      try {
        const [cartResult, addressResult, profile] = await Promise.all([
          cartService.getCart(),
          profileService.listAddresses(),
          profileService.getProfile(),
        ]);
        if (!active) return;
        const savedAddresses = addressResult.items || [];
        const defaultAddress = savedAddresses.find((address) => address.isDefault) || savedAddresses[0];
        setCart(cartResult);
        setAddresses(savedAddresses);
        setSelectedAddressId(defaultAddress?.id || '');
        setAddressMode(defaultAddress ? 'saved' : 'new');
        setNewAddress((current) => ({
          ...current,
          receiverName: profile.fullName || '',
          phoneNumber: profile.phoneNumber || '',
          isDefault: savedAddresses.length === 0,
        }));
      } catch (requestError) {
        if (active) setError(translateApiError(requestError));
      } finally {
        if (active) setLoading(false);
      }
    }
    loadCheckout();
    return () => { active = false; };
  }, []);

  function updateNewAddress(field, value) {
    setNewAddress((current) => ({ ...current, [field]: value }));
    clearFieldError(field);
  }

  function clearFieldError(field) {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const { [field]: _cleared, ...remaining } = current;
      return remaining;
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    setFieldErrors({});
    try {
      let deliveryAddress;
      let checkoutAddressPayload;
      if (addressMode === 'saved') {
        deliveryAddress = addresses.find((address) => address.id === selectedAddressId);
        if (!deliveryAddress) throw new Error('Vui lòng chọn một địa chỉ nhận hàng.');
        checkoutAddressPayload = { savedAddressId: deliveryAddress.id };
      } else {
        deliveryAddress = newAddress;
        if (saveAddress) {
          const savedAddress = await profileService.createAddress(newAddress);
          deliveryAddress = savedAddress;
          checkoutAddressPayload = { savedAddressId: savedAddress.id };
          setAddresses((current) => [savedAddress, ...current]);
          setSelectedAddressId(savedAddress.id);
          setAddressMode('saved');
          setSaveAddress(false);
        } else {
          checkoutAddressPayload = { deliveryAddress: newAddress };
        }
      }

      const order = await orderService.placeOrder({
        ...checkoutAddressPayload,
        cartId: cart.id,
        cartVersion: cart.version,
        customerNote,
        paymentMethod,
        expectedItems: cart.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          priceVersion: item.priceVersion,
        })),
      }, { idempotencyKey: checkoutIdempotencyKey });
      resetCart();
      navigate(`/orders/${order.id}`, { replace: true });
    } catch (requestError) {
      const nextFieldErrors = toFieldErrors(requestError.errors, requestError.errorCode);
      setFieldErrors(nextFieldErrors);
      setError(Object.keys(nextFieldErrors).length ? '' : translateApiError(requestError));
      if (requestError.data?.cart) setCart(requestError.data.cart);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (loading) return <div className="surface checkout-loading">Đang chuẩn bị thông tin thanh toán...</div>;

  return (
    <div className="checkout-page-v2">
      <header className="checkout-heading">
        <div><span className="eyebrow">Thanh toán an toàn</span><h1>Hoàn tất đơn hàng</h1><p>Kiểm tra địa chỉ nhận hàng và phương thức thanh toán trước khi xác nhận.</p></div>
        <Link to="/cart">Quay lại giỏ hàng</Link>
      </header>

      <div className="checkout-steps" aria-label="Các bước thanh toán">
        {['Địa chỉ nhận hàng', 'Phương thức thanh toán', 'Xác nhận đơn'].map((step, index) => <div className={`checkout-step ${index === 0 ? 'active' : ''}`} key={step}><span>{index + 1}</span><strong>{step}</strong></div>)}
      </div>

      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {fieldErrors.checkoutPrice && <div className="alert alert-warning" role="alert">{fieldErrors.checkoutPrice}</div>}
      {fieldErrors.checkoutStock && <div className="alert alert-warning" role="alert">{fieldErrors.checkoutStock}</div>}
      {!cart.canCheckout && cart.items.length > 0 && (
        <div className="alert alert-warning" role="alert">
          Giỏ hàng đã thay đổi hoặc có sản phẩm chưa thể mua. Vui lòng quay lại giỏ hàng để xử lý.
        </div>
      )}

      <form className="checkout-grid checkout-form-v2" onSubmit={handleSubmit}>
        <div className="checkout-main-column">
          <section className="checkout-panel">
            <div className="checkout-panel-heading"><div><span>01</span><h2>Địa chỉ nhận hàng</h2></div><Link to="/profile">Quản lý sổ địa chỉ</Link></div>

            {addresses.length > 0 && <div className="checkout-address-tabs" role="tablist" aria-label="Nguồn địa chỉ"><button className={addressMode === 'saved' ? 'active' : ''} type="button" role="tab" aria-selected={addressMode === 'saved'} onClick={() => { setAddressMode('saved'); clearFieldError('addressSource'); }}>Địa chỉ đã lưu</button><button className={addressMode === 'new' ? 'active' : ''} type="button" role="tab" aria-selected={addressMode === 'new'} onClick={() => { setAddressMode('new'); clearFieldError('addressSource'); }}>Địa chỉ mới</button></div>}
            {fieldErrors.addressSource && <p className="field-error" role="alert">{fieldErrors.addressSource}</p>}

            {addressMode === 'saved' && (
              <div className="checkout-address-list">
                {addresses.map((address) => (
                  <label className={`checkout-address-card ${selectedAddressId === address.id ? 'selected' : ''}`} key={address.id}>
                    <input type="radio" name="savedAddress" value={address.id} checked={selectedAddressId === address.id} onChange={() => { setSelectedAddressId(address.id); clearFieldError('addressSource'); }} />
                    <span className="checkout-address-content"><span><strong>{address.label}</strong>{address.isDefault && <small>Mặc định</small>}</span><b>{address.receiverName} · {address.phoneNumber}</b><span>{formatShippingAddress(address)}</span></span>
                  </label>
                ))}
              </div>
            )}

            {addressMode === 'new' && (
              <div className="checkout-address-form">
                <label>Người nhận<input name="receiverName" autoComplete="shipping name" value={newAddress.receiverName} maxLength="120" required onChange={(event) => updateNewAddress('receiverName', event.target.value)} />{fieldErrors.receiverName && <small className="field-error" role="alert">{fieldErrors.receiverName}</small>}</label>
                <label>Số điện thoại<input name="receiverPhone" autoComplete="shipping tel" inputMode="tel" pattern="(?:\+84|0)(?:3|5|7|8|9)[0-9]{8}" value={newAddress.phoneNumber} required onChange={(event) => updateNewAddress('phoneNumber', event.target.value)} />{fieldErrors.phoneNumber && <small className="field-error" role="alert">{fieldErrors.phoneNumber}</small>}</label>
                <label>Tỉnh/Thành<input name="province" autoComplete="shipping address-level1" value={newAddress.province} maxLength="100" required onChange={(event) => updateNewAddress('province', event.target.value)} />{fieldErrors.province && <small className="field-error" role="alert">{fieldErrors.province}</small>}</label>
                <label>Quận/Huyện<input name="district" autoComplete="shipping address-level2" value={newAddress.district} maxLength="100" required onChange={(event) => updateNewAddress('district', event.target.value)} />{fieldErrors.district && <small className="field-error" role="alert">{fieldErrors.district}</small>}</label>
                <label>Phường/Xã<input name="ward" autoComplete="shipping address-level3" value={newAddress.ward} maxLength="100" required onChange={(event) => updateNewAddress('ward', event.target.value)} />{fieldErrors.ward && <small className="field-error" role="alert">{fieldErrors.ward}</small>}</label>
                <label>Địa chỉ chi tiết<input name="addressLine" autoComplete="shipping street-address" value={newAddress.addressLine} maxLength="300" required onChange={(event) => updateNewAddress('addressLine', event.target.value)} />{fieldErrors.addressLine && <small className="field-error" role="alert">{fieldErrors.addressLine}</small>}</label>
                <label className="checkout-save-address"><input name="saveAddress" type="checkbox" checked={saveAddress} onChange={(event) => { setSaveAddress(event.target.checked); clearFieldError('label'); }} />Lưu địa chỉ này vào sổ địa chỉ</label>
                {saveAddress && <label className="checkout-address-label">Tên gợi nhớ<input name="addressLabel" value={newAddress.label} maxLength="50" required onChange={(event) => updateNewAddress('label', event.target.value)} placeholder="Ví dụ: Nhà riêng, Văn phòng" />{fieldErrors.label && <small className="field-error" role="alert">{fieldErrors.label}</small>}</label>}
              </div>
            )}
          </section>

          <section className="checkout-panel">
            <div className="checkout-panel-heading"><div><span>02</span><h2>Phương thức thanh toán</h2></div></div>
            <div className="checkout-payment-options">
              <label className={paymentMethod === 'COD' ? 'selected' : ''}><input type="radio" name="paymentMethod" value="COD" checked={paymentMethod === 'COD'} onChange={(event) => setPaymentMethod(event.target.value)} /><span><strong>Thanh toán khi nhận hàng</strong><small>Thanh toán cho đơn vị giao hàng khi nhận sản phẩm.</small></span></label>
              <label className={paymentMethod === 'ONLINE' ? 'selected' : ''}><input type="radio" name="paymentMethod" value="ONLINE" checked={paymentMethod === 'ONLINE'} onChange={(event) => setPaymentMethod(event.target.value)} /><span><strong>Thanh toán trực tuyến</strong><small>Chuyển sang bước thanh toán online sau khi tạo đơn.</small></span></label>
            </div>
            <label className="checkout-note">Ghi chú cho đơn hàng<textarea name="customerNote" rows="3" maxLength="500" value={customerNote} placeholder="Ví dụ: Giao giờ hành chính, gọi trước khi giao..." onChange={(event) => { setCustomerNote(event.target.value); clearFieldError('customerNote'); }} />{fieldErrors.customerNote && <small className="field-error" role="alert">{fieldErrors.customerNote}</small>}</label>
          </section>
        </div>

        <aside className="summary-box checkout-summary">
          <h2>Đơn hàng của bạn</h2>
          <div className="checkout-summary-items">
            {cart.items.map((item) => (
              <div className="summary-line" key={item.id}>
                <span>
                  {item.productName}
                  <small>Số lượng: {item.quantity}</small>
                  {(item.issues || []).map((issue) => (
                    <small className="field-error" key={issue.code}>
                      {CHECKOUT_ISSUES[issue.code] || issue.message}
                    </small>
                  ))}
                </span>
                <strong>{formatCurrency(item.subtotal)}</strong>
              </div>
            ))}
          </div>
          <div className="summary-line"><span>Tạm tính</span><strong>{formatCurrency(cart.subtotal)}</strong></div>
          <div className="summary-line"><span>Phí vận chuyển: 0 ₫</span><strong>{formatCurrency(cart.shippingFee)}</strong></div>
          <div className="summary-total"><span>Tổng thanh toán</span><strong>{formatCurrency(cart.totalAmount)}</strong></div>
          {!cart.items.length && <p className="checkout-empty-cart">Giỏ hàng của bạn đang trống.</p>}
          <button className="btn btn-success checkout-submit" type="submit" disabled={!cart.canCheckout || submitting}>{submitting ? 'Đang tạo đơn...' : 'Đặt hàng'}</button>
          <small className="checkout-confirm-note">Bằng việc đặt hàng, bạn xác nhận thông tin nhận hàng là chính xác.</small>
        </aside>
      </form>
    </div>
  );
}
