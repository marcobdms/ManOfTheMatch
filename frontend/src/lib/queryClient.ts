import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Estaba en false — pensado para no re-pedir al hacer click de vuelta
      // en una pestaña de escritorio, pero en una PWA de móvil "foco" es
      // literalmente "el usuario volvió a abrir la app", justo cuando más
      // interesa refrescar (el histórico se quedaba parado hasta navegar
      // entre pestañas, que remonta y fuerza el fetch por otro camino).
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
})
