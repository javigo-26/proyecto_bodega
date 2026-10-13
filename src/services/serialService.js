const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { poolPromise, sql } = require('../config/db');
require('dotenv').config();

/*
 * Protocolo Serial (un JSON por línea, 115200 baudios)
 *
 * Backend → ESP32
 *   {"type":"EVENT","space":"A1","state":"AVAILABLE|PARTIAL|OCCUPIED|ALARM"}   LED verde / amarillo / rojo / alarma
 *   {"type":"COMMAND","action":"CONFIRM_STORAGE","space":"A1","package":"P001"}
 *   {"type":"COMMAND","action":"AUTHORIZE_WITHDRAWAL","space":"A1","package":"P001","seconds":60}
 *   {"type":"COMMAND","action":"CONFIRM_WITHDRAWAL","space":"A1","package":"P001"}
 *   {"type":"COMMAND","action":"CLEAR_ALARM"}
 *   {"type":"COMMAND","action":"MEASURE","package":"P001"}
 *
 * ESP32 → Backend
 *   {"type":"ALARM","space":"A1","reason":"UNAUTHORIZED_REMOVAL"}
 *   {"type":"MEASUREMENT","size":"MEDIANO","sensors":{"HS":1,"HM":0,"WS":1,"WM":0,"DS":0,"DM":0}}
 *   {"type":"ERROR","message":"..."}
 */

const TIEMPO_MEDICION_MS = 5000; // Espera máxima de la respuesta del ESP32 al medir

let port = null;
let medicionPendiente = null; // { resolve, reject, temporizador } de la medición en curso

// Crea un error con el código HTTP que debe responder la API
const crearError = (status, mensaje) => Object.assign(new Error(mensaje), { status });

// Termina la medición en curso con la lectura o con el error recibido
function terminarMedicion(error, lectura) {
    if (!medicionPendiente) return;
    const { resolve, reject, temporizador } = medicionPendiente;
    clearTimeout(temporizador);
    medicionPendiente = null;
    if (error) reject(error);
    else resolve(lectura);
}

try {
    port = new SerialPort({
        path: process.env.SERIAL_PORT || 'COM3',
        baudRate: parseInt(process.env.SERIAL_BAUD_RATE) || 115200,
        autoOpen: true
    });

    const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

    port.on('open', () => {
        console.log(`✔ Puerto Serial ${process.env.SERIAL_PORT} conectado a 115200 baudios`);
    });

    // AQUÍ VA LA PARTE 4 ACTUALIZADA
    parser.on('data', async (line) => {
        try {
            const rawMessage = line.trim();
            if (!rawMessage) return;

            console.log('📥 Mensaje desde ESP32:', rawMessage);
            const data = JSON.parse(rawMessage);

            if (data.type === 'ALARM') {
                console.warn(`🚨 ¡ALARMA DETECTADA EN ESPACIO ${data.space}!`);
                const pool = await poolPromise;

                // Cambiar estado_id = 4 ('ALARMA') en la BD
                await pool.request()
                    .input('codigo', sql.VarChar(5), data.space)
                    .query("UPDATE Espacios SET estado_id = 4 WHERE codigo = @codigo");

                // Registrar evento de seguridad
                await pool.request()
                    .input('espacio_codigo', sql.VarChar(5), data.space)
                    .input('tipo_evento', sql.VarChar(30), 'UNAUTHORIZED_REMOVAL')
                    .input('descripcion', sql.Text, `Retiro no autorizado detectado en ${data.space}`)
                    .query(`
                        INSERT INTO EventosSeguridad (espacio_codigo, tipo_evento, descripcion)
                        VALUES (@espacio_codigo, @tipo_evento, @descripcion)
                    `);
            }

            // Respuesta a la solicitud de medición
            if (data.type === 'MEASUREMENT') terminarMedicion(null, data);
            if (data.type === 'ERROR') terminarMedicion(crearError(502, `El ESP32 reportó un error: ${data.message}`));
        } catch (err) {
            console.error('⚠️ Error procesando mensaje Serial:', err.message);
        }
    });

    port.on('error', (err) => {
        console.error('❌ Error en el Puerto Serial:', err.message);
    });

} catch (err) {
    console.warn('⚠️ Modo sin ESP32 activo (puerto serial no detectado localmente).');
}

function sendCommand(commandObj) {
    if (port && port.isOpen) {
        const payload = JSON.stringify(commandObj) + '\n';
        port.write(payload);
    } else {
        console.log('📤 [Simulación Serial] Comando:', commandObj);
    }
}

// Pide al ESP32 leer los 6 sensores de la estación y espera su respuesta MEASUREMENT
function solicitarMedicion(paqueteId) {
    if (!port || !port.isOpen) {
        return Promise.reject(crearError(503, 'El ESP32 no está conectado. Conéctalo por USB para medir paquetes.'));
    }
    if (medicionPendiente) {
        return Promise.reject(crearError(409, 'Ya hay una medición en curso. Espera unos segundos.'));
    }

    return new Promise((resolve, reject) => {
        const temporizador = setTimeout(
            () => terminarMedicion(crearError(504, 'El ESP32 no respondió la medición a tiempo.')),
            TIEMPO_MEDICION_MS
        );
        medicionPendiente = { resolve, reject, temporizador };
        sendCommand({ type: 'COMMAND', action: 'MEASURE', package: paqueteId });
    });
}

module.exports = { sendCommand, solicitarMedicion };
