import { useEffect, useMemo, useState } from 'react';

import useAuth from '../../hooks/useAuth.js';
import { resolveMediaUrl } from '../../services/apiClient.js';
import { profileService } from '../../services/profileService.js';
import { translateRole } from '../../utils/formatters.js';

const EMPTY_ADDRESS = {
  label: '', receiverName: '', phoneNumber: '', province: '', district: '', ward: '', addressLine: '', isDefault: false,
};

function initials(profile) {
  return String(profile?.fullName || profile?.email || 'GH')
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const isCustomer = user?.role === 'Customer';
  const [profile, setProfile] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [profileForm, setProfileForm] = useState({ fullName: '', phoneNumber: '', address: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [addressForm, setAddressForm] = useState(EMPTY_ADDRESS);
  const [editingAddressId, setEditingAddressId] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadAccount() {
    setLoading(true);
    setError('');
    try {
      const [profileResult, addressResult] = await Promise.all([
        profileService.getProfile(),
        isCustomer ? profileService.listAddresses() : Promise.resolve({ items: [] }),
      ]);
      setProfile(profileResult);
      setProfileForm({
        fullName: profileResult.fullName || '',
        phoneNumber: profileResult.phoneNumber || '',
        address: profileResult.address || '',
      });
      setAddresses(addressResult.items || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAccount();
  }, [isCustomer]);

  useEffect(() => () => {
    if (avatarPreview.startsWith('blob:')) URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);

  const currentAvatar = useMemo(
    () => avatarPreview || resolveMediaUrl(profile?.avatarUrl),
    [avatarPreview, profile?.avatarUrl]
  );

  function showSuccess(value) {
    setError('');
    setMessage(value);
  }

  function showError(requestError) {
    setMessage('');
    setError(requestError.message);
  }

  async function submitProfile(event) {
    event.preventDefault();
    setBusy('profile');
    try {
      const updated = await profileService.updateProfile(profileForm);
      setProfile(updated);
      updateUser(updated);
      showSuccess('Thông tin cá nhân đã được cập nhật.');
    } catch (requestError) {
      showError(requestError);
    } finally {
      setBusy('');
    }
  }

  async function uploadAvatar(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('Ảnh đại diện phải là JPEG, PNG hoặc WebP và không vượt quá 5 MB.');
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setAvatarPreview(previewUrl);
    setBusy('avatar');
    try {
      const result = await profileService.uploadAvatar(file);
      setProfile(result.profile);
      updateUser(result.profile);
      setAvatarPreview('');
      showSuccess('Ảnh đại diện đã được cập nhật.');
    } catch (requestError) {
      setAvatarPreview('');
      showError(requestError);
    } finally {
      setBusy('');
    }
  }

  async function removeAvatar() {
    setBusy('avatar');
    try {
      const result = await profileService.deleteAvatar();
      setProfile(result.profile);
      updateUser(result.profile);
      setAvatarPreview('');
      showSuccess('Đã xóa ảnh đại diện.');
    } catch (requestError) {
      showError(requestError);
    } finally {
      setBusy('');
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setBusy('password');
    try {
      await profileService.changePassword(passwordForm);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      showSuccess('Mật khẩu đã được thay đổi an toàn.');
    } catch (requestError) {
      showError(requestError);
    } finally {
      setBusy('');
    }
  }

  function editAddress(address) {
    setEditingAddressId(address.id);
    setAddressForm({
      label: address.label,
      receiverName: address.receiverName,
      phoneNumber: address.phoneNumber,
      province: address.province,
      district: address.district,
      ward: address.ward,
      addressLine: address.addressLine,
      isDefault: address.isDefault,
    });
  }

  function resetAddressForm() {
    setEditingAddressId(null);
    setAddressForm(EMPTY_ADDRESS);
  }

  async function submitAddress(event) {
    event.preventDefault();
    setBusy('address');
    try {
      if (editingAddressId) await profileService.updateAddress(editingAddressId, addressForm);
      else await profileService.createAddress(addressForm);
      const result = await profileService.listAddresses();
      setAddresses(result.items || []);
      resetAddressForm();
      showSuccess(editingAddressId ? 'Địa chỉ đã được cập nhật.' : 'Địa chỉ mới đã được lưu.');
    } catch (requestError) {
      showError(requestError);
    } finally {
      setBusy('');
    }
  }

  async function makeDefault(id) {
    const previous = addresses;
    setAddresses((items) => items.map((item) => ({ ...item, isDefault: item.id === id })));
    try {
      await profileService.setDefaultAddress(id);
      showSuccess('Đã thay đổi địa chỉ mặc định.');
    } catch (requestError) {
      setAddresses(previous);
      showError(requestError);
    }
  }

  async function deleteAddress(id) {
    if (!window.confirm('Bạn có chắc muốn xóa địa chỉ này?')) return;
    setBusy(`delete-${id}`);
    try {
      await profileService.deleteAddress(id);
      const result = await profileService.listAddresses();
      setAddresses(result.items || []);
      if (editingAddressId === id) resetAddressForm();
      showSuccess('Địa chỉ đã được xóa.');
    } catch (requestError) {
      showError(requestError);
    } finally {
      setBusy('');
    }
  }

  if (loading) return <div className="account-panel account-state">Đang tải hồ sơ của bạn...</div>;

  return (
    <div className="profile-page">
      <header className="account-page-heading">
        <div>
          <span className="eyebrow">Tài khoản của bạn</span>
          <h1>Hồ sơ cá nhân</h1>
          <p>{isCustomer ? 'Cập nhật thông tin liên hệ, bảo mật và các địa chỉ thường dùng khi mua hàng.' : 'Cập nhật thông tin liên hệ và bảo mật tài khoản của bạn.'}</p>
        </div>
      </header>

      {message && <div className="alert alert-success" role="status">{message}</div>}
      {error && <div className="alert alert-danger" role="alert">{error}</div>}

      <section className="account-panel profile-identity">
        <div className="profile-avatar-large">
          {currentAvatar ? <img src={currentAvatar} alt="Ảnh đại diện hiện tại" /> : <span>{initials(profile)}</span>}
        </div>
        <div className="profile-identity-copy">
          <h2>{profile?.fullName}</h2>
          <p>{profile?.email}</p>
          <span>{translateRole(profile?.role?.roleName || user?.role)}</span>
        </div>
        <div className="profile-avatar-actions">
          <label className="btn btn-success" aria-disabled={busy === 'avatar'}>
            {busy === 'avatar' ? 'Đang xử lý...' : 'Thay ảnh'}
            <input name="avatar" type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={busy === 'avatar'} onChange={uploadAvatar} />
          </label>
          {profile?.avatarUrl && <button className="btn btn-outline-danger" type="button" disabled={busy === 'avatar'} onClick={removeAvatar}>Xóa ảnh</button>}
          <small>JPEG, PNG hoặc WebP, tối đa 5 MB.</small>
        </div>
      </section>

      <div className="account-section-grid">
        <section className="account-panel">
          <div className="account-section-heading"><h2>Thông tin cá nhân</h2><p>Email và vai trò được quản trị bởi hệ thống.</p></div>
          <form className="account-form" onSubmit={submitProfile}>
            <label>Họ và tên<input name="fullName" autoComplete="name" value={profileForm.fullName} minLength="2" maxLength="120" required onChange={(event) => setProfileForm({ ...profileForm, fullName: event.target.value })} /></label>
            <label>Số điện thoại<input name="phoneNumber" autoComplete="tel" value={profileForm.phoneNumber} inputMode="tel" pattern="(?:\+84|0)(?:3|5|7|8|9)[0-9]{8}" required onChange={(event) => setProfileForm({ ...profileForm, phoneNumber: event.target.value })} /></label>
            <label className="full-width">Địa chỉ cơ bản<textarea name="address" autoComplete="street-address" value={profileForm.address} maxLength="500" required onChange={(event) => setProfileForm({ ...profileForm, address: event.target.value })} /></label>
            <button className="btn btn-success" type="submit" disabled={busy === 'profile'}>{busy === 'profile' ? 'Đang lưu...' : 'Lưu thay đổi'}</button>
          </form>
        </section>

        <section className="account-panel">
          <div className="account-section-heading"><h2>Đổi mật khẩu</h2><p>Dùng ít nhất 8 ký tự, gồm chữ và số.</p></div>
          <form className="account-form single-column" onSubmit={changePassword}>
            <label>Mật khẩu hiện tại<input name="currentPassword" type="password" autoComplete="current-password" required value={passwordForm.currentPassword} onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })} /></label>
            <label>Mật khẩu mới<input name="newPassword" type="password" autoComplete="new-password" minLength="8" required value={passwordForm.newPassword} onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} /></label>
            <label>Xác nhận mật khẩu mới<input name="confirmPassword" type="password" autoComplete="new-password" minLength="8" required value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })} /></label>
            <button className="btn btn-outline-success" type="submit" disabled={busy === 'password'}>{busy === 'password' ? 'Đang đổi...' : 'Đổi mật khẩu'}</button>
          </form>
        </section>
      </div>

      {isCustomer && <section className="account-panel address-book-section">
        <div className="account-section-heading"><h2>Sổ địa chỉ</h2><p>Lưu địa chỉ nhận hàng để điền nhanh khi thanh toán.</p></div>
        <div className="address-book-grid">
          <div className="address-list">
            {addresses.map((address) => (
              <article className={`address-item ${address.isDefault ? 'default' : ''}`} key={address.id}>
                <div className="address-item-heading"><strong>{address.label}</strong>{address.isDefault && <span>Mặc định</span>}</div>
                <p><strong>{address.receiverName}</strong> · {address.phoneNumber}</p>
                <p>{address.addressLine}, {address.ward}, {address.district}, {address.province}</p>
                <div className="address-actions">
                  <button type="button" onClick={() => editAddress(address)}>Chỉnh sửa</button>
                  {!address.isDefault && <button type="button" onClick={() => makeDefault(address.id)}>Đặt mặc định</button>}
                  <button className="danger" type="button" disabled={busy === `delete-${address.id}`} onClick={() => deleteAddress(address.id)}>Xóa</button>
                </div>
              </article>
            ))}
            {!addresses.length && <div className="account-empty">Bạn chưa lưu địa chỉ nhận hàng nào.</div>}
          </div>

          <form className="address-form" onSubmit={submitAddress}>
            <h3>{editingAddressId ? 'Chỉnh sửa địa chỉ' : 'Thêm địa chỉ mới'}</h3>
            <label>Nhãn địa chỉ<input name="label" placeholder="Nhà riêng, Văn phòng..." maxLength="50" required value={addressForm.label} onChange={(event) => setAddressForm({ ...addressForm, label: event.target.value })} /></label>
            <label>Người nhận<input name="receiverName" autoComplete="shipping name" maxLength="120" required value={addressForm.receiverName} onChange={(event) => setAddressForm({ ...addressForm, receiverName: event.target.value })} /></label>
            <label>Số điện thoại<input name="addressPhoneNumber" autoComplete="shipping tel" inputMode="tel" pattern="(?:\+84|0)(?:3|5|7|8|9)[0-9]{8}" required value={addressForm.phoneNumber} onChange={(event) => setAddressForm({ ...addressForm, phoneNumber: event.target.value })} /></label>
            <div className="address-region-grid">
              <label>Tỉnh/Thành<input name="province" autoComplete="shipping address-level1" required value={addressForm.province} onChange={(event) => setAddressForm({ ...addressForm, province: event.target.value })} /></label>
              <label>Quận/Huyện<input name="district" autoComplete="shipping address-level2" required value={addressForm.district} onChange={(event) => setAddressForm({ ...addressForm, district: event.target.value })} /></label>
              <label>Phường/Xã<input name="ward" autoComplete="shipping address-level3" required value={addressForm.ward} onChange={(event) => setAddressForm({ ...addressForm, ward: event.target.value })} /></label>
            </div>
            <label>Địa chỉ chi tiết<textarea name="addressLine" autoComplete="shipping street-address" maxLength="300" required value={addressForm.addressLine} onChange={(event) => setAddressForm({ ...addressForm, addressLine: event.target.value })} /></label>
            <label className="account-checkbox"><input name="isDefault" type="checkbox" checked={addressForm.isDefault} onChange={(event) => setAddressForm({ ...addressForm, isDefault: event.target.checked })} />Đặt làm địa chỉ mặc định</label>
            <div className="address-form-actions">
              <button className="btn btn-success" type="submit" disabled={busy === 'address'}>{busy === 'address' ? 'Đang lưu...' : editingAddressId ? 'Cập nhật địa chỉ' : 'Lưu địa chỉ'}</button>
              {editingAddressId && <button className="btn btn-outline-secondary" type="button" onClick={resetAddressForm}>Hủy</button>}
            </div>
          </form>
        </div>
      </section>}
    </div>
  );
}
