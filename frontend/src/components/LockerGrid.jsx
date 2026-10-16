import { useMemo } from 'react';
import { FaBox, FaWineGlassAlt } from 'react-icons/fa';
import { ORDEN_CASILLEROS, capacidadActual, etiqueta, nivelEspacio } from '../utils/bodega.js';

// LED encendido según la ocupación: verde vacío, amarillo aún acepta, rojo lleno o en alarma
const LED_POR_NIVEL = { DISPONIBLE: 'verde', PARCIAL: 'amarillo', LLENO: 'rojo', ALARMA: 'rojo' };
const COLORES_LED = ['verde', 'amarillo', 'rojo'];

// Posición del casillero en el mueble (los desconocidos van al final)
const posicion = (codigo) => {
  const indice = ORDEN_CASILLEROS.indexOf(codigo);
  return indice === -1 ? ORDEN_CASILLEROS.length : indice;
};

// Dibuja los casilleros con sus cajas; se redibuja con cada actualización en vivo.
// Opcional: `destino` resalta el casillero que recibirá un paquete (módulo de recepción).
export default function LockerGrid({ espacios, paquetes, destino }) {
  // Agrupa los ids de paquetes activos por casillero
  const idsPorCasillero = useMemo(() => {
    const mapa = {};
    paquetes.forEach((paquete) => {
      if (!paquete.espacio_codigo) return;
      mapa[paquete.espacio_codigo] = [...(mapa[paquete.espacio_codigo] ?? []), paquete.id];
    });
    return mapa;
  }, [paquetes]);

  // Ordena según la posición física
  const ordenados = useMemo(
    () => [...espacios].sort((a, b) => posicion(a.codigo) - posicion(b.codigo)),
    [espacios]
  );

  if (!espacios.length) return <p className="empty">Esperando datos de los casilleros…</p>;

  return (
    <div className="lockers">
      {ordenados.map((espacio) => (
        <Locker
          key={espacio.codigo}
          espacio={espacio}
          ids={idsPorCasillero[espacio.codigo] ?? []}
          destino={espacio.codigo === destino}
        />
      ))}
    </div>
  );
}

// Casillero individual: LEDs de estado, cajas guardadas y ocupación
function Locker({ espacio, ids, destino }) {
  const { codigo, tipo, modo_tamano: modo, ocupacion_actual: ocupacion } = espacio;
  const capacidad = capacidadActual(espacio);
  const nivel = nivelEspacio(espacio);
  const fragil = tipo === 'FRAGIL';
  const ledEncendido = LED_POR_NIVEL[nivel];
  const IconoCaja = fragil ? FaWineGlassAlt : FaBox;
  const tamanoVisual = capacidad === null ? 'vacio' : (modo ?? 'grande').toLowerCase();
  const cupo =
    nivel === 'PARCIAL'
      ? `, acepta ${capacidad - ocupacion} más de tipo ${etiqueta(tipo).toLowerCase()} y tamaño ${etiqueta(modo).toLowerCase()}`
      : '';
  const clases = [
    'locker',
    `locker--${nivel.toLowerCase()}`,
    fragil && 'locker--fragil',
    destino && 'locker--destino',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article
      className={clases}
      aria-label={`Casillero ${codigo}: ${etiqueta(nivel)}, ${ocupacion} de ${capacidad ?? 0} paquetes${cupo}${destino ? ', destino del paquete señalado' : ''}`}
    >
      <header className="locker__header">
        <span className="locker__code">{codigo}</span>
        <span className={`badge badge--${fragil ? 'fragil' : 'normal'}`}>{etiqueta(tipo)}</span>
        <span className="leds" aria-hidden="true">
          {COLORES_LED.map((color) => (
            <span key={color} className={`led led--${color}${ledEncendido === color ? ' led--on' : ''}`} />
          ))}
        </span>
      </header>

      <div className={`locker__body locker__body--${tamanoVisual}`} style={{ '--slots': capacidad ?? 1 }}>
        {destino && <span className="locker__tag">Destino</span>}
        {capacidad === null ? (
          <span className="locker__empty">Vacío</span>
        ) : (
          Array.from({ length: capacidad }, (_, i) =>
            i < ocupacion ? (
              <div key={`caja-${i}`} className="box" title={ids[i]}>
                <IconoCaja aria-hidden="true" />
                <span>{ids[i] ?? ''}</span>
              </div>
            ) : (
              <div key={`libre-${i}`} className="box box--libre" />
            )
          )
        )}
      </div>

      <footer className="locker__footer">
        <span>{capacidad === null ? 'Acepta cualquier tamaño' : `${ocupacion}/${capacidad} · ${etiqueta(modo)}`}</span>
        <span className={`badge badge--${nivel}`}>{etiqueta(nivel)}</span>
      </footer>
    </article>
  );
}
