import laligaLogo from '../assets/crests/laliga.svg'
import championsLogo from '../assets/crests/champions.svg'

/** Logo de la competición del partido, o null si no lo reconocemos (usado por
 *  ScoreboardCard y las filas de Próximos). Único sitio a tocar al sumar una
 *  competición nueva (Premier, Bundesliga...). */
export function compLogo(short: string): string | null {
  if (short === 'LaLiga') return laligaLogo
  if (short === 'Champions') return championsLogo
  return null
}
