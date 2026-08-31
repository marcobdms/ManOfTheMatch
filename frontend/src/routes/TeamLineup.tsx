import { useState } from 'react'
import { ArrowLeft, Bell, ClockCounterClockwise, UsersThree } from '@phosphor-icons/react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AnimatedBell from '../components/AnimatedBell'
import AppHeader from '../components/AppHeader'
import TeamCrest from '../components/TeamCrest'
import TeamLineupBody from '../components/TeamLineupBody'
import { useTeam, useTeamLineup } from '../lib/queries'
import { useAuth } from '../lib/AuthProvider'
import { enablePush, disablePush, getPushStatus } from '../lib/push'

/** Ficha de equipo: cancha con el once + banquillo. Fuente de datos:
 *  `team_lineup_snapshots` (Fotmob, plan §A1/§A3-A4). Una lectura, sin joins. */
export default function TeamLineup() {
  const { teamId } = useParams<{ teamId: string }>()
  const navigate = useNavigate()
  const teamQuery = useTeam(teamId)
  const lineupQuery = useTeamLineup(teamId)
  const { session, profile, updateProfile } = useAuth()
  const [bellBusy, setBellBusy] = useState(false)

  const team = teamQuery.data
  const snapshot = lineupQuery.data
  const loading = teamQuery.isLoading || lineupQuery.isLoading

  // El sistema de avisos es "un dispositivo, un equipo favorito" (perfil).
  // La campana aquí marca ESTE equipo como favorito y activa el push — el
  // "reciclaje" del botón de Live, aplicado a la ficha de cada equipo.
  const isFavorite = !!teamId && profile?.favorite_team_id === teamId

  async function toggleTeamBell() {
    if (bellBusy || !teamId) return
    setBellBusy(true)
    try {
      if (isFavorite) {
        await disablePush()
        await updateProfile({ favorite_team_id: null })
      } else {
        await updateProfile({ favorite_team_id: teamId })
        await enablePush(session?.user.id ?? null, teamId, profile?.prefs ?? {
          matchday: true,
          kickoff: true,
          lineup: true,
          goals: true,
        })
      }
    } catch {
      // getPushStatus no se usa para pintar aquí (isFavorite ya viene del
      // perfil) — un fallo solo deja el estado como estaba, sin romper la UI.
      await getPushStatus()
    } finally {
      setBellBusy(false)
    }
  }

  return (
    <>
      <AppHeader />
      <div className="motm-lineup">
        <div className="motm-lineup__head">
          <button
            type="button"
            className="motm-iconbtn motm-lineup__back"
            aria-label="Volver"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft size={22} />
          </button>
          <TeamCrest
            teamId={teamId}
            tla={team?.tla ?? '—'}
            color={team?.primary_color}
            size={56}
            className="motm-lineup__crest"
          />
          <div className="motm-lineup__identity">
            <h1 className="motm-lineup__name">{team?.short_name ?? team?.name ?? (loading ? '' : 'Equipo')}</h1>
            {snapshot?.formation && (
              <p className="motm-lineup__meta">
                {snapshot.formation}
                {snapshot.coach ? ` · ${snapshot.coach}` : ''}
              </p>
            )}
          </div>
          {session ? (
            <button
              type="button"
              className="motm-btn motm-btn--icon motm-lineup__bell"
              aria-pressed={isFavorite}
              aria-label={isFavorite ? 'Quitar de favoritos y avisos' : 'Marcar favorito y activar avisos'}
              aria-busy={bellBusy}
              disabled={bellBusy}
              onClick={toggleTeamBell}
            >
              <AnimatedBell active={isFavorite} size={18} />
            </button>
          ) : (
            <Link className="motm-btn motm-btn--icon motm-lineup__bell" to="/entrar" aria-label="Iniciar sesión para activar avisos">
              <Bell size={18} />
            </Link>
          )}
        </div>

        <div className="motm-actions">
          <button type="button" className="motm-btn" style={{ flex: 1 }} aria-current="page">
            <UsersThree size={16} />
            Alineación
          </button>
          <Link className="motm-btn motm-btn--muted" style={{ flex: 1 }} to={`/historial/${teamId}`}>
            <ClockCounterClockwise size={16} />
            Historial
          </Link>
        </div>

        <TeamLineupBody snapshot={snapshot} loading={loading} isError={lineupQuery.isError} />
      </div>
    </>
  )
}
