import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FaClock, FaExclamationTriangle, FaHistory, FaSignOutAlt, FaTimes } from 'react-icons/fa';
import { useBodega } from '../context/BodegaContext.jsx';
import { ejecutarComando, getOperaciones } from '../services/api.js';
import { PATRON_ID, VENTANA_RETIRO_MS, formatearFecha } from '../utils/bodega.js';

const INTERVALO_BITACORA_MS = 5000; // también muestra lo hecho en otras pantallas o informado por el ESP32
const LIMITE_BITACORA = 500; // el backend devuelve como máximo esta cantidad

// Texto e insignia de cada resultado de la bitácora
const RESULTADOS = {
  ACEPTADA: { texto: 'Aceptada', clase: 'ok' },
  RECHAZADA: { texto: 'Rechazada', clase: 'fail' },
  ALERTA: { texto: 'Alerta', clase: 'fail' },
};

// Devuelve la hora actual y la refresca cada segundo mientras esté activo
function useReloj(activo) {
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    if (!activo) return undefined;
    setAhora(Date.now());
    const intervalo = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(intervalo);
  }, [activo]);

  return ahora;
}

// Carga la bitácora con el filtro de fechas y la mantiene al día
function useBitacora(filtro) {
  const [operaciones, setOperaciones] = useState([]);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    try {
      setOperaciones(await getOperaciones(filtro));
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, [filtro]);

  useEffect(() => {
    setCargando(true);
    cargar();
    const intervalo = setInterval(cargar, INTERVALO_BITACORA_MS);
    return () => clearInterval(intervalo);
  }, [cargar]);

  return { operaciones, error, cargando, recargar: cargar };
}

