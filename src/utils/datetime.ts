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
