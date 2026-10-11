const { tokenize } = require('../automatas/lexer');
const { parse } = require('../automatas/parser');
const { executeSemantic } = require('../automatas/semantic');

exports.processCommand = async (req, res) => {
    const { command } = req.body;

    try {
        const tokens = tokenize(command);
        const ast = parse(tokens);
        const result = await executeSemantic(ast);

        res.json({ success: true, command, tokens, ast, result });
    } catch (err) {
        res.status(400).json({ success: false, command, error: err.message });
    }
};