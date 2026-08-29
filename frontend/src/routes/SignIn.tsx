import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import { signIn } from '../lib/auth'

export default function SignIn() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setError(null)
    setBusy(true)
    try {
      const { error: err } = await signIn(email.trim(), password)
      if (err) {
        setError(err)
        return
      }
      navigate('/perfil', { replace: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <AppHeader />
      <div className="motm-auth">
        <h1 className="motm-auth__title">Entrar</h1>
        <p className="motm-auth__subtitle">Accede con tu cuenta para gestionar tu equipo favorito y tus avisos.</p>

        {error && (
          <div className="motm-auth__banner" role="alert">
            {error}
          </div>
        )}

        <form className="motm-auth__form" onSubmit={handleSubmit} noValidate>
          <div className="motm-field">
            <label className="motm-field__label" htmlFor="signin-email">
              Email
            </label>
            <input
              id="signin-email"
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
            <label className="motm-field__label" htmlFor="signin-password">
              Contraseña
            </label>
            <input
              id="signin-password"
              className="motm-input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <button type="submit" className="motm-btn motm-auth__submit" disabled={busy} aria-busy={busy}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="motm-auth__switch">
          ¿No tienes cuenta? <Link to="/registro">Regístrate</Link>
        </p>
      </div>
    </>
  )
}
