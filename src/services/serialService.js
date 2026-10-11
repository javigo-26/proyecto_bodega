const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { poolPromise, sql } = require('../config/db');
require('dotenv').config();

let port = null;

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

module.exports = { sendCommand };