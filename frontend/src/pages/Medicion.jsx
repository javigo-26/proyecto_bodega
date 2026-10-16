import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FaArrowRight, FaBox, FaInbox, FaInfoCircle, FaRulerCombined, FaSave, FaWineGlassAlt } from 'react-icons/fa';
import { useAlert } from '../context/AlertContext.jsx';
import { useBodega } from '../context/BodegaContext.jsx';
import { ejecutarComando, medirPaquete } from '../services/api.js';
import {
  CAPACIDAD,
  PATRON_ID,
  TAMANOS,
  TIPOS,
  casillerosCompatibles,
  clasificarPorSensores,
  etiqueta,
} from '../utils/bodega.js';

// Los 3 sensores de altura de la estación, de abajo hacia arriba, y el tamaño que indica cada uno
const SENSORES = [
  { nombre: 'LOWER', altura: 'Inferior', tamano: 'Pequeño' },
  { nombre: 'MIDDLE', altura: 'Medio', tamano: 'Mediano' },
  { nombre: 'UPPER', altura: 'Superior', tamano: 'Grande' },
];

// Módulo de medición: mide el paquete en la estación IR y lo registra con el tamaño detectado
export default function Medicion() {
  const [parametros] = useSearchParams();
  const { espacios, ejecutar } = useBodega();
  const { notificar } = useAlert();
  // Datos que llegan desde Recepción (?id=P001&tipo=FRAGIL&tamano=MEDIANO)
  const [id, setId] = useState(() => (parametros.get('id') ?? '').toUpperCase());
  const [tipo, setTipo] = useState(() => (TIPOS.includes(parametros.get('tipo')) ? parametros.get('tipo') : 'NORMAL'));
  const [declarado, setDeclarado] = useState(() =>
    TAMANOS.includes(parametros.get('tamano')) ? parametros.get('tamano') : null
  );
  const [medicion, setMedicion] = useState(null); // { tamano, sensores }
  const [ocupado, setOcupado] = useState(false);
  const [registrado, setRegistrado] = useState(null);
  const valido = PATRON_ID.test(id);

  // Casillero que recibiría el paquete con el tamaño medido (se actualiza en vivo)
  const destino = medicion ? casillerosCompatibles(espacios, tipo, medicion.tamano)[0] : null;

  // Solicita la lectura de los sensores al ESP32 por medio del backend
  const medir = async () => {
    setOcupado(true);
    setRegistrado(null);
    try {
      const datos = await medirPaquete(id);
      const sensores = datos?.sensores ?? {};
      const tamano = TAMANOS.includes(datos?.tamano) ? datos.tamano : clasificarPorSensores(sensores);
      setMedicion({ tamano, sensores });
    } catch (err) {
      setMedicion(null);
      notificar({ tipo: 'error', titulo: 'No se pudo medir el paquete', mensaje: err.message });
    } finally {
      setOcupado(false);
    }
  };

  // Registra el paquete con el tamaño medido (instrucción REGISTRAR)
  const registrar = async () => {
    setOcupado(true);
    const { ok } = await ejecutar(
      () => ejecutarComando('REGISTRAR', tipo, id, medicion.tamano),
      `Paquete ${id} registrado`
    );
    setOcupado(false);
    if (ok) {
      setRegistrado(id);
      setMedicion(null);
      setDeclarado(null);
      setId('');
    }
  };

  // Cambia el id y descarta una medición anterior y el tamaño declarado en recepción
  const cambiarId = (evento) => {
    setId(evento.target.value.toUpperCase().trim());
    setMedicion(null);
    setDeclarado(null);
  };

  return (
    <div className="grid-main">
      <section className="card" aria-labelledby="titulo-estacion">
        <header className="card__header">
          <h2 className="card__title" id="titulo-estacion">
            <FaRulerCombined aria-hidden="true" /> Estación de medición
          </h2>
        </header>
        <div className="card__body">
          {declarado && (
            <p className="hint">
              <FaInbox aria-hidden="true" />
              Viene de recepción con tamaño declarado {etiqueta(declarado).toLowerCase()}. La medición lo confirma.
            </p>
          )}

          <div className="form-row">
            <div className="field">
              <label htmlFor="medicion-id">Identificador del paquete</label>
              <input
                id="medicion-id"
                className="input input--mono"
                value={id}
                onChange={cambiarId}
                placeholder="P001"
                maxLength={4}
                autoComplete="off"
                aria-invalid={id !== '' && !valido}
              />
              {id !== '' && !valido && <small className="field__error">Formato válido: P seguido de 3 dígitos (P001).</small>}
            </div>

            <fieldset className="field">
              <legend>Tipo de paquete</legend>
              <div className="segmented">
                {TIPOS.map((opcion) => (
                  <label key={opcion} className="segmented__option">
                    <input
                      type="radio"
                      name="tipo"
                      value={opcion}
                      checked={tipo === opcion}
                      onChange={() => setTipo(opcion)}
                    />
                    <span>
                      {opcion === 'FRAGIL' ? <FaWineGlassAlt aria-hidden="true" /> : <FaBox aria-hidden="true" />}{' '}
                      {etiqueta(opcion)}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <p className="hint">
            <FaInfoCircle aria-hidden="true" />
            Coloca la caja contra la esquina y las guías de la estación. La fragilidad se indica aquí: los sensores de altura
            no pueden detectarla.
          </p>

          <button type="button" className="btn" onClick={medir} disabled={!valido || ocupado}>
            <FaRulerCombined aria-hidden="true" /> {ocupado && !medicion ? 'Midiendo…' : 'Medir paquete'}
          </button>

          <div className="table-wrap sensores">
            <table className="table table--compact">
              <caption className="sr-only">Lectura de los sensores de altura</caption>
              <thead>
                <tr>
                  <th>Altura</th>
                  <th>Si detecta la caja</th>
                  <th>Lectura</th>
                </tr>
              </thead>
              <tbody>
                {SENSORES.map(({ nombre, altura, tamano }) => (
                  <tr key={nombre}>
                    <td>{altura}</td>
                    <td>{tamano}</td>
                    <td><Sensor nombre={nombre} valor={medicion?.sensores[nombre]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {medicion && (
            <div className={`resultado${destino ? '' : ' resultado--warning'}`} role="status">
              <div>
                <span className="muted">Tamaño detectado</span>
                <span className="resultado__valor">{etiqueta(medicion.tamano)}</span>
                <span className="muted">
                  Un cajón admite {CAPACIDAD[medicion.tamano]} de este tamaño ·{' '}
                  {destino
                    ? `casillero disponible: ${destino.codigo}`
                    : `ningún casillero tiene lugar para un paquete ${tipo === 'FRAGIL' ? 'frágil' : 'normal'} de este tamaño`}
                  .
                </span>
                {declarado && declarado !== medicion.tamano && (
                  <p className="resultado__nota">
                    En recepción se declaró {etiqueta(declarado).toLowerCase()}; se registrará como{' '}
                    {etiqueta(medicion.tamano).toLowerCase()}.
                  </p>
                )}
              </div>
              <button type="button" className="btn btn--success" onClick={registrar} disabled={ocupado}>
                <FaSave aria-hidden="true" /> Registrar
                <code>
                  REGISTRAR({tipo},{id},{medicion.tamano})
                </code>
              </button>
            </div>
          )}

          {registrado && (
            <div className="resultado resultado--ok" role="status">
              <span>
                Paquete <strong className="mono">{registrado}</strong> registrado. Siguiente paso: autorizar su ingreso.
              </span>
              <Link to={`/autorizaciones?ingreso=${registrado}`} className="btn btn--sm">
                Autorizar ingreso <FaArrowRight aria-hidden="true" />
              </Link>
            </div>
          )}
        </div>
      </section>

      <section className="card" aria-labelledby="titulo-reglas">
        <header className="card__header">
          <h2 className="card__title" id="titulo-reglas">
            <FaInfoCircle aria-hidden="true" /> Cómo se clasifica
          </h2>
        </header>
        <div className="card__body">
          <ol className="rules">
            <li><strong>Grande:</strong> supera el umbral mediano en cualquier eje.</li>
            <li><strong>Mediano:</strong> no supera el mediano, pero sí el pequeño en algún eje.</li>
            <li><strong>Pequeño:</strong> no supera ningún umbral pequeño.</li>
          </ol>
          <ul className="profile__list">
            {TAMANOS.map((tamano) => (
              <li key={tamano}>
                <span className="muted">{etiqueta(tamano)}</span>
                <strong>{CAPACIDAD[tamano]} por cajón</strong>
              </li>
            ))}
          </ul>
          <p className="card__note">
            A1 y A2 guardan normales; F1 es el único compartimento para frágiles. Un casillero no mezcla tamaños: el
            primer paquete fija el tamaño hasta que se vacía.
          </p>
        </div>
      </section>
    </div>
  );
}

// Indicador de un sensor IR: detecta, libre o sin lectura
function Sensor({ nombre, valor }) {
  const estado = valor === undefined ? 'sin-lectura' : valor ? 'on' : 'off';
  const texto = { 'sin-lectura': 'Sin lectura', on: 'Detecta', off: 'Libre' }[estado];

  return (
    <span className={`sensor sensor--${estado}`}>
      <span className="sensor__dot" aria-hidden="true" />
      <span className="mono">{nombre}</span> {texto}
    </span>
  );
}
