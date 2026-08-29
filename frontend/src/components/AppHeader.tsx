import { List, User } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthProvider'

export default function AppHeader() {
  const { session } = useAuth()

  return (
    <header className="motm-header">
      <button className="motm-iconbtn" aria-label="Menú">
        <List size={22} />
      </button>
      <div className="motm-wordmark">ManOfTheMatch</div>
      <Link className="motm-avatar" to={session ? '/perfil' : '/entrar'} aria-label="Perfil">
        <User size={18} />
      </Link>
    </header>
  )
}
