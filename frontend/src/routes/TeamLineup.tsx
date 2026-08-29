import { useState } from 'react'
import { ArrowLeft, Bell } from '@phosphor-icons/react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AnimatedBell from '../components/AnimatedBell'
import AppHeader from '../components/AppHeader'
import LineupSkeleton from '../components/LineupSkeleton'
import PitchLineup from '../components/PitchLineup'
import PlayerCard from '../components/PlayerCard'
import TeamCrest from '../components/TeamCrest'
import { useTeam, useTeamLineup } from '../lib/queries'
import { useAuth } from '../lib/AuthProvider'
import { enablePush, disablePush, getPushStatus } from '../lib/push'
import type { LineupFreshness } from '../types/view'

const FRESHNESS_LABEL: Record<LineupFreshness, string> = {
  confirmed: 'Alineación confirmada',
  predicted: 'Alineación probable',
  last_played: 'Sin alineación reciente',
}

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
  const starters = snapshot?.players.filter((p) => p.isStarter) ?? []
  const subs = snapshot?.players.filter((p) => !p.isStarter) ?? []

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

        {snapshot && (
          <div className={`motm-freshness motm-freshness--${snapshot.lineupType}`}>
            {FRESHNESS_LABEL[snapshot.lineupType]}
            {snapshot.lineupType === 'last_played' && snapshot.opponentName && (
              <span className="motm-freshness__detail">
                {' '}
                — último once ante {snapshot.opponentName}
                {snapshot.kickoffAt ? `, ${formatDate(snapshot.kickoffAt)}` : ''}
              </span>
            )}
            {snapshot.lineupType !== 'last_played' && snapshot.opponentName && (
              <span className="motm-freshness__detail">
                {' '}
                — {snapshot.isHome ? 'vs' : '@'} {snapshot.opponentName}
                {snapshot.kickoffAt ? `, ${formatDate(snapshot.kickoffAt)}` : ''}
              </span>
            )}
          </div>
        )}

        {loading && <LineupSkeleton />}

        {!loading && lineupQuery.isError && (
          <div className="motm-empty">
            <b>No se pudo cargar</b>
            Inténtalo de nuevo en unos minutos.
          </div>
        )}

        {!loading && !lineupQuery.isError && !snapshot && (
          <div className="motm-empty">
            <b>Sin alineación todavía</b>
            Todavía no tenemos la alineación de este equipo.
          </div>
        )}

        {!loading && snapshot && starters.length > 0 && <PitchLineup starters={starters} />}

        {!loading && snapshot && subs.length > 0 && (
          <div className="motm-subs">
            <h2 className="motm-label motm-subs__title">Suplentes</h2>
            <div className="motm-subs__row">
              {subs.map((p, i) => (
                <PlayerCard key={`${p.name}-${i}`} player={p} variant="sub" />
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
}
