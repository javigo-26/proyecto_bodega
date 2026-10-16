import { useMemo } from 'react';
import {
  FaBell,
  FaBox,
  FaBoxOpen,
  FaBoxes,
  FaCheck,
  FaEye,
  FaInbox,
  FaLayerGroup,
  FaPowerOff,
  FaSignOutAlt,
  FaUserCircle,
  FaWarehouse,
  FaWineGlassAlt,
} from 'react-icons/fa';
import LockerGrid from '../components/LockerGrid.jsx';
import PaquetesTable from '../components/PaquetesTable.jsx';
import StatCard from '../components/StatCard.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useBodega } from '../context/BodegaContext.jsx';
import {
  aceptaTipo,
  disponibilidadPorTamano,
  enRecepcion,
  estaGuardado,
  etiqueta,
  formatearHora,
  iniciales,
  tieneCupo,
} from '../utils/bodega.js';

// Fecha usada para ordenar paquetes del más reciente al más antiguo
const fechaDe = (paquete) => new Date(paquete.fecha_ingreso ?? paquete.fecha_registro ?? 0).getTime();

// Página principal: indicadores, casilleros en vivo, usuario y disponibilidad por tamaño
export default function Dashboard() {
  const { espacios, paquetes, alarmas, errorPaquetes, conectado, ultimaActualizacion, apagarAlarma } = useBodega();

  // Indicadores de las tarjetas superiores
  const resumen = useMemo(() => {
    // Casilleros de ese tipo que todavía aceptan algún paquete (A1 y A2 normales, F1 frágiles)
    const aceptan = (tipo) => `${espacios.filter((espacio) => aceptaTipo(espacio, tipo)).length}/${espacios.length}`;
    return {
      conCupo: espacios.filter(tieneCupo).length,
      enUso: espacios.filter((espacio) => espacio.ocupacion_actual > 0).length,
      normales: aceptan('NORMAL'),
      fragiles: aceptan('FRAGIL'),
    };
  }, [espacios]);

  // Paquetes ya guardados en un casillero y los que esperan en recepción
  const guardados = useMemo(() => paquetes.filter(estaGuardado), [paquetes]);
  const enEspera = paquetes.filter(enRecepcion).length;

  // Últimos 10 paquetes almacenados
  const ultimos = useMemo(() => [...guardados].sort((a, b) => fechaDe(b) - fechaDe(a)).slice(0, 10), [guardados]);

  const verCasilleros = { etiqueta: 'Ver casilleros', icono: FaEye, href: '#casilleros' };

  return (
    <>
      <section className="stats" aria-label="Indicadores de la bodega">
        <StatCard
          color="purple"
          valor={errorPaquetes ? '—' : guardados.length}
          titulo="Paquetes almacenados"
          icono={FaBoxOpen}
          acciones={[
            { etiqueta: enEspera ? `Recepción (${enEspera})` : 'Recepción', icono: FaInbox, to: '/recepcion' },
            { etiqueta: 'Ver', icono: FaEye, to: '/paquetes' },
          ]}
        />
        <StatCard
          color="success"
          valor={`${resumen.conCupo}/${espacios.length}`}
          titulo="Casilleros con cupo"
          icono={FaWarehouse}
          acciones={[verCasilleros]}
        />
        <StatCard
          color="warning"
          valor={resumen.enUso}
          titulo="Casilleros en uso"
          icono={FaBoxes}
          acciones={[{ etiqueta: 'Autorizar retiro', icono: FaSignOutAlt, to: '/autorizaciones' }]}
        />
        <StatCard
          color="danger"
          valor={alarmas.length}
          titulo="Alarmas activas"
          icono={FaBell}
          acciones={[
            alarmas.length
              ? { etiqueta: 'Apagar alarma', icono: FaPowerOff, onClick: apagarAlarma }
              : { etiqueta: 'Sin alarmas', icono: FaCheck },
          ]}
        />
        <StatCard color="primary" valor={resumen.normales} titulo="Aceptan normales" icono={FaBox} acciones={[verCasilleros]} />
        <StatCard color="indigo" valor={resumen.fragiles} titulo="Aceptan frágiles" icono={FaWineGlassAlt} acciones={[verCasilleros]} />
      </section>

      <div className="grid-main">
        <section className="card" id="casilleros" aria-labelledby="titulo-casilleros">
          <header className="card__header">
            <h2 className="card__title" id="titulo-casilleros">
              <FaWarehouse aria-hidden="true" /> Casilleros
            </h2>
            <div className="card__tools">
              <span className={`live${conectado ? '' : ' live--off'}`}>
                <span className="live__dot" aria-hidden="true" />
                {conectado ? `En vivo · ${formatearHora(ultimaActualizacion)}` : 'Sin conexión'}
              </span>
            </div>
          </header>
          <div className="card__body">
            <LockerGrid espacios={espacios} paquetes={paquetes} />
            <ul className="legend" aria-label="Significado de los LEDs">
              <li><span className="led led--verde led--on" /> Disponible (vacío)</li>
              <li><span className="led led--amarillo led--on" /> Parcial: tiene paquetes y aún acepta</li>
              <li><span className="led led--rojo led--on" /> Lleno</li>
              <li><span className="led led--rojo led--on led--blink" /> Alarma</li>
            </ul>
          </div>
        </section>

        <div className="grid-main__side">
          <PerfilUsuario />
          <DisponibilidadPorTamano espacios={espacios} />
        </div>
      </div>

      <section className="card" aria-labelledby="titulo-ultimos">
        <header className="card__header">
          <h2 className="card__title" id="titulo-ultimos">
            <FaBoxes aria-hidden="true" /> Últimos 10 paquetes almacenados
          </h2>
        </header>
        <div className="card__body card__body--flush">
          <PaquetesTable paquetes={ultimos} error={errorPaquetes} />
        </div>
      </section>
    </>
  );
}

