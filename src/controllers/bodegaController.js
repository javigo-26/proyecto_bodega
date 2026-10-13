const { poolPromise, sql } = require('../config/db');
const { solicitarMedicion } = require('../services/serialService');
const {
    apagarAlarmas,
    enTransaccion,
    enviarEstadoEspacio,
    expirarAutorizaciones,
    interpretarMedicion,
    liberarCupo,
    listarPaquetesActivos,
    obtenerPaquete
} = require('../services/bodegaService');

const PATRON_ID = /^P\d{3}$/; // Mismo formato de identificador que el analizador léxico

// Obtener el estado de las 6 celdas con el nombre textual del estado
exports.getEspacios = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT
                E.codigo,
                E.tipo,
                E.estado_id,
                Est.nombre AS estado,
                E.modo_tamano,
                E.capacidad_max,
                E.ocupacion_actual
            FROM Espacios E
            INNER JOIN Estados Est ON E.estado_id = Est.id
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Apagar la alarma: cada celda vuelve al estado que le corresponde por su ocupación[cite: 4, 11]
exports.apagarAlarma = async (req, res) => {
    try {
        // También envía la orden de apagado de alarma física al ESP32 por USB/Serial[cite: 3, 4]
        const espacios = await apagarAlarmas();
        const message = espacios.length ? `Alarma apagada en ${espacios.join(', ')}.` : 'No había alarmas activas.';
        res.json({ success: true, message });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Listar los paquetes activos (no eliminados) que están en un casillero
exports.getPaquetes = async (req, res) => {
    try {
        await expirarAutorizaciones();
        res.json(await listarPaquetesActivos());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Eliminado lógico: el paquete queda inactivo y, si ocupaba un casillero, libera su lugar
exports.eliminarPaquete = async (req, res) => {
    const { id } = req.params;
    try {
        const paquete = await obtenerPaquete(id);
        if (!paquete || !paquete.activo) {
            return res.status(404).json({ error: `El paquete ${id} no existe o ya fue eliminado.` });
        }

        const espacio = paquete.espacio_codigo;
        await enTransaccion(async (transaction) => {
            await new sql.Request(transaction)
                .input('id', sql.VarChar(10), id)
                .query(`
                    UPDATE Paquetes SET activo = 0 WHERE id = @id;
                    UPDATE Almacenamiento SET fecha_salida = GETDATE() WHERE paquete_id = @id AND fecha_salida IS NULL;
                `);
            if (espacio) await liberarCupo(transaction, espacio);
        });

        if (espacio) await enviarEstadoEspacio(espacio);
        const detalle = espacio ? ` y se liberó su lugar en ${espacio}` : '';
        res.json({ success: true, message: `Paquete ${id} eliminado${detalle}.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Medir un paquete en la estación IR del ESP32 antes de registrarlo
exports.medirPaquete = async (req, res) => {
    const id = req.body?.paquete_id;
    if (!PATRON_ID.test(id ?? '')) {
        return res.status(400).json({ error: 'Identificador inválido. Formato: P seguido de 3 dígitos (P001).' });
    }

    try {
        if (await obtenerPaquete(id)) {
            return res.status(409).json({ error: `El paquete ${id} ya está registrado; no es necesario medirlo de nuevo.` });
        }
        const lectura = await solicitarMedicion(id);
        res.json({ paquete_id: id, ...interpretarMedicion(lectura) });
    } catch (err) {
        res.status(err.status ?? 500).json({ error: err.message });
    }
};
