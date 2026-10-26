import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: 'rgba(18,18,42,0.95)',
            color: '#fff',
            border: '1px solid rgba(108,99,255,0.3)',
            backdropFilter: 'blur(12px)',
            borderRadius: '12px',
            fontFamily: 'Space Grotesk, sans-serif',
          },
          success: {
            iconTheme: { primary: '#10B981', secondary: '#0A0A1A' },
          },
          error: {
            iconTheme: { primary: '#EF4444', secondary: '#0A0A1A' },
          },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>
);
