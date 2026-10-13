import { useState } from 'react';
import { FaBell, FaLock, FaMoon, FaSignInAlt, FaSun, FaUser, FaWarehouse } from 'react-icons/fa';
import { useAlert } from '../context/AlertContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useBodega } from '../context/BodegaContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';

// Pantalla de inicio de sesión
export default function Login() {
  const { iniciarSesion } = useAuth();
  const { notificar } = useAlert();
  const { alarmas } = useBodega();
  const { tema, alternarTema } = useTheme();
  const [credenciales, setCredenciales] = useState({ username: '', password: '' });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  // Actualiza el campo que se está escribiendo
  const cambiar = ({ target }) => setCredenciales((actual) => ({ ...actual, [target.name]: target.value }));

  // Valida y envía las credenciales; al tener éxito la ruta redirige al dashboard
  const enviar = async (evento) => {
    evento.preventDefault();
    const username = credenciales.username.trim();
    if (!username || !credenciales.password) {
      setError('Ingresa tu usuario y contraseña.');
      return;
    }

    setEnviando(true);
    setError('');
    try {
      const usuario = await iniciarSesion(username, credenciales.password);
      notificar({ tipo: 'success', titulo: `Bienvenido, ${usuario.nombre_completo}` });
    } catch (err) {
      setError(err.message);
      notificar({ tipo: 'error', titulo: 'No se pudo iniciar sesión', mensaje: err.message });
      setEnviando(false);
    }
  };

  return (
    <div className="login">
      <button
        type="button"
        className="icon-btn login__theme"
        onClick={alternarTema}
        aria-label={tema === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'}
      >
        {tema === 'dark' ? <FaSun aria-hidden="true" /> : <FaMoon aria-hidden="true" />}
      </button>

      <div className="login__box">
        <h1 className="login__brand">
          <FaWarehouse aria-hidden="true" />
          <span>
            <b>Bodega</b> Inteligente
          </span>
        </h1>

        {alarmas.length > 0 && (
          <div className="banner banner--alarm" role="alert">
            <FaBell aria-hidden="true" />
            <span className="banner__text">
              Alarma activa en {alarmas.map((espacio) => espacio.codigo).join(', ')}. Inicia sesión para atenderla.
            </span>
          </div>
        )}

        <form className="card" onSubmit={enviar} noValidate>
          <div className="card__body">
            <p className="login__msg">Inicia sesión para comenzar</p>

            <div className="field">
              <label htmlFor="login-usuario" className="sr-only">
                Usuario
              </label>
              <div className="input-group">
                <input
                  id="login-usuario"
                  className="input"
                  name="username"
                  placeholder="Usuario"
                  autoComplete="username"
                  value={credenciales.username}
                  onChange={cambiar}
                  autoFocus
                />
                <span className="input-group__icon" aria-hidden="true">
                  <FaUser />
                </span>
              </div>
            </div>

            <div className="field">
              <label htmlFor="login-clave" className="sr-only">
                Contraseña
              </label>
              <div className="input-group">
                <input
                  id="login-clave"
                  className="input"
                  type="password"
                  name="password"
                  placeholder="Contraseña"
                  autoComplete="current-password"
                  value={credenciales.password}
                  onChange={cambiar}
                />
                <span className="input-group__icon" aria-hidden="true">
                  <FaLock />
                </span>
              </div>
            </div>

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className="btn btn--block" disabled={enviando}>
              <FaSignInAlt aria-hidden="true" /> {enviando ? 'Validando…' : 'Ingresar'}
            </button>
          </div>
        </form>

        <p className="login__footer">Sistema Inteligente de Almacenamiento de Bodega</p>
      </div>
    </div>
  );
}
