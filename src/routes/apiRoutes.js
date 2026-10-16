const express = require('express');
const router = express.Router();
const bodegaController = require('../controllers/bodegaController');
const automatasController = require('../controllers/automatasController');
const authController = require('../controllers/authController');

// Ruta de Login para el Frontend
router.post('/login', authController.login);

// Rutas de Bodega y Alarmas
router.get('/espacios', bodegaController.getEspacios);
router.post('/alarmas/apagar', bodegaController.apagarAlarma);

// Rutas de Paquetes (solo activos, eliminado lógico) y de la estación de medición
router.get('/paquetes', bodegaController.getPaquetes);
router.patch('/paquetes/:id', bodegaController.actualizarPaquete); // editar id y descripción en Recepción
router.delete('/paquetes/:id', bodegaController.eliminarPaquete);
router.post('/medicion', bodegaController.medirPaquete);

// Bitácora de todas las operaciones (filtro opcional por fecha)
router.get('/operaciones', bodegaController.getOperaciones);

// Ruta para la consola del Lenguaje Formal (Autómatas)[cite: 12]
router.post('/lenguaje/ejecutar', automatasController.processCommand);

module.exports = router;