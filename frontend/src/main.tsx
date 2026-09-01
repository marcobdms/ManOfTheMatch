import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'

import './styles/tokens.css'
import './styles/app.css'
import { queryClient } from './lib/queryClient'
import { AuthProvider } from './lib/AuthProvider'
import { setupPwaUpdates } from './lib/pwaUpdate'
import App from './App'
import Live from './routes/Live'
import Home from './routes/Home'
import Upcoming from './routes/Upcoming'
import Teams from './routes/Teams'
import Standings from './routes/Standings'
import TeamLineup from './routes/TeamLineup'
import MatchStats from './routes/MatchStats'
import MatchPredictions from './routes/MatchPredictions'
import MatchLineups from './routes/MatchLineups'
import MatchHighlights from './routes/MatchHighlights'
import MatchDetail from './routes/MatchDetail'
import TeamHistory from './routes/TeamHistory'
import Profile from './routes/Profile'
import SignIn from './routes/SignIn'
import SignUp from './routes/SignUp'

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Live /> },
      { path: 'home', element: <Home /> },
      { path: 'proximos', element: <Upcoming /> },
      { path: 'equipos', element: <Teams /> },
      { path: 'clasificacion', element: <Standings /> },
      { path: 'equipos/:teamId', element: <TeamLineup /> },
      { path: 'partidos/:fixtureId/estadisticas', element: <MatchStats /> },
      { path: 'partidos/:fixtureId/previsiones', element: <MatchPredictions /> },
      { path: 'partidos/:fixtureId/alineaciones', element: <MatchLineups /> },
      { path: 'partidos/:fixtureId/highlights', element: <MatchHighlights /> },
      { path: 'partidos/:fixtureId', element: <MatchDetail /> },
      { path: 'historial/:teamId', element: <TeamHistory /> },
      { path: 'perfil', element: <Profile /> },
      { path: 'entrar', element: <SignIn /> },
      { path: 'registro', element: <SignUp /> },
    ],
  },
])

setupPwaUpdates()

// Red de seguridad ademas de `refetchOnWindowFocus` de React Query: en
// standalone de iOS ese mecanismo depende de que dispare `visibilitychange`,
// y no siempre lo hace a tiempo tras un rato largo en segundo plano.
// Invalidar aqui a mano es barato (solo re-pide lo que este realmente
// montado) y es justo el patron que ya funciona para el service worker.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void queryClient.invalidateQueries()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
