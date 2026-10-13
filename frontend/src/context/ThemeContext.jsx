import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext(null);
const CLAVE = 'bodega-tema';

// Lee el tema guardado o, si no hay, el preferido por el sistema
function temaInicial() {
  try {
    const guardado = localStorage.getItem(CLAVE);
    if (guardado === 'light' || guardado === 'dark') return guardado;
  } catch {
    // almacenamiento no disponible: se usa la preferencia del sistema
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Provee el tema (claro/oscuro) y la función para alternarlo
export function ThemeProvider({ children }) {
  const [tema, setTema] = useState(temaInicial);

  // Aplica el tema al documento y lo recuerda para la próxima visita
  useEffect(() => {
    document.documentElement.dataset.theme = tema;
    try {
      localStorage.setItem(CLAVE, tema);
    } catch {
      // sin almacenamiento el tema solo dura esta sesión
    }
  }, [tema]);

  // Cambia entre modo claro y oscuro
  const alternarTema = useCallback(() => setTema((actual) => (actual === 'dark' ? 'light' : 'dark')), []);

  const valor = useMemo(() => ({ tema, alternarTema }), [tema, alternarTema]);
  return <ThemeContext.Provider value={valor}>{children}</ThemeContext.Provider>;
}

// Hook para usar el tema en cualquier componente
export function useTheme() {
  const contexto = useContext(ThemeContext);
  if (!contexto) throw new Error('useTheme debe usarse dentro de ThemeProvider');
  return contexto;
}
