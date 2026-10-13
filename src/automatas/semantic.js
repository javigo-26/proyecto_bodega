const { poolPromise, sql } = require('../config/db');
const { sendCommand } = require('../services/serialService');
const {
    VENTANA_RETIRO_SEGUNDOS,
    apagarAlarmas,
    enTransaccion,
    enviarEstadoEspacio,
    expirarAutorizaciones,
    liberarCupo,
    obtenerPaquete
} = require('../services/bodegaService');

// Busca un paquete que exista y no esté eliminado; si no, lanza el error semántico
async function paqueteActivo(id) {
    const paquete = await obtenerPaquete(id);
    if (!paquete) throw new Error(`Error Semántico: El paquete ${id} no existe.`);
    if (!paquete.activo) throw new Error(`Error Semántico: El paquete ${id} fue eliminado.`);
    return paquete;
}

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
            const paquete = await paqueteActivo(params.id);

            // Solo se asigna un paquete REGISTRADO (evita ocupar dos casilleros con el mismo paquete)
            if (paquete.estado_id !== 5) {
                const lugar = paquete.espacio_codigo ? ` en el espacio ${paquete.espacio_codigo}` : '';
                throw new Error(`Error Semántico: El paquete ${params.id} ya no se puede asignar: está ${paquete.estado}${lugar}.`);
            }

            // Ejecutar el Stored Procedure
            const result = await pool.request()
                .input('paquete_id', sql.VarChar(10), params.id)
                .input('tipo', sql.VarChar(10), paquete.tipo)
                .input('tamano', sql.VarChar(10), paquete.tamano)
                .execute('sp_AsignarPaqueteBodega');

            const asignacion = result.recordset[0];
            await enviarEstadoEspacio(asignacion.espacio_asignado);
            return { message: `Paquete ${params.id} asignado al espacio ${asignacion.espacio_asignado}.` };
        }

        case 'ALMACENAR': {
            const paquete = await paqueteActivo(params.id);

            // Confirma que el paquete asignado ya quedó guardado físicamente
            if (paquete.estado_id !== 6) {
                throw new Error(`Error Semántico: El paquete ${params.id} debe estar ASIGNADO para almacenarlo (estado actual: ${paquete.estado}).`);
            }

            await enTransaccion(async (transaction) => {
                await new sql.Request(transaction)
                    .input('id', sql.VarChar(10), params.id)
                    .query(`
                        UPDATE Paquetes SET estado_id = 7 WHERE id = @id;
                        UPDATE Almacenamiento SET fecha_ingreso = GETDATE() WHERE paquete_id = @id AND fecha_salida IS NULL;
                    `);
            });

            sendCommand({ type: 'COMMAND', action: 'CONFIRM_STORAGE', space: paquete.espacio_codigo, package: params.id });
            return { message: `Paquete ${params.id} almacenado en el espacio ${paquete.espacio_codigo}.` };
        }

        case 'AUTORIZAR_RETIRO': {
            await expirarAutorizaciones();
            const paquete = await paqueteActivo(params.id);

            // Solo se retira un paquete guardado; si ya estaba autorizado se renueva la ventana
            if (paquete.estado_id !== 7 && paquete.estado_id !== 8) {
                throw new Error(`Error Semántico: Solo se puede autorizar el retiro de un paquete ALMACENADO (estado actual: ${paquete.estado}).`);
            }

            await enTransaccion(async (transaction) => {
                await new sql.Request(transaction)
                    .input('id', sql.VarChar(10), params.id)
                    .input('espacio', sql.VarChar(5), paquete.espacio_codigo)
                    .input('segundos', sql.Int, VENTANA_RETIRO_SEGUNDOS)
                    .query(`
                        INSERT INTO AutorizacionesRetiro (paquete_id, espacio_codigo, expiracion)
                        VALUES (@id, @espacio, DATEADD(SECOND, @segundos, GETDATE()));
                        UPDATE Paquetes SET estado_id = 8 WHERE id = @id;
                    `);
            });

            sendCommand({
                type: 'COMMAND',
                action: 'AUTHORIZE_WITHDRAWAL',
                space: paquete.espacio_codigo,
                package: params.id,
                seconds: VENTANA_RETIRO_SEGUNDOS
            });
            return { message: `Retiro de ${params.id} autorizado en el espacio ${paquete.espacio_codigo} por ${VENTANA_RETIRO_SEGUNDOS} segundos.` };
        }

        case 'RETIRAR': {
            await expirarAutorizaciones();
            const paquete = await paqueteActivo(params.id);

            // Requiere una autorización vigente (las vencidas ya regresaron a ALMACENADO)
            if (paquete.estado_id === 7) {
                throw new Error(`Error Semántico: El paquete ${params.id} no tiene una autorización de retiro vigente. Ejecuta AUTORIZAR_RETIRO(${params.id}) primero.`);
            }
            if (paquete.estado_id !== 8) {
                throw new Error(`Error Semántico: El paquete ${params.id} no está almacenado (estado actual: ${paquete.estado}).`);
            }

            await enTransaccion(async (transaction) => {
                await new sql.Request(transaction)
                    .input('id', sql.VarChar(10), params.id)
                    .query(`
                        UPDATE Paquetes SET estado_id = 9 WHERE id = @id;
                        UPDATE AutorizacionesRetiro SET estado_id = 9 WHERE paquete_id = @id AND estado_id = 8;
                        UPDATE Almacenamiento SET fecha_salida = GETDATE() WHERE paquete_id = @id AND fecha_salida IS NULL;
                    `);
                await liberarCupo(transaction, paquete.espacio_codigo);
            });

            sendCommand({ type: 'COMMAND', action: 'CONFIRM_WITHDRAWAL', space: paquete.espacio_codigo, package: params.id });
            await enviarEstadoEspacio(paquete.espacio_codigo);
            return { message: `Paquete ${params.id} retirado; se liberó su lugar en el espacio ${paquete.espacio_codigo}.` };
        }

        case 'APAGAR_ALARMA': {
            // Cada espacio vuelve a su estado real (disponible, parcial u ocupado)
            const espacios = await apagarAlarmas();
            if (espacios.length === 0) return { message: 'No había alarmas activas.' };
            return { message: `Alarma desactivada en ${espacios.join(', ')}.` };
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
