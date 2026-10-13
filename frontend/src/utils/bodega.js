// Reglas y utilidades de la bodega (las mismas del informe del proyecto)

// Capacidad de un cajón según el tamaño que almacena: 3 pequeños, 2 medianos o 1 grande
export const CAPACIDAD = { PEQUENO: 3, MEDIANO: 2, GRANDE: 1 };

export const TAMANOS = ['PEQUENO', 'MEDIANO', 'GRANDE'];
export const TIPOS = ['NORMAL', 'FRAGIL'];

// Posición física de los casilleros en el mueble (3 columnas × 2 filas)
export const ORDEN_CASILLEROS = ['A1', 'A2', 'A3', 'A4', 'F1', 'F2'];

// Estados de paquete que cuentan como registro activo (ocupa un casillero)
export const ESTADOS_ACTIVOS = ['ASIGNADO', 'ALMACENADO', 'RETIRO_AUTORIZADO'];

// Formato del identificador de paquete (igual que en el analizador léxico)
export const PATRON_ID = /^P\d{3}$/;

// Duración de la ventana de retiro autorizado (el informe sugiere 30-60 s)
export const VENTANA_RETIRO_MS = 60_000;

// Catálogo de la tabla Estados (id → nombre)
const ESTADOS_POR_ID = {
  1: 'DISPONIBLE',
  2: 'PARCIAL',
  3: 'OCUPADO',
  4: 'ALARMA',
  5: 'REGISTRADO',
  6: 'ASIGNADO',
  7: 'ALMACENADO',
  8: 'RETIRO_AUTORIZADO',
  9: 'RETIRADO',
};

const ETIQUETAS = {
  PEQUENO: 'Pequeño',
  MEDIANO: 'Mediano',
  GRANDE: 'Grande',
  NORMAL: 'Normal',
  FRAGIL: 'Frágil',
  DISPONIBLE: 'Disponible',
  PARCIAL: 'Parcial',
  OCUPADO: 'Ocupado',
  LLENO: 'Lleno',
  ALARMA: 'Alarma',
  REGISTRADO: 'Registrado',
  ASIGNADO: 'Asignado',
  ALMACENADO: 'Almacenado',
  RETIRO_AUTORIZADO: 'Retiro autorizado',
  RETIRADO: 'Retirado',
};

// Devuelve el texto legible de un valor del sistema
export const etiqueta = (valor) => ETIQUETAS[valor] ?? valor ?? '—';

// Indica si el casillero tiene la alarma activa
export const enAlarma = (espacio) => espacio.estado === 'ALARMA';

// Completa el nombre del estado de un casillero a partir de su id
export const normalizarEspacio = (espacio) => ({
  ...espacio,
  estado: espacio.estado ?? ESTADOS_POR_ID[espacio.estado_id],
});

// Completa el nombre del estado de un paquete a partir de su id
export const normalizarPaquete = (paquete) => ({
  ...paquete,
  estado: paquete.estado ?? ESTADOS_POR_ID[paquete.estado_id],
});

// Registro activo: no eliminado lógicamente y guardado en un casillero
export const esActivo = (paquete) =>
  paquete.activo !== false && paquete.activo !== 0 && ESTADOS_ACTIVOS.includes(paquete.estado);

// Capacidad del casillero según el tamaño fijado (null si está vacío)
export function capacidadActual(espacio) {
  if (!espacio.ocupacion_actual) return null;
  return CAPACIDAD[espacio.modo_tamano] ?? espacio.capacidad_max;
}

// Nivel que define el LED: DISPONIBLE (vacío), PARCIAL (tiene paquetes y aún acepta), LLENO o ALARMA
export function nivelEspacio(espacio) {
  if (enAlarma(espacio)) return 'ALARMA';
  const capacidad = capacidadActual(espacio);
  if (capacidad === null) return 'DISPONIBLE';
  return espacio.ocupacion_actual < capacidad ? 'PARCIAL' : 'LLENO';
}

// Cuántos paquetes más de un tamaño acepta el casillero (no se mezclan tamaños)
export function cuposLibres(espacio, tamano) {
  if (enAlarma(espacio)) return 0;
  if (!espacio.ocupacion_actual) return CAPACIDAD[tamano];
  if (espacio.modo_tamano !== tamano) return 0;
  return Math.max(CAPACIDAD[tamano] - espacio.ocupacion_actual, 0);
}

// Indica si el casillero puede recibir al menos un paquete más
export const tieneCupo = (espacio) => TAMANOS.some((tamano) => cuposLibres(espacio, tamano) > 0);

// Resume los cupos libres por tamaño, separados en casilleros normales y frágiles
export function disponibilidadPorTamano(espacios) {
  return TAMANOS.map((tamano) => {
    const fila = { tamano, capacidad: CAPACIDAD[tamano], NORMAL: 0, FRAGIL: 0 };
    espacios.forEach((espacio) => {
      if (espacio.tipo in fila) fila[espacio.tipo] += cuposLibres(espacio, tamano);
    });
    return fila;
  });
}

// Clasifica con los 6 sensores IR: supera M en un eje → GRANDE; supera S → MEDIANO; si no → PEQUENO
export function clasificarPorSensores(sensores = {}) {
  if (sensores.HM || sensores.WM || sensores.DM) return 'GRANDE';
  if (sensores.HS || sensores.WS || sensores.DS) return 'MEDIANO';
  return 'PEQUENO';
}

// Obtiene las iniciales del nombre para el avatar
export function iniciales(nombre = '') {
  const letras = nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0].toUpperCase())
    .join('');
  return letras || '?';
}

// Formatea fechas de SQL Server; mssql las entrega como UTC, por eso se muestran en UTC
export function formatearFecha(valor) {
  if (!valor) return '—';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '—';
  return fecha.toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' });
}

// Formatea una hora del navegador (hora local)
export const formatearHora = (fecha) =>
  fecha ? new Date(fecha).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
