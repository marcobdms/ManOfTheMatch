import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'

import './styles/tokens.css'
import './styles/app.css'
import { queryClient } from './lib/queryClient'
import App from './App'
import Live from './routes/Live'
import Home from './routes/Home'
import Upcoming from './routes/Upcoming'
import Teams from './routes/Teams'
import Profile from './routes/Profile'

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Live /> },
      { path: 'home', element: <Home /> },
      { path: 'proximos', element: <Upcoming /> },
      { path: 'equipos', element: <Teams /> },
      { path: 'perfil', element: <Profile /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
