import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import {
  FaBell,
  FaCheckCircle,
  FaExclamationTriangle,
  FaInfoCircle,
  FaTimes,
  FaTimesCircle,
} from 'react-icons/fa';

const AlertContext = createContext(null);
const DURACION_MS = 5000;
const MAXIMO_VISIBLES = 5;

const ICONOS = {
  success: FaCheckCircle,
  error: FaTimesCircle,
  warning: FaExclamationTriangle,
  info: FaInfoCircle,
  alarm: FaBell,
};

// Emite un pitido corto de alarma con Web Audio (sin archivos de sonido)
function sonarAlarma() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const audio = new AudioCtx();
    [0, 0.3, 0.6].forEach((inicio) => {
      const oscilador = audio.createOscillator();
      const volumen = audio.createGain();
      oscilador.type = 'square';
      oscilador.frequency.value = 880;
      volumen.gain.value = 0.06;
      oscilador.connect(volumen).connect(audio.destination);
      oscilador.start(audio.currentTime + inicio);
      oscilador.stop(audio.currentTime + inicio + 0.18);
    });
    setTimeout(() => audio.close(), 1200);
  } catch {
    // el navegador bloqueó el audio: la alerta visual sigue funcionando
  }
}

// Provee las notificaciones emergentes (éxito, error, aviso y alarma)
export function AlertProvider({ children }) {
  const [alertas, setAlertas] = useState([]);
  const contador = useRef(0);

  // Quita una notificación por su id
  const cerrar = useCallback((id) => {
    setAlertas((actuales) => actuales.filter((alerta) => alerta.id !== id));
  }, []);

  // Muestra una notificación; las alarmas suenan y no se ocultan solas
  const notificar = useCallback(
    ({ tipo = 'info', titulo, mensaje, persistente = tipo === 'alarm' }) => {
      contador.current += 1;
      const id = contador.current;
      setAlertas((actuales) => [...actuales.slice(-(MAXIMO_VISIBLES - 1)), { id, tipo, titulo, mensaje }]);
      if (tipo === 'alarm') sonarAlarma();
      if (!persistente) setTimeout(() => cerrar(id), DURACION_MS);
      return id;
    },
    [cerrar]
  );

  const valor = useMemo(() => ({ notificar, cerrar }), [notificar, cerrar]);

  return (
    <AlertContext.Provider value={valor}>
      {children}
      <div className="toasts" aria-live="polite">
        {alertas.map(({ id, tipo, titulo, mensaje }) => {
          const Icono = ICONOS[tipo] ?? FaInfoCircle;
          return (
            <div key={id} className={`toast toast--${tipo}`} role={tipo === 'alarm' || tipo === 'error' ? 'alert' : 'status'}>
              <Icono className="toast__icon" aria-hidden="true" />
              <div className="toast__body">
                {titulo && <strong>{titulo}</strong>}
                {mensaje && <p>{mensaje}</p>}
              </div>
              <button type="button" className="toast__close" onClick={() => cerrar(id)} aria-label="Cerrar notificación">
                <FaTimes aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </AlertContext.Provider>
  );
}

// Hook para mostrar notificaciones desde cualquier componente
export function useAlert() {
  const contexto = useContext(AlertContext);
  if (!contexto) throw new Error('useAlert debe usarse dentro de AlertProvider');
  return contexto;
}
