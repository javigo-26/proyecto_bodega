import { useMemo, useRef, useState } from 'react';
import { FaBox, FaCheck, FaExclamationCircle, FaInbox, FaTimes, FaWarehouse, FaWineGlassAlt } from 'react-icons/fa';
import LockerGrid from '../components/LockerGrid.jsx';
import { useBodega } from '../context/BodegaContext.jsx';
import { actualizarPaquete, ejecutarComando, eliminarPaquete } from '../services/api.js';
import { casillerosCompatibles, enRecepcion, etiqueta, formatearFecha } from '../utils/bodega.js';

const PATRON_ID = /^P\d{3}$/; // Mismo formato que acepta el backend
const LARGO_DESCRIPCION = 200; // Igual que la columna Paquetes.descripcion

// Orden de atención: del más antiguo al más reciente; si llegaron a la vez, por id (orden estable entre actualizaciones)
const llegada = (paquete) => new Date(paquete.fecha_registro ?? 0).getTime();
const porLlegada = (a, b) => llegada(a) - llegada(b) || a.id.localeCompare(b.id);

// Casillero de cada paquete pendiente: el ya asignado o el que ASIGNAR elegirá.
// Se reparte en orden de llegada para que dos paquetes no se cuenten en el mismo lugar libre.
function proyectarCasilleros(espacios, pendientes) {
  const simulados = espacios.map((espacio) => ({ ...espacio }));
  const asignacion = {};
  pendientes.forEach((paquete) => {
    if (paquete.espacio_codigo) {
      asignacion[paquete.id] = paquete.espacio_codigo;
      return;
    }
    const destino = casillerosCompatibles(simulados, paquete.tipo, paquete.tamano)[0];
    asignacion[paquete.id] = destino?.codigo ?? null;
    if (destino) {
      Object.assign(destino, {
        tipo: paquete.tipo,
        modo_tamano: paquete.tamano,
        ocupacion_actual: destino.ocupacion_actual + 1,
      });
    }
  });
  return asignacion;
}

