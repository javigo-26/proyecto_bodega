import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  FaBars,
  FaBell,
  FaBoxes,
  FaExclamationTriangle,
  FaInbox,
  FaMoon,
  FaPowerOff,
  FaRulerCombined,
  FaSearch,
  FaSun,
  FaTachometerAlt,
  FaUserShield,
  FaWarehouse,
} from 'react-icons/fa';
import { useAuth } from '../context/AuthContext.jsx';
import { useBodega } from '../context/BodegaContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { iniciales } from '../utils/bodega.js';

// Opciones del menú lateral (en el orden del flujo de trabajo) y título de cada página
const MENU = [
  { to: '/', etiqueta: 'Dashboard', titulo: 'Área de control', icono: FaTachometerAlt },
  { to: '/recepcion', etiqueta: 'Recepción', titulo: 'Recepción de paquetes', icono: FaInbox },
  // Medición desactivada: la estación detecta tipo y tamaño al recibir el paquete
  // { to: '/medicion', etiqueta: 'Medición', titulo: 'Medición de paquetes', icono: FaRulerCombined },
  { to: '/autorizaciones', etiqueta: 'Retiro', titulo: 'Autorización de retiro', icono: FaUserShield },
  { to: '/paquetes', etiqueta: 'Paquetes', titulo: 'Paquetes almacenados', icono: FaBoxes },
];

const ESCRITORIO = '(min-width: 992px)';

// Estructura general: menú lateral, barra superior, avisos y contenido de la página
export default function Layout() {
  const { pathname } = useLocation();
  const { alarmas, conectado, apagarAlarma } = useBodega();
  const [menuAbierto, setMenuAbierto] = useState(false); // móvil: menú superpuesto
  const [menuColapsado, setMenuColapsado] = useState(false); // escritorio: menú oculto
  const pagina = MENU.find((opcion) => opcion.to === pathname) ?? MENU[0];

  // Al cambiar de página vuelve al inicio del contenido
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // Abre o cierra el menú según el tamaño de la pantalla
  const alternarMenu = () => {
    if (window.matchMedia(ESCRITORIO).matches) setMenuColapsado((valor) => !valor);
    else setMenuAbierto((valor) => !valor);
  };

  const clases = ['app', menuAbierto && 'app--menu-abierto', menuColapsado && 'app--menu-colapsado']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={clases}>
      <Sidebar onNavegar={() => setMenuAbierto(false)} />
      {menuAbierto && <div className="backdrop" onClick={() => setMenuAbierto(false)} aria-hidden="true" />}

      <div className="main">
        <Topbar onMenu={alternarMenu} />

        <main className="content">
          {!conectado && (
            <div className="banner banner--warning" role="status">
              <FaExclamationTriangle aria-hidden="true" />
              <span className="banner__text">Sin conexión con el servidor. Reintentando…</span>
            </div>
          )}

          {alarmas.length > 0 && (
            <div className="banner banner--alarm" role="alert">
              <FaBell aria-hidden="true" />
              <span className="banner__text">
                <strong>Alarma activa</strong> en {alarmas.map((espacio) => espacio.codigo).join(', ')}: retiro de paquete
                no autorizado.
              </span>
              <button type="button" className="btn btn--light btn--sm" onClick={apagarAlarma}>
                Apagar alarma
              </button>
            </div>
          )}

          <div className="content__header">
            <h1>{pagina.titulo}</h1>
            <nav className="breadcrumb" aria-label="Ruta de navegación">
              <Link to="/">Dashboard</Link>
              <span aria-hidden="true">/</span>
              <span>{pathname === '/' ? 'Panel administrativo' : pagina.etiqueta}</span>
            </nav>
          </div>

          <Outlet />
        </main>

        <footer className="footer">
          <strong>Bodega Inteligente</strong> · Proyecto Integrador UMG
        </footer>
      </div>
    </div>
  );
}

// Menú lateral con los datos del usuario y la navegación
function Sidebar({ onNavegar }) {
  const { usuario, cerrarSesion } = useAuth();

  return (
    <aside className="sidebar" aria-label="Menú principal">
      <Link to="/" className="sidebar__brand" onClick={onNavegar}>
        <FaWarehouse aria-hidden="true" />
        <span>Bodega Inteligente</span>
      </Link>

      <div className="sidebar__user">
        <span className="avatar" aria-hidden="true">{iniciales(usuario.nombre_completo)}</span>
        <span className="sidebar__user-name">{usuario.nombre_completo}</span>
      </div>

      <nav className="sidebar__nav">
        {MENU.map(({ to, etiqueta, icono: Icono }) => (
          <NavLink
            key={to}
            to={to}
            end
            onClick={onNavegar}
            className={({ isActive }) => `nav-link${isActive ? ' nav-link--active' : ''}`}
          >
            <Icono className="nav-link__icon" aria-hidden="true" />
            <span>{etiqueta}</span>
          </NavLink>
        ))}
        <button type="button" className="nav-link" onClick={cerrarSesion}>
          <FaPowerOff className="nav-link__icon" aria-hidden="true" />
          <span>Cerrar sesión</span>
        </button>
      </nav>
    </aside>
  );
}

// Barra superior: botón de menú, buscador de paquetes, alarmas y cambio de tema
function Topbar({ onMenu }) {
  const navigate = useNavigate();
  const { tema, alternarTema } = useTheme();
  const { alarmas } = useBodega();
  const [busqueda, setBusqueda] = useState({ tipo: '', texto: '' });

  // Lleva la búsqueda a la página de paquetes
  const buscar = (evento) => {
    evento.preventDefault();
    const parametros = new URLSearchParams();
    if (busqueda.texto.trim()) parametros.set('q', busqueda.texto.trim().toUpperCase());
    if (busqueda.tipo) parametros.set('tipo', busqueda.tipo);
    navigate(`/paquetes?${parametros}`);
  };

  // Actualiza un campo del buscador
  const cambiar = ({ target }) => setBusqueda((actual) => ({ ...actual, [target.name]: target.value }));

  return (
    <header className="topbar">
      <button type="button" className="icon-btn" onClick={onMenu} aria-label="Mostrar u ocultar menú">
        <FaBars aria-hidden="true" />
      </button>
      <Link to="/" className="topbar__link">
        Dashboard
      </Link>

      <form className="search" role="search" onSubmit={buscar}>
        <select name="tipo" value={busqueda.tipo} onChange={cambiar} aria-label="Tipo de paquete">
          <option value="">Todos</option>
          <option value="NORMAL">Normal</option>
          <option value="FRAGIL">Frágil</option>
        </select>
        <input
          type="search"
          name="texto"
          value={busqueda.texto}
          onChange={cambiar}
          placeholder="Encuentra tu paquete"
          aria-label="Buscar paquete por identificador"
        />
        <button type="submit" aria-label="Buscar">
          <FaSearch aria-hidden="true" />
        </button>
      </form>

      <div className="topbar__actions">
        <Link
          to="/"
          className={`icon-btn${alarmas.length ? ' icon-btn--alarm' : ''}`}
          aria-label={`${alarmas.length} alarmas activas`}
          title="Alarmas activas"
        >
          <FaBell aria-hidden="true" />
          {alarmas.length > 0 && <span className="icon-btn__badge">{alarmas.length}</span>}
        </Link>
        <button
          type="button"
          className="icon-btn"
          onClick={alternarTema}
          aria-label={tema === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'}
          title={tema === 'dark' ? 'Modo claro' : 'Modo oscuro'}
        >
          {tema === 'dark' ? <FaSun aria-hidden="true" /> : <FaMoon aria-hidden="true" />}
        </button>
      </div>
    </header>
  );
}
