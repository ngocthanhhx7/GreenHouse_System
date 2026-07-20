import { NavLink } from 'react-router-dom';

import useAuth from '../../hooks/useAuth.js';
import { translateRole } from '../../utils/formatters.js';

const ROLE_LINKS = {
  Customer: [
    { to: '/cart', label: 'Giỏ hàng' },
    { to: '/orders', label: 'Đơn mua' },
    { to: '/return-refunds', label: 'Đổi trả / hoàn tiền' },
    { to: '/support', label: 'Hỗ trợ' },
  ],
  Staff: [
    { to: '/staff', label: 'Tổng quan xử lý đơn' },
    { to: '/staff/orders', label: 'Hàng đợi đơn hàng' },
    { to: '/staff/return-refunds', label: 'Đổi trả / hoàn tiền' },
    { to: '/staff/support-requests', label: 'Yêu cầu hỗ trợ' },
  ],
  WarehouseManager: [
    { to: '/warehouse', label: 'Tổng quan kho' },
    { to: '/warehouse/inventory', label: 'Tồn kho' },
    { to: '/warehouse/stock-exports', label: 'Phiếu xuất kho' },
    { to: '/warehouse/return-refunds', label: 'Kiểm hàng đổi trả' },
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

export default function Sidebar() {
  const { user } = useAuth();
  const links = ROLE_LINKS[user?.role] || ROLE_LINKS.Customer;

  return (
    <aside className="app-sidebar">
      <div className="sidebar-title">{translateRole(user?.role)}</div>
      <nav className="nav flex-column gap-1">
        {links.map((link) => (
          <NavLink key={link.to} className="nav-link" to={link.to}>
            {link.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
