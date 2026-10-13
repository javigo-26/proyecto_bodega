import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AlertProvider } from './context/AlertContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { BodegaProvider } from './context/BodegaContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import './index.css';

// Punto de entrada: monta la aplicación con los proveedores globales
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AlertProvider>
          <AuthProvider>
            <BodegaProvider>
              <App />
            </BodegaProvider>
          </AuthProvider>
        </AlertProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
