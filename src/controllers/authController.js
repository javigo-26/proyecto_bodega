const { poolPromise, sql } = require('../config/db');

exports.login = async (req, res) => {
    const { username, password } = req.body;

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('username', sql.VarChar(50), username)
            .input('password', sql.VarChar(255), password)
            .query(`
                SELECT id, username, nombre_completo 
                FROM Usuarios 
                WHERE username = @username AND password = @password
            `);

        if (result.recordset.length === 0) {
            return res.status(401).json({ 
                success: false, 
                message: 'Usuario o contraseña incorrectos' 
            });
        }

        res.json({
            success: true,
            message: 'Autenticación exitosa',
            usuario: result.recordset[0]
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};