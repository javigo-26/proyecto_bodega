import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FaBoxes, FaPlus, FaSearch, FaSignOutAlt, FaTrashAlt } from 'react-icons/fa';
import PaquetesTable from '../components/PaquetesTable.jsx';
import { useBodega } from '../context/BodegaContext.jsx';
import { eliminarPaquete } from '../services/api.js';
import { estaGuardado } from '../utils/bodega.js';

// Listado de paquetes guardados con búsqueda, filtro por tipo y eliminado lógico (los pendientes están en Recepción)
export default function Paquetes() {
  const { paquetes: activos, errorPaquetes, ejecutar } = useBodega();
  const paquetes = useMemo(() => activos.filter(estaGuardado), [activos]);
  const [parametros, setParametros] = useSearchParams();
  const texto = parametros.get('q') ?? '';
  const tipo = parametros.get('tipo') ?? '';

  // Guarda el filtro en la URL para que el buscador superior y esta página compartan estado
  const cambiarFiltro = (clave, valor) => {
    const siguientes = new URLSearchParams(parametros);
    if (valor) siguientes.set(clave, valor);
    else siguientes.delete(clave);
    setParametros(siguientes, { replace: true });
  };

  // Filtra por identificador o casillero y por tipo
  const filtrados = useMemo(() => {
    const busqueda = texto.trim().toUpperCase();
    return paquetes.filter(
      (paquete) =>
        (!tipo || paquete.tipo === tipo) &&
        (!busqueda || String(paquete.id).includes(busqueda) || paquete.espacio_codigo?.includes(busqueda))
    );
  }, [paquetes, texto, tipo]);

  // Pide confirmación y marca el paquete como inactivo (no se borra de la base de datos)
  const eliminar = ({ id, espacio_codigo: espacio }) => {
    const lugar = espacio ? ` y se liberará su lugar en el casillero ${espacio}` : '';
    if (!window.confirm(`¿Eliminar el paquete ${id}? El registro quedará inactivo${lugar}.`)) return;
    ejecutar(() => eliminarPaquete(id), `Paquete ${id} eliminado`);
  };

  return (
    <section className="card">
      <header className="card__header">
        <h2 className="card__title">
          <FaBoxes aria-hidden="true" /> Registros activos
          <span className="badge badge--count">{filtrados.length}</span>
        </h2>
        <div className="card__tools">
          <Link to="/recepcion" className="btn btn--sm">
            <FaPlus aria-hidden="true" /> Nuevo paquete
          </Link>
        </div>
      </header>

      <div className="card__body filters">
        <div className="input-group filters__search">
          <input
            className="input"
            type="search"
            value={texto}
            onChange={(evento) => cambiarFiltro('q', evento.target.value.toUpperCase())}
            placeholder="Buscar por paquete o casillero (P001, A1…)"
            aria-label="Buscar por paquete o casillero"
          />
          <span className="input-group__icon" aria-hidden="true">
            <FaSearch />
          </span>
        </div>
        <select
          className="select filters__tipo"
          value={tipo}
          onChange={(evento) => cambiarFiltro('tipo', evento.target.value)}
          aria-label="Filtrar por tipo"
        >
          <option value="">Todos los tipos</option>
          <option value="NORMAL">Normal</option>
          <option value="FRAGIL">Frágil</option>
        </select>
      </div>

      <div className="card__body card__body--flush">
        <PaquetesTable
          paquetes={filtrados}
          error={errorPaquetes}
          vacio={paquetes.length ? 'Ningún paquete coincide con la búsqueda.' : 'No hay paquetes almacenados.'}
          renderAcciones={(paquete) => (
            <>
              <Link
                to={`/autorizaciones?retiro=${paquete.id}`}
                className="btn btn--warning btn--sm"
                title="Autorizar retiro"
              >
                <FaSignOutAlt aria-hidden="true" /> Retiro
              </Link>
              <button
                type="button"
                className="btn btn--danger btn--sm"
                onClick={() => eliminar(paquete)}
                aria-label={`Eliminar paquete ${paquete.id}`}
                title="Eliminar (lógico)"
              >
                <FaTrashAlt aria-hidden="true" />
              </button>
            </>
          )}
        />
      </div>

      <p className="card__note">
        Solo se muestran registros activos. Eliminar marca el registro como inactivo (eliminado lógico); no se
        borra de la base de datos.
      </p>
    </section>
  );
}
