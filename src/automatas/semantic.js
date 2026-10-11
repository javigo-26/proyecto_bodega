const { poolPromise, sql } = require('../config/db');
const { sendCommand } = require('../services/serialService');

async function executeSemantic(ast) {
    const pool = await poolPromise;
    const { action, params } = ast;

    switch (action) {
        case 'REGISTRAR': {
            // Verificar si el paquete ya existe[cite: 15, 20]
            const check = await pool.request()
                .input('id', sql.VarChar(10), params.id)
                .query('SELECT id FROM Paquetes WHERE id = @id');

            if (check.recordset.length > 0) {
                throw new Error(`Error Semántico: El paquete ${params.id} ya se encuentra registrado.`);
            }

            // Insertar con estado_id = 5 ('REGISTRADO')[cite: 15, 20]
            await pool.request()
                .input('id', sql.VarChar(10), params.id)
                .input('tipo', sql.VarChar(10), params.tipo)
                .input('tamano', sql.VarChar(10), params.tamano)
                .query("INSERT INTO Paquetes (id, tipo, tamano, estado_id) VALUES (@id, @tipo, @tamano, 5)");

            return { message: `Paquete ${params.id} registrado correctamente como ${params.tipo} / ${params.tamano}.` };
        }

        case 'ASIGNAR': {
            const pkg = await pool.request()
                .input('id', sql.VarChar(10), params.id)
                .query('SELECT * FROM Paquetes WHERE id = @id');

            if (pkg.recordset.length === 0) {
                throw new Error(`Error Semántico: El paquete ${params.id} no existe.`);
            }

            // Ejecutar el Stored Procedure
            const result = await pool.request()
                .input('paquete_id', sql.VarChar(10), params.id)
                .input('tipo', sql.VarChar(10), pkg.recordset[0].tipo)
                .input('tamano', sql.VarChar(10), pkg.recordset[0].tamano)
                .execute('sp_AsignarPaqueteBodega');

            const asignacion = result.recordset[0];
            return { message: `Paquete ${params.id} asignado al espacio ${asignacion.espacio_asignado}.` };
        }

        case 'APAGAR_ALARMA': {
            await pool.request().query("UPDATE Espacios SET estado_id = 1 WHERE estado_id = 4");
            
            sendCommand({ type: 'COMMAND', action: 'CLEAR_ALARM' });

            return { message: 'Alarma desactivada correctamente.' };
        }

        case 'CONSULTAR': {
            const espacios = await pool.request().query(`
                SELECT E.codigo, E.tipo, Est.nombre AS estado, E.modo_tamano, E.ocupacion_actual, E.capacidad_max 
                FROM Espacios E
                INNER JOIN Estados Est ON E.estado_id = Est.id
            `);
            return { data: espacios.recordset };
        }

        default:
            return { message: `Comando ${action} procesado.` };
    }
}

module.exports = { executeSemantic };