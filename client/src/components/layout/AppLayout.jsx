import { Outlet } from 'react-router-dom';

import Footer from './Footer.jsx';
import Header from './Header.jsx';
import Sidebar from './Sidebar.jsx';

export default function AppLayout() {
  return (
    <div className="app-shell">
      <Header />
      <div className="app-body">
        <Sidebar />
        <main className="app-content">
          <Outlet />
        </main>
      </div>
      <Footer />
    </div>
  );
}
