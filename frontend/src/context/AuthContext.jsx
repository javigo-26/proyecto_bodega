import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { login } from '../services/api.js';

const AuthContext = createContext(null);
const CLAVE = 'bodega-sesion';

// Recupera la sesión guardada en la pestaña (si existe)
function sesionGuardada() {
  try {
    return JSON.parse(sessionStorage.getItem(CLAVE)) ?? null;
  } catch {
    return null;
  }
}

// Provee el usuario autenticado y las acciones de iniciar/cerrar sesión
export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(sesionGuardada);

  // Valida las credenciales en el backend y guarda la sesión
  const iniciarSesion = useCallback(async (username, password) => {
    const respuesta = await login(username, password);
    const sesion = { ...respuesta.usuario, inicio: new Date().toISOString() };
    try {
      sessionStorage.setItem(CLAVE, JSON.stringify(sesion));
    } catch {
      // sin almacenamiento la sesión dura hasta recargar la página
    }
    setUsuario(sesion);
    return sesion;
  }, []);

  // Cierra la sesión actual
  const cerrarSesion = useCallback(() => {
    try {
      sessionStorage.removeItem(CLAVE);
    } catch {
      // nada que limpiar
    }
    setUsuario(null);
  }, []);

  const valor = useMemo(() => ({ usuario, iniciarSesion, cerrarSesion }), [usuario, iniciarSesion, cerrarSesion]);
  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

// Hook para acceder a la sesión
export function useAuth() {
  const contexto = useContext(AuthContext);
  if (!contexto) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return contexto;
}
