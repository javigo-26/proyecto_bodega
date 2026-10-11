function parse(tokens) {
    if (!tokens || tokens.length === 0) throw new Error('Error Sintáctico: Cadena vacía');

    let ptr = 0;
    const match = (type) => {
        if (ptr < tokens.length && tokens[ptr].type === type) return tokens[ptr++];
        const found = ptr < tokens.length ? tokens[ptr].value : 'FIN';
        throw new Error(`Error Sintáctico: Se esperaba '${type}' pero se encontró '${found}'`);
    };

    const firstToken = tokens[ptr++];

    switch (firstToken.type) {
        case 'TK_REGISTRAR': {
            match('TK_PAR_IZQ');
            const tipo = match('TK_TIPO').value;
            match('TK_COMA');
            const id = match('TK_ID').value;
            match('TK_COMA');
            const tamano = match('TK_TAMANO').value;
            match('TK_PAR_DER');
            return { action: 'REGISTRAR', params: { tipo, id, tamano } };
        }
        case 'TK_ASIGNAR': {
            match('TK_PAR_IZQ');
            const id = match('TK_ID').value;
            match('TK_PAR_DER');
            return { action: 'ASIGNAR', params: { id } };
        }
        case 'TK_AUTORIZAR_RETIRO': {
            match('TK_PAR_IZQ');
            const id = match('TK_ID').value;
            match('TK_PAR_DER');
            return { action: 'AUTORIZAR_RETIRO', params: { id } };
        }
        case 'TK_APAGAR_ALARMA': {
            match('TK_PAR_IZQ');
            const id = match('TK_ID').value;
            match('TK_PAR_DER');
            return { action: 'APAGAR_ALARMA', params: { id } };
        }
        case 'TK_CONSULTAR': {
            match('TK_PAR_IZQ');
            match('TK_PAR_DER');
            return { action: 'CONSULTAR', params: {} };
        }
        default:
            throw new Error(`Error Sintáctico: Comando no reconocido '${firstToken.value}'`);
    }
}

module.exports = { parse };