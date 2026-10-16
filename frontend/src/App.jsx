import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { useAuth } from './context/AuthContext.jsx';
import Autorizaciones from './pages/Autorizaciones.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Login from './pages/Login.jsx';
// Medición desactivada: la estación detecta tipo y tamaño al recibir el paquete (ver Recepción)
// import Medicion from './pages/Medicion.jsx';
import Paquetes from './pages/Paquetes.jsx';
import Recepcion from './pages/Recepcion.jsx';

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
        <Route path="recepcion" element={<Recepcion />} />
        <Route path="paquetes" element={<Paquetes />} />
        <Route path="autorizaciones" element={<Autorizaciones />} />
        {/* <Route path="medicion" element={<Medicion />} /> */}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
