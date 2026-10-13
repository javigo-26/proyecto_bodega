const { poolPromise, sql } = require('../config/db');
const { sendCommand } = require('./serialService');

// Reglas de negocio compartidas por la API REST y el lenguaje formal

const VENTANA_RETIRO_SEGUNDOS = 60; // Duración de la autorización de retiro (informe: 30-60 s)
const TAMANOS = ['PEQUENO', 'MEDIANO', 'GRANDE'];
const SENSORES = ['HS', 'HM', 'WS', 'WM', 'DS', 'DM'];

// LED que debe encender el ESP32 según el estado del espacio
const LED_POR_ESTADO = { 1: 'AVAILABLE', 2: 'PARTIAL', 3: 'OCCUPIED', 4: 'ALARM' };

// Estado por ocupación: vacío → DISPONIBLE (verde), con cupo → PARCIAL (amarillo), lleno → OCUPADO (rojo)
const ESTADO_POR_OCUPACION = `
    CASE WHEN ocupacion_actual = 0 THEN 1
         WHEN ocupacion_actual < capacidad_max THEN 2
         ELSE 3 END`;

// Paquetes con su estado y el casillero donde están guardados actualmente
const CONSULTA_PAQUETES = `
    SELECT P.id, P.tipo, P.tamano, P.estado_id, Est.nombre AS estado, P.activo,
           P.fecha_registro, A.espacio_codigo, A.fecha_ingreso
    FROM Paquetes P
    INNER JOIN Estados Est ON P.estado_id = Est.id
    OUTER APPLY (
        SELECT TOP 1 espacio_codigo, fecha_ingreso
        FROM Almacenamiento
        WHERE paquete_id = P.id AND fecha_salida IS NULL
        ORDER BY id DESC
    ) A`;

// Busca un paquete por id (null si no existe)
async function obtenerPaquete(id) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('id', sql.VarChar(10), id)
        .query(`${CONSULTA_PAQUETES} WHERE P.id = @id`);
    return result.recordset[0] ?? null;
}

// Paquetes activos (no eliminados) que ocupan un casillero: ASIGNADO, ALMACENADO o RETIRO_AUTORIZADO
async function listarPaquetesActivos() {
    const pool = await poolPromise;
    const result = await pool.request().query(`
        ${CONSULTA_PAQUETES}
        WHERE P.activo = 1 AND P.estado_id IN (6, 7, 8)
        ORDER BY A.fecha_ingreso DESC`);
    return result.recordset;
}

// Ejecuta varias consultas como una sola operación: se guardan todas o ninguna
async function enTransaccion(trabajo) {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        const resultado = await trabajo(transaction);
        await transaction.commit();
        return resultado;
    } catch (err) {
        await transaction.rollback().catch(() => {});
        throw err;
    }
}

// Devuelve a ALMACENADO los paquetes cuya ventana de retiro ya venció
async function expirarAutorizaciones() {
    const pool = await poolPromise;
    await pool.request().query(`
        UPDATE P SET estado_id = 7
        FROM Paquetes P
        WHERE P.estado_id = 8 AND NOT EXISTS (
            SELECT 1 FROM AutorizacionesRetiro AR
            WHERE AR.paquete_id = P.id AND AR.estado_id = 8 AND AR.expiracion > GETDATE()
        )`);
}

// Descuenta un paquete del espacio; vacío vuelve a aceptar cualquier tamaño. La alarma se mantiene.
async function liberarCupo(transaction, codigo) {
    await new sql.Request(transaction)
        .input('codigo', sql.VarChar(5), codigo)
        .query(`
            UPDATE Espacios SET
                ocupacion_actual = ocupacion_actual - 1,
                modo_tamano = CASE WHEN ocupacion_actual = 1 THEN NULL ELSE modo_tamano END,
                capacidad_max = CASE WHEN ocupacion_actual = 1 THEN 3 ELSE capacidad_max END,
                estado_id = CASE WHEN estado_id = 4 THEN 4 WHEN ocupacion_actual = 1 THEN 1 ELSE 2 END
            WHERE codigo = @codigo AND ocupacion_actual > 0`);
}

// Avisa al ESP32 qué LED encender en el espacio (verde, amarillo, rojo o alarma)
async function enviarEstadoEspacio(codigo) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('codigo', sql.VarChar(5), codigo)
        .query('SELECT estado_id FROM Espacios WHERE codigo = @codigo');
    const estadoId = result.recordset[0]?.estado_id;
    if (estadoId) sendCommand({ type: 'EVENT', space: codigo, state: LED_POR_ESTADO[estadoId] });
}

// Apaga las alarmas y devuelve cada espacio al estado que le corresponde por su ocupación
async function apagarAlarmas() {
    const pool = await poolPromise;
    const result = await pool.request().query(`
        UPDATE Espacios SET estado_id = ${ESTADO_POR_OCUPACION}
        OUTPUT inserted.codigo, inserted.estado_id
        WHERE estado_id = 4`);

    sendCommand({ type: 'COMMAND', action: 'CLEAR_ALARM' });
    result.recordset.forEach(({ codigo, estado_id }) =>
        sendCommand({ type: 'EVENT', space: codigo, state: LED_POR_ESTADO[estado_id] }));

    return result.recordset.map((espacio) => espacio.codigo);
}

// Convierte la lectura del ESP32 en { tamano, sensores }; si no trae tamaño lo clasifica con la regla del informe
function interpretarMedicion(lectura = {}) {
    const sensores = lectura.sensors
        ? Object.fromEntries(SENSORES.map((nombre) => [nombre, Boolean(lectura.sensors[nombre])]))
        : {};

    let tamano = 'PEQUENO';
    if (sensores.HM || sensores.WM || sensores.DM) tamano = 'GRANDE';
    else if (sensores.HS || sensores.WS || sensores.DS) tamano = 'MEDIANO';

    return { tamano: TAMANOS.includes(lectura.size) ? lectura.size : tamano, sensores };
}

module.exports = {
    VENTANA_RETIRO_SEGUNDOS,
    apagarAlarmas,
    enTransaccion,
    enviarEstadoEspacio,
    expirarAutorizaciones,
    interpretarMedicion,
    liberarCupo,
    listarPaquetesActivos,
    obtenerPaquete
};
