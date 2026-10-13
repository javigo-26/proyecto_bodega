import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apagarAlarma as apiApagarAlarma, getEspacios, getPaquetes } from '../services/api.js';
import { enAlarma, esActivo, normalizarEspacio, normalizarPaquete } from '../utils/bodega.js';
import { useAlert } from './AlertContext.jsx';
import { useAuth } from './AuthContext.jsx';

const BodegaContext = createContext(null);
const INTERVALO_MS = 2500; // frecuencia de actualización en tiempo real

// Provee el estado en vivo de la bodega: casilleros, paquetes activos y alarmas
export function BodegaProvider({ children }) {
  const { usuario } = useAuth();
  const { notificar, cerrar } = useAlert();
  const [espacios, setEspacios] = useState([]);
  const [paquetes, setPaquetes] = useState([]);
  const [errorPaquetes, setErrorPaquetes] = useState(null);
  const [conectado, setConectado] = useState(true);
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null);
  const alertasDeAlarma = useRef(new Map()); // casillero → id de la notificación mostrada
  const sinConexionAvisado = useRef(false);

  // Notifica cada alarma nueva y cierra la notificación cuando la alarma se apaga
  const revisarAlarmas = useCallback(
    (lista) => {
      lista.forEach((espacio) => {
        const idAlerta = alertasDeAlarma.current.get(espacio.codigo);
        if (enAlarma(espacio) && idAlerta === undefined) {
          const id = notificar({
            tipo: 'alarm',
            titulo: `¡Alarma en el casillero ${espacio.codigo}!`,
            mensaje: 'Se retiró un paquete sin autorización ni inicio de sesión previo.',
          });
          alertasDeAlarma.current.set(espacio.codigo, id);
        } else if (!enAlarma(espacio) && idAlerta !== undefined) {
          cerrar(idAlerta);
          alertasDeAlarma.current.delete(espacio.codigo);
        }
      });
    },
    [notificar, cerrar]
  );

  // Consulta casilleros y paquetes; los paquetes solo se piden con sesión iniciada
  const actualizar = useCallback(async () => {
    const [resEspacios, resPaquetes] = await Promise.allSettled([
      getEspacios(),
      usuario ? getPaquetes() : Promise.resolve([]),
    ]);

    if (resEspacios.status === 'fulfilled') {
      const lista = (resEspacios.value ?? []).map(normalizarEspacio);
      setEspacios(lista);
      revisarAlarmas(lista);
      setConectado(true);
      setUltimaActualizacion(new Date());
      sinConexionAvisado.current = false;
    } else {
      setConectado(false);
      if (!sinConexionAvisado.current) {
        notificar({ tipo: 'error', titulo: 'Sin conexión con la bodega', mensaje: resEspacios.reason.message });
        sinConexionAvisado.current = true;
      }
    }

    if (resPaquetes.status === 'fulfilled') {
      const lista = Array.isArray(resPaquetes.value) ? resPaquetes.value : [];
      setPaquetes(lista.map(normalizarPaquete).filter(esActivo));
      setErrorPaquetes(null);
    } else {
      setErrorPaquetes(resPaquetes.reason.message);
    }
  }, [usuario, revisarAlarmas, notificar]);

  // Ciclo de actualización periódica (sin solapar peticiones)
  useEffect(() => {
    let activo = true;
    let temporizador;
    const ciclo = async () => {
      await actualizar();
      if (activo) temporizador = setTimeout(ciclo, INTERVALO_MS);
    };
    ciclo();
    return () => {
      activo = false;
      clearTimeout(temporizador);
    };
  }, [actualizar]);

  // Ejecuta una operación, notifica el resultado y refresca los datos al instante
  const ejecutar = useCallback(
    async (operacion, tituloExito) => {
      try {
        const datos = await operacion();
        notificar({ tipo: 'success', titulo: tituloExito, mensaje: datos?.result?.message ?? datos?.message });
        await actualizar();
        return { ok: true, datos };
      } catch (err) {
        notificar({ tipo: 'error', titulo: 'Operación rechazada', mensaje: err.message });
        return { ok: false, error: err.message };
      }
    },
    [actualizar, notificar]
  );

  // Apaga la alarma desde la aplicación (la alarma nunca se apaga sola)
  const apagarAlarma = useCallback(() => ejecutar(apiApagarAlarma, 'Alarma desactivada'), [ejecutar]);

  const alarmas = useMemo(() => espacios.filter(enAlarma), [espacios]);

  const valor = useMemo(
    () => ({ espacios, paquetes, alarmas, errorPaquetes, conectado, ultimaActualizacion, ejecutar, apagarAlarma }),
    [espacios, paquetes, alarmas, errorPaquetes, conectado, ultimaActualizacion, ejecutar, apagarAlarma]
  );

  return <BodegaContext.Provider value={valor}>{children}</BodegaContext.Provider>;
}

// Hook para leer el estado de la bodega
export function useBodega() {
  const contexto = useContext(BodegaContext);
  if (!contexto) throw new Error('useBodega debe usarse dentro de BodegaProvider');
  return contexto;
}
