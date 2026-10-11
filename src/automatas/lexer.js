function tokenize(input) {
    const tokens = [];
    let current = 0;
    const str = input.trim();

    while (current < str.length) {
        let char = str[current];

        if (/\s/.test(char)) { current++; continue; }
        if (char === '(') { tokens.push({ type: 'TK_PAR_IZQ', value: '(' }); current++; continue; }
        if (char === ')') { tokens.push({ type: 'TK_PAR_DER', value: ')' }); current++; continue; }
        if (char === ',') { tokens.push({ type: 'TK_COMA', value: ',' }); current++; continue; }

        if (char === 'P') {
            const idMatch = str.slice(current).match(/^P\d{3}\b/);
            if (idMatch) {
                tokens.push({ type: 'TK_ID', value: idMatch[0] });
                current += idMatch[0].length;
                continue;
            }
        }

        const wordMatch = str.slice(current).match(/^[A-Z_]+/);
        if (wordMatch) {
            const word = wordMatch[0];
            const keywords = {
                'REGISTRAR': 'TK_REGISTRAR',
                'ASIGNAR': 'TK_ASIGNAR',
                'ALMACENAR': 'TK_ALMACENAR',
                'AUTORIZAR_RETIRO': 'TK_AUTORIZAR_RETIRO',
                'RETIRAR': 'TK_RETIRAR',
                'APAGAR_ALARMA': 'TK_APAGAR_ALARMA',
                'CONSULTAR': 'TK_CONSULTAR',
                'NORMAL': 'TK_TIPO',
                'FRAGIL': 'TK_TIPO',
                'PEQUENO': 'TK_TAMANO',
                'MEDIANO': 'TK_TAMANO',
                'GRANDE': 'TK_TAMANO'
            };

            if (keywords[word]) {
                tokens.push({ type: keywords[word], value: word });
                current += word.length;
                continue;
            }
        }

        throw new Error(`Error Léxico: Carácter o token no valido '${char}'`);
    }

    return tokens;
}

module.exports = { tokenize };