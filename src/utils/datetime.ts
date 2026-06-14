/** DB timestamps are UTC ('YYYY-MM-DD HH:MM:SS'); the UI shows local time. */

function utcToDate(utc: string): Date {
  return new Date(utc.replace(' ', 'T') + 'Z')
}

/** 'MMM dd, yyyy' per the app convention. */
export function formatDate(utc: string): string {
  return utcToDate(utc).toLocaleDateString('en-PH', {
    month: 'short',
    day: '2-digit',
    year: 'numeric'
  })
}

export function formatDateTime(utc: string): string {
  return utcToDate(utc).toLocaleString('en-PH', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/** <input type="datetime-local"> value (local) -> UTC DB string, or null. */
export function localInputToUtc(value: string): string | null {
  if (!value) return null
  return new Date(value).toISOString().slice(0, 19).replace('T', ' ')
}

/** UTC DB string -> <input type="datetime-local"> value (local). */
export function utcToLocalInput(utc: string | null): string {
  if (!utc) return ''
  const d = utcToDate(utc)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Local 'YYYY-MM-DD' for an <input type="date"> default (today). */
export function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/**
 * Turn an inclusive local day range ('YYYY-MM-DD' .. 'YYYY-MM-DD') into the UTC
 * bounds reports query on: fromUtc = start of `from` day, toUtc = start of the
 * day after `to` (exclusive upper bound). Mirrors the UTC storage convention.
 */
export function dayRangeToUtc(from: string, to: string): { fromUtc: string; toUtc: string } {
  const start = new Date(`${from}T00:00:00`)
  const endExclusive = new Date(`${to}T00:00:00`)
  endExclusive.setDate(endExclusive.getDate() + 1)
  const fmt = (d: Date): string => d.toISOString().slice(0, 19).replace('T', ' ')
  return { fromUtc: fmt(start), toUtc: fmt(endExclusive) }
}
