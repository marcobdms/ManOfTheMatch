import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import { signUp } from '../lib/auth'

export default function SignUp() {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setError(null)
    setBusy(true)
    try {
      const { error: err } = await signUp(email.trim(), password, displayName.trim())
      if (err) {
        setError(err)
        return
      }
      setDone(true)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <>
        <AppHeader />
        <div className="motm-auth">
          <h1 className="motm-auth__title">¡Ya casi!</h1>
          <div className="motm-auth__banner motm-auth__banner--pending" role="status">
            <b>Cuenta creada — pendiente de activación</b>
            De momento cada cuenta se activa a mano. En cuanto quede activada podrás entrar con tu email y
            contraseña.
          </div>
          <p className="motm-auth__switch">
            <Link to="/entrar">Ir a la pantalla de entrar</Link>
          </p>
        </div>
      </>
    )
  }

  return (
    <>
      <AppHeader />
      <div className="motm-auth">
        <h1 className="motm-auth__title">Crear cuenta</h1>
        <p className="motm-auth__subtitle">
          Regístrate para elegir tu equipo favorito y recibir sus avisos en este dispositivo.
        </p>

        {error && (
          <div className="motm-auth__banner" role="alert">
            {error}
          </div>
        )}

        <form className="motm-auth__form" onSubmit={handleSubmit} noValidate>
          <div className="motm-field">
            <label className="motm-field__label" htmlFor="signup-name">
              Nombre
            </label>
            <input
              id="signup-name"
              className="motm-input"
              type="text"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Tu nombre"
            />
          </div>

          <div className="motm-field">
            <label className="motm-field__label" htmlFor="signup-email">
              Email
            </label>
            <input
              id="signup-email"
              className="motm-input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
            />
          </div>

          <div className="motm-field">
            <label className="motm-field__label" htmlFor="signup-password">
              Contraseña
            </label>
            <input
              id="signup-password"
              className="motm-input"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          <button type="submit" className="motm-btn motm-auth__submit" disabled={busy} aria-busy={busy}>
            {busy ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>
        </form>

        <p className="motm-auth__switch">
          ¿Ya tienes cuenta? <Link to="/entrar">Entra</Link>
        </p>
      </div>
    </>
  )
}
