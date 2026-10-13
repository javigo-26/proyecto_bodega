import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FaClock, FaExclamationTriangle, FaHistory, FaSignInAlt, FaSignOutAlt } from 'react-icons/fa';
import { useBodega } from '../context/BodegaContext.jsx';
import { ejecutarComando } from '../services/api.js';
import { PATRON_ID, VENTANA_RETIRO_MS, formatearHora } from '../utils/bodega.js';

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

// Módulo de autorización: ingreso (ASIGNAR → ALMACENAR) y retiro (AUTORIZAR_RETIRO → RETIRAR)
export default function Autorizaciones() {
  const [parametros] = useSearchParams();
  const { paquetes, ejecutar } = useBodega();
  const [ventanas, setVentanas] = useState([]); // retiros autorizados con su vencimiento
  const [historial, setHistorial] = useState([]); // operaciones realizadas en esta sesión
  const contador = useRef(0);
  const ahora = useReloj(ventanas.length > 0);

  const idIngreso = (parametros.get('ingreso') ?? '').toUpperCase();
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

  // Ejecuta un comando del lenguaje formal y lo registra en el historial
  const operar = useCallback(
    async (comando, id, tituloExito) => {
      const resultado = await ejecutar(() => ejecutarComando(comando, id), tituloExito);
      contador.current += 1;
      const registro = {
        clave: contador.current,
        hora: new Date(),
        instruccion: `${comando}(${id})`,
        ok: resultado.ok,
        mensaje: resultado.ok ? resultado.datos?.result?.message ?? 'Aceptada' : resultado.error,
      };
      setHistorial((actual) => [registro, ...actual].slice(0, 8));
      return resultado;
    },
    [ejecutar]
  );

  // Autoriza el retiro y abre la ventana temporal
  const autorizarRetiro = async (id) => {
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
      <div className="grid-2">
        <PanelOperacion
          key={`ingreso-${idIngreso}`}
          titulo="Autorizar ingreso"
          icono={FaSignInAlt}
          descripcion="Reserva un casillero compatible para el paquete medido y confirma cuando quede guardado físicamente."
          idInicial={idIngreso}
          pasos={[
            { comando: 'ASIGNAR', etiqueta: 'Asignar casillero', variante: 'primary', accion: (id) => operar('ASIGNAR', id, `Casillero asignado a ${id}`) },
            { comando: 'ALMACENAR', etiqueta: 'Confirmar almacenamiento', variante: 'success', accion: (id) => operar('ALMACENAR', id, `Paquete ${id} almacenado`) },
          ]}
        />

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
      </div>

      <section className="card" aria-labelledby="titulo-historial">
        <header className="card__header">
          <h2 className="card__title" id="titulo-historial">
            <FaHistory aria-hidden="true" /> Operaciones de esta sesión
          </h2>
        </header>
        <div className="card__body card__body--flush">
          {historial.length === 0 ? (
            <p className="empty">Todavía no se han ejecutado operaciones.</p>
          ) : (
            <div className="table-wrap">
              <table className="table table--compact">
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Instrucción</th>
                    <th>Resultado</th>
                    <th>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.map((registro) => (
                    <tr key={registro.clave}>
                      <td>{formatearHora(registro.hora)}</td>
                      <td><code>{registro.instruccion}</code></td>
                      <td>
                        <span className={`badge badge--${registro.ok ? 'ok' : 'fail'}`}>{registro.ok ? 'Aceptada' : 'Rechazada'}</span>
                      </td>
                      <td>{registro.mensaje}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
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
      <div className="card__body">
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
