const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

const poolPromise = new sql.ConnectionPool(config)
    .connect()
    .then(pool => {
        console.log('✔ Conectado a la Base de Datos SQL Server');
        return pool;
    })
    .catch(err => {
        console.error('❌ Error al conectar a la BD:', err);
    });

module.exports = { sql, poolPromise };