/**
 * EAN-13 helpers, shared by the main process (generating internal barcodes)
 * and the renderer (choosing the right jsbarcode format when printing labels).
 */

/** Check digit for a 12-digit EAN-13 body. */
export function ean13CheckDigit(body12: string): number {
  if (!/^\d{12}$/.test(body12)) {
    throw new Error('EAN-13 body must be exactly 12 digits')
  }
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += Number(body12[i]) * (i % 2 === 0 ? 1 : 3)
  }
  return (10 - (sum % 10)) % 10
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12])
}
