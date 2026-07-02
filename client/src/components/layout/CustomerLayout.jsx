import { Outlet } from 'react-router-dom';

import Footer from './Footer.jsx';
import Header from './Header.jsx';

export default function CustomerLayout() {
  return (
    <div className="customer-shell">
      <Header showCart />
      <main className="customer-main">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
