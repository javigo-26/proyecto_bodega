import { FaExclamationTriangle } from 'react-icons/fa';
import { etiqueta, formatearFecha } from '../utils/bodega.js';

// Fecha y hora; si la columna es angosta, la hora pasa a la segunda línea
function FechaHora({ valor }) {
  const [fecha, hora] = formatearFecha(valor).split(', ');
  return (
    <>
      <span className="nowrap">{fecha}</span> <span className="nowrap">{hora}</span>
    </>
  );
}

// Tabla de paquetes activos; la columna de acciones es opcional
export default function PaquetesTable({ paquetes, error, vacio = 'No hay paquetes almacenados.', renderAcciones }) {
  if (error) {
    return (
      <p className="empty">
        <FaExclamationTriangle aria-hidden="true" /> No se pudo cargar la lista de paquetes. {error}
      </p>
    );
  }
  if (!paquetes.length) return <p className="empty">{vacio}</p>;

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Paquete</th>
            <th>Descripción</th>
            <th>Tipo</th>
            <th>Tamaño</th>
            <th>Casillero</th>
            <th>Estado</th>
            <th>Ingreso</th>
            {renderAcciones && <th className="table__actions">Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {paquetes.map((paquete) => (
            <tr key={paquete.id}>
              <td>
                <strong className="mono">{paquete.id}</strong>
              </td>
              <td className="table__descripcion">
                {paquete.descripcion ? <span title={paquete.descripcion}>{paquete.descripcion}</span> : '—'}
              </td>
              <td>
                <span className={`badge badge--${paquete.tipo === 'FRAGIL' ? 'fragil' : 'normal'}`}>
                  {etiqueta(paquete.tipo)}
                </span>
              </td>
              <td>{etiqueta(paquete.tamano)}</td>
              <td>{paquete.espacio_codigo ?? '—'}</td>
              <td>
                <span className={`badge badge--${paquete.estado}`}>{etiqueta(paquete.estado)}</span>
              </td>
              <td>
                <FechaHora valor={paquete.fecha_ingreso ?? paquete.fecha_registro} />
              </td>
              {renderAcciones && <td className="table__actions">{renderAcciones(paquete)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
