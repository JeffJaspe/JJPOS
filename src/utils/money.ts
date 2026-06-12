/** Money is stored as integer centavos; these helpers convert at the UI edge. */

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })

export function formatPeso(centavos: number): string {
  return peso.format(centavos / 100)
}

/** Parse a peso amount typed by the user ("1,234.56") into centavos. NaN-safe. */
export function pesosToCentavos(value: string | number): number {
  const n = typeof value === 'string' ? Number.parseFloat(value.replace(/,/g, '')) : value
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

/** Centavos -> "1234.56" for populating <input> fields. */
export function centavosToInput(centavos: number | null | undefined): string {
  return centavos == null ? '' : (centavos / 100).toFixed(2)
}
