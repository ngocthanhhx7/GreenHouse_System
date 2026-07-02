import { Outlet } from 'react-router-dom';

import InternalTopbar from './InternalTopbar.jsx';
import Sidebar from './Sidebar.jsx';

export default function AppLayout() {
  return (
    <div className="app-shell">
      <InternalTopbar />
      <div className="app-body">
        <Sidebar />
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
