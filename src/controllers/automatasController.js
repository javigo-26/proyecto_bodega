const { tokenize } = require('../automatas/lexer');
const { parse } = require('../automatas/parser');
const { executeSemantic } = require('../automatas/semantic');
const { registrarOperacion } = require('../services/bodegaService');

exports.processCommand = async (req, res) => {
    const { command } = req.body;

    try {
        const tokens = tokenize(command);
        const ast = parse(tokens);
        const result = await executeSemantic(ast);

        // CONSULTAR solo lee; las demás instrucciones quedan en la bitácora
        if (ast.action !== 'CONSULTAR') {
            await registrarOperacion({ instruccion: command, resultado: 'ACEPTADA', detalle: result.message });
        }
        res.json({ success: true, command, tokens, ast, result });
    } catch (err) {
        await registrarOperacion({ instruccion: command, resultado: 'RECHAZADA', detalle: err.message });
        res.status(400).json({ success: false, command, error: err.message });
    }
};
