const { poolPromise } = require('../config/db');
const { executeSemantic } = require('../automatas/semantic');
const { interpretarMedicion, registrarOperacion } = require('./bodegaService');

// Siguiente identificador libre: P001, P002… Si el operador ya usó un número alto (los ids se pueden
// editar en Recepción) y se llega a P999, se toma el primer número que quede libre.
async function siguienteId() {
    const pool = await poolPromise;
    const result = await pool.request().query(`
        SELECT CAST(SUBSTRING(id, 2, 3) AS INT) AS numero
        FROM Paquetes
        WHERE id LIKE 'P[0-9][0-9][0-9]'`);
    const usados = new Set(result.recordset.map((fila) => fila.numero));
    let siguiente = Math.max(0, ...usados) + 1;
    if (siguiente > 999) {
        siguiente = 1;
        while (usados.has(siguiente)) siguiente += 1;
    }
    if (siguiente > 999) throw new Error('Se agotaron los identificadores de paquete (P001-P999).');
    return `P${String(siguiente).padStart(3, '0')}`;
}

// Valores aceptados para "fragile": booleano o 1/0 (algunos firmwares envían números)
const FRAGIL_VALIDO = [true, false, 1, 0];

// Registra el paquete que detectó la estación de recepción: la placa indica si es frágil y los sensores IR el tamaño.
// Queda REGISTRADO y aparece en la tabla de Recepción hasta que el operador lo almacena o lo cancela.
async function recibirPaquete(lectura = {}) {
    // Sin el dato de la placa no se adivina el tipo: un frágil podría terminar en A1 o A2
    if (!FRAGIL_VALIDO.includes(lectura.fragile)) {
        const detalle = 'El ESP32 no indicó si el paquete es frágil; no se registró.';
        await registrarOperacion({ instruccion: 'PAQUETE_DETECTADO', resultado: 'RECHAZADA', detalle, origen: 'ESP32' });
        throw new Error(detalle);
    }

    const tipo = lectura.fragile ? 'FRAGIL' : 'NORMAL';
    const { tamano } = interpretarMedicion(lectura);
    const id = await siguienteId();
    const instruccion = `REGISTRAR(${tipo},${id},${tamano})`;

    try {
        const { message } = await executeSemantic({ action: 'REGISTRAR', params: { tipo, id, tamano } });
        await registrarOperacion({ instruccion, resultado: 'ACEPTADA', detalle: message, origen: 'ESP32' });
    } catch (err) {
        await registrarOperacion({ instruccion, resultado: 'RECHAZADA', detalle: err.message, origen: 'ESP32' });
        throw err;
    }
    return { id, tipo, tamano };
}

module.exports = { recibirPaquete };
