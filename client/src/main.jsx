import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';

import App from './App.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import './styles.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/shared-shell.css';
import './styles/storefront.css';
import './styles/operations.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
