const { poolPromise } = require('../config/db');
const { sendCommand } = require('../services/serialService');

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

// Apagar la alarma: cambia estado_id de 4 (ALARMA) a 1 (DISPONIBLE)[cite: 4, 11]
exports.apagarAlarma = async (req, res) => {
    try {
        const pool = await poolPromise;
        
        await pool.request().query("UPDATE Espacios SET estado_id = 1 WHERE estado_id = 4");
        
        // Enviar orden de apagado de alarma física al ESP32 por USB/Serial[cite: 3, 4]
        sendCommand({ type: 'COMMAND', action: 'CLEAR_ALARM' });

        res.json({ success: true, message: 'Alarma apagada exitosamente.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};