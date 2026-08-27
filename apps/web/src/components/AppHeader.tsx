import { List, User } from '@phosphor-icons/react'

export default function AppHeader() {
  return (
    <header className="motm-header">
      <button className="motm-iconbtn" aria-label="Menú">
        <List size={22} />
      </button>
      <div className="motm-wordmark">ManOfTheMatch</div>
      <button className="motm-avatar" aria-label="Perfil">
        <User size={18} />
      </button>
    </header>
  )
}
