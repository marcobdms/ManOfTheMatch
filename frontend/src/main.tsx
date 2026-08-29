import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'

import './styles/tokens.css'
import './styles/app.css'
import { queryClient } from './lib/queryClient'
import { AuthProvider } from './lib/AuthProvider'
import App from './App'
import Live from './routes/Live'
import Home from './routes/Home'
import Upcoming from './routes/Upcoming'
import Teams from './routes/Teams'
import TeamLineup from './routes/TeamLineup'
import MatchStats from './routes/MatchStats'
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
      { path: 'equipos/:teamId', element: <TeamLineup /> },
      { path: 'partidos/:fixtureId/estadisticas', element: <MatchStats /> },
      { path: 'perfil', element: <Profile /> },
      { path: 'entrar', element: <SignIn /> },
      { path: 'registro', element: <SignUp /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
