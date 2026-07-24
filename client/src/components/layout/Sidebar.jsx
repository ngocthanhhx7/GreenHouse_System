import { forwardRef } from 'react';
import { NavLink } from 'react-router-dom';

import useAuth from '../../hooks/useAuth.js';
import { translateRole } from '../../utils/formatters.js';

const ROLE_LINKS = {
  Customer: [
    { to: '/cart', label: 'Giỏ hàng' },
    { to: '/orders', label: 'Đơn mua' },
    { to: '/return-refunds', label: 'Đổi trả / hoàn tiền' },
    { to: '/exchanges', label: 'Yêu cầu đổi hàng' },
    { to: '/support', label: 'Hỗ trợ' },
  ],
  Staff: [
    { to: '/staff', label: 'Tổng quan xử lý đơn' },
    { to: '/staff/orders', label: 'Hàng đợi đơn hàng' },
    { to: '/staff/return-refunds', label: 'Đổi trả / hoàn tiền' },
    { to: '/staff/exchanges', label: 'Đổi hàng' },
    { to: '/staff/support-requests', label: 'Yêu cầu hỗ trợ' },
    { to: '/staff/damage-reports', label: 'Báo hàng hư hỏng' },
  ],
  WarehouseManager: [
    { to: '/warehouse', label: 'Tổng quan kho' },
    { to: '/warehouse/inventory', label: 'Tồn kho' },
    { to: '/warehouse/damage-reports', label: 'Duyệt hàng hư hỏng' },
    { to: '/warehouse/stock-exports', label: 'Phiếu xuất kho' },
    { to: '/warehouse/returned-parcels', label: 'Kiện giao thất bại hoàn về' },
    { to: '/warehouse/return-refunds', label: 'Kiểm hàng đổi trả' },
    { to: '/warehouse/exchanges', label: 'Kiểm hàng đổi hàng' },
    { to: '/warehouse/low-stock', label: 'Cảnh báo sắp hết' },
    { to: '/warehouse/replenishments', label: 'Bổ sung hàng' },
  ],
  Admin: [
    { to: '/admin', label: 'Tổng quan quản trị' },
    { to: '/admin/audit-logs', label: 'Nhật ký hệ thống' },
    { to: '/admin/products', label: 'Sản phẩm' },
    { to: '/admin/categories', label: 'Danh mục' },
    { to: '/admin/replenishments', label: 'Duyệt nhập hàng' },
    { to: '/admin/settings', label: 'Cấu hình' },
  ],
};

const Sidebar = forwardRef(function Sidebar({ open = false, onNavigate }, ref) {
  const { user } = useAuth();
  const links = ROLE_LINKS[user?.role] || ROLE_LINKS.Customer;

  return (
    <aside
      id="operational-sidebar"
      ref={ref}
      className={`app-sidebar sidebar-drawer ${open ? 'is-open' : ''}`}
      role={open ? 'dialog' : undefined}
      aria-modal={open ? 'true' : undefined}
      aria-label={`Điều hướng ${translateRole(user?.role)}`}
      tabIndex={-1}
    >
      <div className="sidebar-title">
        <span>GreenHome Kitchen</span>
        <strong>{translateRole(user?.role)}</strong>
      </div>
      <nav className="nav flex-column gap-1">
        {links.map((link) => (
          <NavLink key={link.to} className="nav-link" to={link.to} onClick={onNavigate}>
            {link.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
});

export default Sidebar;
