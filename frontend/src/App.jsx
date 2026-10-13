import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { useAuth } from './context/AuthContext.jsx';
import Autorizaciones from './pages/Autorizaciones.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Login from './pages/Login.jsx';
import Medicion from './pages/Medicion.jsx';
import Paquetes from './pages/Paquetes.jsx';

// Protege las páginas internas: sin sesión redirige al login
function RutaPrivada() {
  const { usuario } = useAuth();
  return usuario ? <Layout /> : <Navigate to="/login" replace />;
}

// Rutas de la aplicación
export default function App() {
  const { usuario } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={usuario ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<RutaPrivada />}>
        <Route index element={<Dashboard />} />
        <Route path="paquetes" element={<Paquetes />} />
        <Route path="autorizaciones" element={<Autorizaciones />} />
        <Route path="medicion" element={<Medicion />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