// Recepción: paquetes detectados por la estación (tipo y tamaño automáticos) que esperan almacenarse o cancelarse
export default function Recepcion() {
  const { espacios, paquetes, ejecutar } = useBodega();
  const [procesando, setProcesando] = useState(null); // id del paquete con una operación en curso
  const [resaltado, setResaltado] = useState(null); // fila señalada: su casillero se marca en el dibujo
  const [ediciones, setEdiciones] = useState({}); // lo que escribió el operador, por id original: { id, descripcion }
  const reglas = useRef(null);

  const pendientes = useMemo(() => paquetes.filter(enRecepcion).sort(porLlegada), [paquetes]);
  const asignacion = useMemo(() => proyectarCasilleros(espacios, pendientes), [espacios, pendientes]);

  // Valores que muestra la fila: lo escrito por el operador o, si no tocó nada, lo guardado.
  // El id escrito solo cuenta mientras el paquete no tenga casillero (después ya no se puede cambiar).
  const valores = (paquete) => ({
    id: paquete.estado === 'REGISTRADO' ? (ediciones[paquete.id]?.id ?? paquete.id) : paquete.id,
    descripcion: ediciones[paquete.id]?.descripcion ?? paquete.descripcion ?? '',
  });
  const editar = (idOriginal, campo, valor) =>
    setEdiciones((actual) => ({ ...actual, [idOriginal]: { ...actual[idOriginal], [campo]: valor } }));
  const descartarEdicion = (idOriginal) => setEdiciones(({ [idOriginal]: _, ...resto }) => resto);

  // Problema del id escrito (null si es válido); el backend vuelve a validarlo contra todos los paquetes
  const problemaId = (paquete, id) => {
    if (!PATRON_ID.test(id)) return 'Usa P y 3 dígitos.';
    if (id === paquete.id) return null;
    const enUso =
      paquetes.some((otro) => otro.id === id) ||
      pendientes.some((otro) => otro.id !== paquete.id && valores(otro).id === id);
    return enUso ? `Ya hay otro paquete ${id}.` : null;
  };

  // Almacenar: guarda el id y la descripción escritos, asigna el casillero (si aún no tiene) y confirma el ingreso
  const almacenar = async (paquete) => {
    const { id, descripcion } = valores(paquete);
    const huboCambios = id !== paquete.id || descripcion.trim() !== (paquete.descripcion ?? '');
    setProcesando(paquete.id);
    await ejecutar(async () => {
      if (huboCambios) {
        await actualizarPaquete(paquete.id, { id, descripcion });
        descartarEdicion(paquete.id);
      }
      if (paquete.estado === 'REGISTRADO') await ejecutarComando('ASIGNAR', id);
      return ejecutarComando('ALMACENAR', id);
    }, `Paquete ${id} almacenado`);
    setProcesando(null);
  };

  // Cancelar: descarta el paquete con eliminado lógico (si tenía casillero, lo libera)
  const cancelar = async (paquete) => {
    if (!window.confirm(`¿Cancelar el ingreso del paquete ${paquete.id}? No se guardará en ningún casillero.`)) return;
    setProcesando(paquete.id);
    await ejecutar(() => eliminarPaquete(paquete.id), `Ingreso de ${paquete.id} cancelado`);
    setProcesando(null);
  };

  const haySinLugar = pendientes.some((paquete) => !asignacion[paquete.id]);

  return (
    <>
      <section className="card" aria-labelledby="titulo-recepcion">
        <header className="card__header">
          <h2 className="card__title" id="titulo-recepcion">
            <FaInbox aria-hidden="true" /> Recepción de paquetes
            <span className="badge badge--count">{pendientes.length}</span>
          </h2>
          <div className="card__tools">
            <button
              type="button"
              className="icon-btn icon-btn--aviso"
              onClick={() => reglas.current?.showModal()}
              aria-label="Ver reglas de recepción"
              title="Reglas de recepción"
            >
              <FaExclamationCircle aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="card__body card__body--flush">
          {pendientes.length === 0 ? (
            <p className="empty">
              No hay paquetes en recepción. Al colocar un paquete en la estación, la placa detecta si es frágil y los
              sensores su tamaño; aparecerá aquí automáticamente.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="table table--recepcion">
                <thead>
                  <tr>
                    <th>Paquete</th>
                    <th>Descripción</th>
                    <th>Tipo</th>
                    <th>Tamaño</th>
                    <th>Casillero asignado</th>
                    <th>Fecha de ingreso</th>
                    <th className="table__actions">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pendientes.map((paquete) => {
                    const casillero = asignacion[paquete.id];
                    const fragil = paquete.tipo === 'FRAGIL';
                    const { id, descripcion } = valores(paquete);
                    const errorId = problemaId(paquete, id);
                    const ocupado = procesando !== null;
                    // Con casillero asignado el id ya quedó en el almacenamiento: solo se edita la descripción
                    const idFijo = paquete.estado !== 'REGISTRADO';
                    const [fecha, hora] = formatearFecha(paquete.fecha_registro).split(', ');
                    return (
                      <tr
                        key={paquete.id}
                        onMouseEnter={() => setResaltado(paquete.id)}
                        onMouseLeave={() => setResaltado(null)}
                        onFocus={() => setResaltado(paquete.id)}
                        onBlur={() => setResaltado(null)}
                      >
                        <td>
                          <input
                            className="input input--sm input--mono input--id"
                            value={id}
                            onChange={(evento) => editar(paquete.id, 'id', evento.target.value.toUpperCase().trim())}
                            maxLength={4}
                            disabled={idFijo || ocupado}
                            aria-label={`Identificador del paquete ${paquete.id}`}
                            aria-invalid={Boolean(errorId)}
                            aria-describedby={errorId ? `error-id-${paquete.id}` : undefined}
                            title={
                              idFijo
                                ? 'Ya tiene casillero asignado; el identificador no se puede cambiar.'
                                : 'Identificador sugerido; puedes cambiarlo'
                            }
                            autoComplete="off"
                            spellCheck={false}
                          />
                          {errorId && (
                            <small className="field__error table__error" id={`error-id-${paquete.id}`}>
                              {errorId}
                            </small>
                          )}
                        </td>
                        <td>
                          <input
                            className="input input--sm input--descripcion"
                            value={descripcion}
                            onChange={(evento) => editar(paquete.id, 'descripcion', evento.target.value)}
                            maxLength={LARGO_DESCRIPCION}
                            disabled={ocupado}
                            placeholder="Opcional"
                            aria-label={`Descripción del paquete ${paquete.id}`}
                            autoComplete="off"
                          />
                        </td>
                        <td>
                          <span className={`badge badge--${fragil ? 'fragil' : 'normal'}`}>
                            {fragil ? <FaWineGlassAlt aria-hidden="true" /> : <FaBox aria-hidden="true" />}
                            {etiqueta(paquete.tipo)}
                          </span>
                        </td>
                        <td>{etiqueta(paquete.tamano)}</td>
                        <td>
                          {casillero ? <strong>{casillero}</strong> : <span className="badge badge--sin-lugar">Sin lugar</span>}
                        </td>
                        <td>
                          {/* Si no cabe en una línea, se parte entre la fecha y la hora */}
                          <span className="nowrap">{fecha}</span> <span className="nowrap">{hora}</span>
                        </td>
                        <td className="table__actions">
                          <button
                            type="button"
                            className="btn btn--success btn--sm"
                            onClick={() => almacenar(paquete)}
                            disabled={!casillero || Boolean(errorId) || ocupado}
                          >
                            <FaCheck aria-hidden="true" /> Almacenar
                          </button>
                          <button
                            type="button"
                            className="btn btn--danger btn--sm"
                            onClick={() => cancelar(paquete)}
                            disabled={ocupado}
                          >
                            <FaTimes aria-hidden="true" /> Cancelar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {haySinLugar && (
          <p className="card__note">
            “Sin lugar”: ningún casillero acepta ahora ese tipo y tamaño. Almacenar se habilita cuando se libere uno.
          </p>
        )}
      </section>

      <section className="card" aria-labelledby="titulo-recepcion-casilleros">
        <header className="card__header">
          <h2 className="card__title" id="titulo-recepcion-casilleros">
            <FaWarehouse aria-hidden="true" /> Casilleros
          </h2>
        </header>
        <div className="card__body">
          <LockerGrid espacios={espacios} paquetes={paquetes} destino={resaltado ? asignacion[resaltado] : undefined} />
          <p className="card__note">Pasa el cursor sobre un paquete de la tabla para ver su casillero.</p>
        </div>
      </section>

      <dialog
        ref={reglas}
        className="dialogo"
        aria-labelledby="titulo-reglas-recepcion"
        onClick={(evento) => evento.target === evento.currentTarget && evento.currentTarget.close()}
      >
        <div className="dialogo__contenido">
          <header className="dialogo__header">
            <h2 id="titulo-reglas-recepcion">
              <FaExclamationCircle aria-hidden="true" /> Reglas de recepción
            </h2>
            <button type="button" className="icon-btn" onClick={() => reglas.current?.close()} aria-label="Cerrar">
              <FaTimes aria-hidden="true" />
            </button>
          </header>
          <ol className="rules">
            <li>
              <strong>Tipo y tamaño automáticos:</strong> la placa detecta si el paquete es frágil o normal y los 3
              sensores de altura miden su tamaño (inferior: pequeño, medio: mediano, superior: grande).
            </li>
            <li>
              <strong>Frágil con frágil, normal con normal:</strong> los normales van a A1 o A2; F1 es el único
              compartimento para frágiles.
            </li>
            <li>
              <strong>Un solo tamaño por casillero:</strong> 3 pequeños, 2 medianos o 1 grande.
            </li>
            <li>
              <strong>Al vaciarse</strong>, el casillero vuelve a aceptar cualquier tamaño de su tipo.
            </li>
            <li>
              <strong>Identificador y descripción:</strong> el id llega sugerido (P001, P002…) y se puede cambiar antes de
              almacenar; debe ser P seguido de 3 dígitos y no repetirse. La descripción es opcional (hasta{' '}
              {LARGO_DESCRIPCION} caracteres).
            </li>
            <li>
              <strong>Almacenar</strong> guarda esos datos, asigna el casillero y confirma el ingreso;{' '}
              <strong>Cancelar</strong> descarta el paquete (eliminado lógico).
            </li>
          </ol>
        </div>
      </dialog>
    </>
  );
}
