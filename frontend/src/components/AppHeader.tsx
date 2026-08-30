import { useState } from 'react'
import { List, User } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthProvider'
import NavDrawer from './NavDrawer'

export default function AppHeader() {
  const { session } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <header className="motm-header">
      <button className="motm-iconbtn" aria-label="Menú" onClick={() => setDrawerOpen(true)}>
        <List size={22} />
      </button>
      <div className="motm-wordmark">ManOfTheMatch</div>
      <Link className="motm-avatar" to={session ? '/perfil' : '/entrar'} aria-label="Perfil">
        <User size={18} />
      </Link>
      <NavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </header>
  )
}