// Módulo de autorización de retiro (AUTORIZAR_RETIRO → RETIRAR) y bitácora de todas las operaciones.
// El ingreso se confirma en Recepción con "Almacenar".
export default function Autorizaciones() {
  const [parametros] = useSearchParams();
  const { paquetes, ejecutar } = useBodega();
  const [ventanas, setVentanas] = useState([]); // retiros autorizados con su vencimiento
  const [filtro, setFiltro] = useState({ desde: '', hasta: '' });
  const bitacora = useBitacora(filtro);
  const ahora = useReloj(ventanas.length > 0);

  const idRetiro = (parametros.get('retiro') ?? '').toUpperCase();

  // Paquetes que pueden retirarse (sugerencias del campo de retiro)
  const almacenados = useMemo(
    () => paquetes.filter((paquete) => paquete.estado === 'ALMACENADO' || paquete.estado === 'RETIRO_AUTORIZADO').map((paquete) => paquete.id),
    [paquetes]
  );

  // Quita las ventanas de retiro vencidas
  useEffect(() => {
    setVentanas((actuales) => (actuales.some((v) => v.expira <= ahora) ? actuales.filter((v) => v.expira > ahora) : actuales));
  }, [ahora]);

  // Ejecuta un comando del lenguaje formal y actualiza la bitácora (el backend lo registra)
  const operar = async (comando, id, tituloExito) => {
    const resultado = await ejecutar(() => ejecutarComando(comando, id), tituloExito);
    bitacora.recargar();
    return resultado;
  };

  // Pide confirmación, autoriza el retiro y abre la ventana temporal
  const autorizarRetiro = async (id) => {
    const casillero = paquetes.find((paquete) => paquete.id === id)?.espacio_codigo;
    const lugar = casillero ? ` del casillero ${casillero}` : '';
    const segundos = VENTANA_RETIRO_MS / 1000;
    const confirmado = window.confirm(
      `¿Seguro que quieres autorizar el retiro del paquete ${id}${lugar}?\n\n` +
        `Tendrás ${segundos} segundos para sacarlo; pasado ese tiempo, sacarlo activa la alarma.`
    );
    if (!confirmado) return;

    const { ok } = await operar('AUTORIZAR_RETIRO', id, `Retiro de ${id} autorizado`);
    if (ok) setVentanas((actuales) => [...actuales.filter((v) => v.id !== id), { id, expira: Date.now() + VENTANA_RETIRO_MS }]);
  };

  // Confirma el retiro y cierra su ventana
  const confirmarRetiro = async (id) => {
    const { ok } = await operar('RETIRAR', id, `Paquete ${id} retirado`);
    if (ok) setVentanas((actuales) => actuales.filter((v) => v.id !== id));
  };

  return (
    <>
      <PanelOperacion
        key={`retiro-${idRetiro}`}
        titulo="Autorizar retiro"
        icono={FaSignOutAlt}
        descripcion={`Abre una ventana de ${VENTANA_RETIRO_MS / 1000} segundos para sacar el paquete sin activar la alarma.`}
        idInicial={idRetiro}
        sugerencias={almacenados}
        pasos={[
          { comando: 'AUTORIZAR_RETIRO', etiqueta: 'Autorizar retiro', variante: 'warning', accion: autorizarRetiro },
          { comando: 'RETIRAR', etiqueta: 'Confirmar retiro', variante: 'danger', accion: confirmarRetiro },
        ]}
      >
        {ventanas.length > 0 && (
          <ul className="ventanas" aria-label="Retiros autorizados vigentes">
            {ventanas.map((ventana) => {
              const segundos = Math.max(Math.ceil((ventana.expira - ahora) / 1000), 0);
              return (
                <li key={ventana.id}>
                  <FaClock aria-hidden="true" />
                  <span>
                    <strong className="mono">{ventana.id}</strong> puede retirarse
                  </span>
                  <span className={`ventanas__tiempo${segundos <= 10 ? ' ventanas__tiempo--fin' : ''}`}>{segundos} s</span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="hint">
          <FaExclamationTriangle aria-hidden="true" />
          Si un paquete sale del casillero sin una autorización vigente, el ESP32 activa la alarma.
        </p>
      </PanelOperacion>

      <TablaOperaciones bitacora={bitacora} filtro={filtro} onFiltro={setFiltro} />
    </>
  );
}

// Bitácora de todas las operaciones con filtro por fecha
function TablaOperaciones({ bitacora, filtro, onFiltro }) {
  const { operaciones, error, cargando } = bitacora;
  const filtrando = Boolean(filtro.desde || filtro.hasta);

  // Cambia una de las dos fechas del filtro
  const cambiar = ({ target }) => onFiltro((actual) => ({ ...actual, [target.name]: target.value }));

  return (
    <section className="card" aria-labelledby="titulo-operaciones">
      <header className="card__header">
        <h2 className="card__title" id="titulo-operaciones">
          <FaHistory aria-hidden="true" /> Operaciones
          <span className="badge badge--count">{operaciones.length}</span>
        </h2>
        <div className="card__tools filtro-fechas">
          <label>
            Desde
            <input
              type="date"
              name="desde"
              className="input input--sm"
              value={filtro.desde}
              max={filtro.hasta || undefined}
              onChange={cambiar}
            />
          </label>
          <label>
            Hasta
            <input
              type="date"
              name="hasta"
              className="input input--sm"
              value={filtro.hasta}
              min={filtro.desde || undefined}
              onChange={cambiar}
            />
          </label>
          {filtrando && (
            <button type="button" className="btn btn--sm" onClick={() => onFiltro({ desde: '', hasta: '' })}>
              <FaTimes aria-hidden="true" /> Quitar filtro
            </button>
          )}
        </div>
      </header>

      <div className="card__body card__body--flush">
        {error ? (
          <p className="empty">
            <FaExclamationTriangle aria-hidden="true" /> No se pudo cargar la bitácora. {error}
          </p>
        ) : operaciones.length === 0 ? (
          <p className="empty">
            {cargando
              ? 'Cargando operaciones…'
              : filtrando
                ? 'No hay operaciones en esas fechas.'
                : 'Todavía no se han realizado operaciones.'}
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha y hora</th>
                  <th>Instrucción</th>
                  <th>Resultado</th>
                  <th className="bitacora__detalle">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {operaciones.map((operacion) => {
                  const resultado = RESULTADOS[operacion.resultado] ?? { texto: operacion.resultado, clase: 'fail' };
                  return (
                    <tr key={operacion.id}>
                      <td className="nowrap">
                        {formatearFecha(operacion.fecha, { segundos: true })}
                        {/* Origen debajo de la fecha: hecha en la pantalla o informada por el ESP32 */}
                        <small className="bitacora__origen">{operacion.origen === 'ESP32' ? 'ESP32' : 'Pantalla'}</small>
                      </td>
                      <td>
                        <code className="bitacora__instruccion">{operacion.instruccion}</code>
                      </td>
                      <td>
                        <span className={`badge badge--${resultado.clase}`}>{resultado.texto}</span>
                      </td>
                      <td className="bitacora__detalle">{operacion.detalle ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {operaciones.length >= LIMITE_BITACORA && (
        <p className="card__note">
          Se muestran las {LIMITE_BITACORA} operaciones más recientes; usa el filtro de fechas para ver las anteriores.
        </p>
      )}
    </section>
  );
}

// Panel reutilizable: pide el id del paquete y ejecuta los pasos del flujo en orden
function PanelOperacion({ titulo, icono: Icono, descripcion, idInicial, sugerencias = [], pasos, children }) {
  const [id, setId] = useState(idInicial);
  const [ocupado, setOcupado] = useState(false);
  const idCampo = useId();
  const valido = PATRON_ID.test(id);

  // Ejecuta un paso y bloquea los botones mientras responde el backend
  const ejecutarPaso = async (accion) => {
    setOcupado(true);
    try {
      await accion(id);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section className="card">
      <header className="card__header">
        <h2 className="card__title">
          <Icono aria-hidden="true" /> {titulo}
        </h2>
      </header>
      <div className="card__body card__body--estrecho">
        <p className="muted">{descripcion}</p>

        <div className="field">
          <label htmlFor={idCampo}>Identificador del paquete</label>
          <input
            id={idCampo}
            className="input input--mono"
            value={id}
            onChange={(evento) => setId(evento.target.value.toUpperCase().trim())}
            placeholder="P001"
            maxLength={4}
            list={`${idCampo}-lista`}
            autoComplete="off"
            aria-invalid={id !== '' && !valido}
          />
          {id !== '' && !valido && <small className="field__error">Formato válido: P seguido de 3 dígitos (P001).</small>}
          <datalist id={`${idCampo}-lista`}>
            {sugerencias.map((sugerencia) => (
              <option key={sugerencia} value={sugerencia} />
            ))}
          </datalist>
        </div>

        <div className="steps">
          {pasos.map(({ comando, etiqueta, variante, accion }, indice) => (
            <button
              key={comando}
              type="button"
              className={`btn btn--${variante}`}
              disabled={!valido || ocupado}
              onClick={() => ejecutarPaso(accion)}
            >
              <span className="step-num">{indice + 1}</span>
              {etiqueta}
              <code>
                {comando}({valido ? id : 'id'})
              </code>
            </button>
          ))}
        </div>

        {children}
      </div>
    </section>
  );
}
