import { Link } from 'react-router-dom';

// Tarjeta de indicador (estilo "small box"): valor, título, icono de fondo y acciones al pie
export default function StatCard({ valor, titulo, icono: Icono, color, acciones = [] }) {
  return (
    <article className={`stat-card stat-card--${color}`}>
      <div className="stat-card__inner">
        <span className="stat-card__value">{valor}</span>
        <span className="stat-card__title">{titulo}</span>
      </div>
      {Icono && <Icono className="stat-card__icon" aria-hidden="true" />}

      {acciones.length > 0 && (
        <footer className="stat-card__footer">
          {acciones.map(({ etiqueta, icono: IconoAccion, to, href, onClick }) => {
            const contenido = (
              <>
                {IconoAccion && <IconoAccion aria-hidden="true" />} {etiqueta}
              </>
            );
            if (to) return <Link key={etiqueta} to={to}>{contenido}</Link>;
            if (href) return <a key={etiqueta} href={href}>{contenido}</a>;
            if (onClick) return <button key={etiqueta} type="button" onClick={onClick}>{contenido}</button>;
            return <span key={etiqueta}>{contenido}</span>;
          })}
        </footer>
      )}
    </article>
  );
}
