// Vercel Edge Function: previsión con IA (Groq) bajo demanda.
// Se queda fuera del bundle del SPA (Vite no toca /api) y fuera del worker
// de Coolify (ese es cron puro, sin servidor HTTP) — vive aquí porque el
// frontend ya despliega a Vercel y así la key de Groq nunca sale del server.
//
// Grounding: solo usa match_odds/match_predictions ya sincronizados por el
// backend (mismos datos que pinta MatchPredictions.tsx) — nunca sale a
// buscar nada por su cuenta ni inventa estadísticas fuera de ese contexto.
// Cachea el resultado en match_ai_predictions: una generación por partido,
// el resto de visitas la leen gratis.
import { impliedResultPercent, translateFact } from '../src/lib/predictions'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'

type PredictedResult = 'home' | 'draw' | 'away'

type AiRow = {
  fixture_id: string
  paragraph: string
  predicted_result: PredictedResult
  pros: string[]
  cons: string[]
  model: string
  generated_at: string
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function toApi(row: AiRow) {
  return {
    fixtureId: row.fixture_id,
    paragraph: row.paragraph,
    predictedResult: row.predicted_result,
    pros: row.pros ?? [],
    cons: row.cons ?? [],
    model: row.model,
    generatedAt: row.generated_at,
  }
}

// --- REST a Supabase directo (sin @supabase/supabase-js): evita el riesgo
// conocido de bundlear su cliente realtime, node-only, en runtime edge. ---
async function sbFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY as string,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  return res
}

function asOne<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: 'Supabase no configurado en el servidor' }, 500)
  if (!GROQ_API_KEY) return json({ error: 'GROQ_API_KEY no configurada en el servidor' }, 500)

  let fixtureId = ''
  try {
    const body = await req.json()
    fixtureId = String(body?.fixtureId ?? '')
  } catch {
    return json({ error: 'Body inválido' }, 400)
  }
  if (!fixtureId) return json({ error: 'fixtureId requerido' }, 400)

  // 1) caché — una previsión por partido.
  const cachedRes = await sbFetch(`match_ai_predictions?fixture_id=eq.${fixtureId}&select=*`)
  if (cachedRes.ok) {
    const rows = (await cachedRes.json()) as AiRow[]
    if (rows[0]) return json(toApi(rows[0]), 200)
  }

  // 2) partido + nombres de equipo.
  const fxSelect = 'id,status,home:teams!home_team_id(short_name),away:teams!away_team_id(short_name)'
  const fxRes = await sbFetch(`fixtures?id=eq.${fixtureId}&select=${fxSelect}`)
  const fixtures = fxRes.ok ? await fxRes.json() : []
  const fixture = fixtures[0]
  if (!fixture) return json({ error: 'Partido no encontrado' }, 404)
  if (fixture.status !== 'SCHEDULED') return json({ error: 'Solo disponible antes de que empiece el partido' }, 422)

  const homeName = asOne(fixture.home)?.short_name ?? 'el local'
  const awayName = asOne(fixture.away)?.short_name ?? 'el visitante'

  // 3) cuotas + comparativa/argumentos ya sincronizados.
  const oddsRes = await sbFetch(
    `match_odds?fixture_id=eq.${fixtureId}&select=bookmaker_id,bookmaker_name,home_odd,draw_odd,away_odd`,
  )
  const oddsRows = oddsRes.ok ? await oddsRes.json() : []
  const odds = oddsRows.map((r: any) => ({
    bookmakerId: r.bookmaker_id,
    bookmakerName: r.bookmaker_name,
    home: r.home_odd,
    draw: r.draw_odd,
    away: r.away_odd,
  }))

  const predRes = await sbFetch(`match_predictions?fixture_id=eq.${fixtureId}&select=*`)
  const predRows = predRes.ok ? await predRes.json() : []
  const pred = predRows[0] ?? null

  if (!odds.length && !pred) return json({ error: 'Todavía no hay datos suficientes para este partido' }, 422)

  const implied = impliedResultPercent(odds)
  const facts: string[] = (pred?.fotmob_facts ?? [])
    .map((f: { templateId: string; values: string[] }) => translateFact(f, homeName, awayName))
    .filter((s: string | null): s is string => !!s)

  const context = {
    partido: `${homeName} vs ${awayName}`,
    probabilidad_implicita_de_las_cuotas: implied,
    cuotas_por_casa: odds,
    comparativa: pred
      ? {
          forma_ultimos_5: { [homeName]: pred.form_home, [awayName]: pred.form_away },
          ataque: { [homeName]: pred.att_home, [awayName]: pred.att_away },
          defensa: { [homeName]: pred.def_home, [awayName]: pred.def_away },
        }
      : null,
    argumentos_estadisticos: facts,
  }

  const system = `Eres un analista de fútbol de LaLiga. Se te da un JSON con datos reales de un partido (cuotas, forma, ataque/defensa, argumentos estadísticos) y debes argumentar una previsión.
REGLAS ESTRICTAS:
- Usa EXCLUSIVAMENTE los datos del contexto que recibes. No inventes lesiones, bajas, resultados ni estadísticas que no estén ahí.
- Si los datos son escasos, dilo en el párrafo en vez de rellenar con suposiciones.
- Responde SOLO con JSON válido (nada de texto fuera del JSON), con esta forma exacta:
{"paragraph": "2-4 frases en español argumentando tu pronóstico", "predictedResult": "home"|"draw"|"away", "pros": ["2-4 razones a favor de ese resultado"], "cons": ["1-3 riesgos o razones en contra"]}`

  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(context) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,
      max_tokens: 700,
    }),
  })
  if (!groqRes.ok) {
    console.error('[predict] groq error', groqRes.status, await groqRes.text().catch(() => ''))
    return json({ error: 'El servicio de IA no respondió' }, 502)
  }
  const groqJson = await groqRes.json()
  const raw = groqJson?.choices?.[0]?.message?.content
  let parsed: { paragraph?: unknown; predictedResult?: unknown; pros?: unknown; cons?: unknown }
  try {
    parsed = JSON.parse(raw)
  } catch {
    return json({ error: 'La IA devolvió una respuesta inválida' }, 502)
  }
  const validResult = parsed.predictedResult === 'home' || parsed.predictedResult === 'draw' || parsed.predictedResult === 'away'
  const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')
  if (typeof parsed.paragraph !== 'string' || !validResult || !isStringArray(parsed.pros) || !isStringArray(parsed.cons)) {
    console.error('[predict] respuesta con forma invalida', parsed)
    return json({ error: 'La IA devolvió una respuesta con forma inesperada' }, 502)
  }

  const row: AiRow = {
    fixture_id: fixtureId,
    paragraph: parsed.paragraph,
    predicted_result: parsed.predictedResult as PredictedResult,
    pros: parsed.pros,
    cons: parsed.cons,
    model: GROQ_MODEL,
    generated_at: new Date().toISOString(),
  }

  await sbFetch('match_ai_predictions', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(row),
  })

  return json(toApi(row), 200)
}