// Tarjeta con los datos del usuario que inició sesión
function PerfilUsuario() {
  const { usuario } = useAuth();

  return (
    <section className="card" aria-labelledby="titulo-usuario">
      <header className="card__header">
        <h2 className="card__title" id="titulo-usuario">
          <FaUserCircle aria-hidden="true" /> Usuario en sesión
        </h2>
      </header>
      <div className="card__body profile">
        <span className="avatar avatar--lg" aria-hidden="true">{iniciales(usuario.nombre_completo)}</span>
        <span className="profile__name">{usuario.nombre_completo}</span>
        <span className="muted">@{usuario.username}</span>
        <ul className="profile__list">
          <li><span className="muted">ID de usuario</span><strong>#{usuario.id}</strong></li>
          <li><span className="muted">Rol</span><strong>Operador de bodega</strong></li>
          <li><span className="muted">Sesión iniciada</span><strong>{formatearHora(usuario.inicio)}</strong></li>
        </ul>
      </div>
    </section>
  );
}

// Cupos libres por tamaño: 1 grande, 2 medianos o 3 pequeños por cajón
function DisponibilidadPorTamano({ espacios }) {
  const filas = useMemo(() => disponibilidadPorTamano(espacios), [espacios]);

  return (
    <section className="card" aria-labelledby="titulo-disponibilidad">
      <header className="card__header">
        <h2 className="card__title" id="titulo-disponibilidad">
          <FaLayerGroup aria-hidden="true" /> Disponibilidad por tamaño
        </h2>
      </header>
      <div className="card__body card__body--flush">
        <div className="table-wrap">
          <table className="table table--compact">
            <thead>
              <tr>
                <th>Tamaño</th>
                <th>Por cajón</th>
                <th>Normales</th>
                <th>Frágiles</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => (
                <tr key={fila.tamano}>
                  <td><strong>{etiqueta(fila.tamano)}</strong></td>
                  <td>{fila.capacidad}</td>
                  <td>{fila.NORMAL} cupos</td>
                  <td>{fila.FRAGIL} cupos</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="card__note">
          A1 y A2 guardan paquetes normales; F1 es el único compartimento para frágiles. Un casillero no mezcla
          tamaños: el primer paquete fija el tamaño hasta que se vacía.
        </p>
      </div>
    </section>
  );
}
