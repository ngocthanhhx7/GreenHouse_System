import { useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';

import InternalTopbar from './InternalTopbar.jsx';
import Sidebar from './Sidebar.jsx';

const FOCUSABLE_ELEMENTS = 'a[href], button:not([disabled])';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const sidebarRef = useRef(null);

  useEffect(() => {
    if (!sidebarOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebarRef.current?.querySelector(FOCUSABLE_ELEMENTS)?.focus();

    function handleSidebarKeyDown(event) {
      if (event.key === 'Escape') {
        setSidebarOpen(false);
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = Array.from(sidebarRef.current?.querySelectorAll(FOCUSABLE_ELEMENTS) || []);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleSidebarKeyDown);
    return () => {
      document.removeEventListener('keydown', handleSidebarKeyDown);
      document.body.style.overflow = previousOverflow;
      menuButtonRef.current?.focus();
    };
  }, [sidebarOpen]);

  return (
    <div className="app-shell">
      <InternalTopbar
        menuOpen={sidebarOpen}
        menuButtonRef={menuButtonRef}
        onMenuToggle={() => setSidebarOpen((value) => !value)}
      />
      <div className="app-body">
        <Sidebar ref={sidebarRef} open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
        {sidebarOpen && (
          <div
            className="sidebar-overlay"
            aria-hidden="true"
            onMouseDown={() => setSidebarOpen(false)}
          />
        )}
        <main id="main-content" className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
