// Cliente de la API del backend (Node/Express). Todas las peticiones pasan por aquí.

// En desarrollo Vite redirige /api al backend (ver vite.config.js)
const API_URL = import.meta.env.VITE_API_URL ?? '/api';
const SIN_CONEXION = 'No se pudo conectar con el servidor. Verifica que el backend esté encendido.';

// Realiza la petición y convierte las respuestas de error en mensajes legibles
async function request(ruta, { method = 'GET', body } = {}) {
  let respuesta;
  try {
    respuesta = await fetch(`${API_URL}${ruta}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(SIN_CONEXION);
  }

  const datos = await respuesta.json().catch(() => null);
  if (respuesta.ok) return datos;

  if (!datos && respuesta.status === 404) {
    throw new Error(`El backend aún no tiene la ruta ${method} ${API_URL}${ruta}.`);
  }
  if (!datos && respuesta.status >= 500) throw new Error(SIN_CONEXION);
  throw new Error(datos?.error ?? datos?.message ?? `Error ${respuesta.status} del servidor.`);
}

// Valida usuario y contraseña
export const login = (username, password) =>
  request('/login', { method: 'POST', body: { username, password } });

// Lista los casilleros con su estado, tamaño fijado y ocupación
export const getEspacios = () => request('/espacios');

// Apaga la alarma activa y avisa al ESP32
export const apagarAlarma = () => request('/alarmas/apagar', { method: 'POST' });

// Ejecuta una instrucción del lenguaje formal: ejecutarComando('ASIGNAR', 'P001') → ASIGNAR(P001)
export const ejecutarComando = (nombre, ...args) =>
  request('/lenguaje/ejecutar', {
    method: 'POST',
    body: { command: `${nombre}(${args.join(',')})` },
  });

// Paquetes activos: [{ id, tipo, tamano, estado, espacio_codigo, fecha_registro, fecha_ingreso }]
export const getPaquetes = () => request('/paquetes');

// Eliminado lógico: marca el paquete como inactivo sin borrarlo de la base de datos
export const eliminarPaquete = (id) =>
  request(`/paquetes/${encodeURIComponent(id)}`, { method: 'DELETE' });

// Pide al ESP32 medir el paquete: { tamano, sensores: { HS, HM, WS, WM, DS, DM } }
export const medirPaquete = (paqueteId) =>
  request('/medicion', { method: 'POST', body: { paquete_id: paqueteId } });
