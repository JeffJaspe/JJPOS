// Rasterizes build/icon.svg into a multi-resolution build/icon.ico for electron-builder.
// Run: node scripts/make-icon.mjs   (after: npm i -D sharp png-to-ico)
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(resolve(root, 'build/icon.svg'))

// Windows .ico standard sizes
const sizes = [16, 24, 32, 48, 64, 128, 256]

const pngs = await Promise.all(
  sizes.map((s) => sharp(svg, { density: 384 }).resize(s, s).png().toBuffer())
)

const ico = await pngToIco(pngs)
writeFileSync(resolve(root, 'build/icon.ico'), ico)

// Also emit a 512px PNG (handy for Linux/macOS or in-app use)
await sharp(svg, { density: 384 }).resize(512, 512).png().toFile(resolve(root, 'build/icon.png'))

console.log('Wrote build/icon.ico and build/icon.png')
