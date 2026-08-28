import { Outlet } from 'react-router-dom'
import BottomNav from './components/BottomNav'

export default function App() {
  return (
    <div className="motm-shell">
      <main className="motm-shell__main">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
