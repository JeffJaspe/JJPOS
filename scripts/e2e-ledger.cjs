/* eslint-disable */
// Headless data-layer E2E: applies every migration into an in-memory DB and
// exercises the Phase 5 AR money flow (charge sale -> ledger -> payment ->
// balance + running balance + FIFO aging). Run: node scripts/e2e-ledger.cjs
const Database = require('better-sqlite3')
const fs = require('node:fs')
const path = require('node:path')

let failures = 0
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  got=${JSON.stringify(got)}${ok ? '' : ' want=' + JSON.stringify(want)}`)
  if (!ok) failures++
}

const db = new Database(':memory:')
db.pragma('foreign_keys = ON')

// --- Apply migrations in order -------------------------------------------------
const migDir = path.join(__dirname, '..', 'electron', 'db', 'migrations')
const files = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort()
for (const f of files) {
  db.exec(fs.readFileSync(path.join(migDir, f), 'utf8'))
}
console.log(`Applied ${files.length} migrations: ${files.join(', ')}`)
check('migration count', files.length, 9)

// Schema sanity: Phase 5 + payment columns exist.
const ledgerCols = db.prepare('PRAGMA table_info(ledger_entries)').all().map((c) => c.name)
check('ledger has check detail columns', ['method', 'bank', 'check_no', 'check_date', 'check_due_date'].every((c) => ledgerCols.includes(c)), true)
const payKeys = db.prepare('SELECT key FROM settings').all().map((r) => r.key)
check('payment settings seeded', ['card_enabled', 'gcash_enabled', 'paymaya_enabled'].every((k) => payKeys.includes(k)), true)
const settingKeys = db.prepare('SELECT key FROM settings').all().map((r) => r.key)
check('card_reader settings seeded', ['card_reader_enabled', 'card_reader_name'].every((k) => settingKeys.includes(k)), true)
const perms = db.prepare("SELECT perm_key FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE r.locked=1").all().map((p) => p.perm_key)
check('Superadmin has manage_ledger', perms.includes('manage_ledger'), true)
check('Superadmin lacks require_customer (opt-in)', perms.includes('require_customer'), false)

// --- Seed a user + customer ----------------------------------------------------
const roleId = db.prepare('SELECT id FROM roles WHERE locked=1').get().id
const userId = Number(
  db.prepare("INSERT INTO users (username, password_hash, full_name, role_id, active) VALUES ('admin','x','Admin',?,1)").run(roleId).lastInsertRowid
)
const custId = Number(
  db.prepare("INSERT INTO customers (code,name,credit_limit,terms_days) VALUES ('C001','Acme',0,30)").run().lastInsertRowid
)

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 19).replace('T', ' ')
}
function postCharge(amount, when) {
  db.prepare("INSERT INTO ledger_entries (customer_id, datetime, type, ref_no, debit, credit, note, user_id) VALUES (?,?, 'charge', 'SI', ?, 0, 'charge sale', ?)").run(custId, when, amount, userId)
}
function postPayment(amount, method) {
  db.prepare("INSERT INTO ledger_entries (customer_id, type, ref_no, debit, credit, note, user_id, method, check_no, check_date) VALUES (?, 'payment', 'OR-1', 0, ?, 'collection', ?, ?, '', '')").run(custId, amount, userId, method)
}

// Two credit sales (45 and 10 days old) + a ₱200 collection.
postCharge(50000, daysAgo(45)) // ₱500, 45 days -> 31-60 bucket
postCharge(30000, daysAgo(10)) // ₱300, 10 days -> current
postPayment(20000, 'cash')     // ₱200 (FIFO applies to the 45-day charge)

// --- Balance ------------------------------------------------------------------
const balance = db.prepare('SELECT COALESCE(SUM(debit-credit),0) AS b FROM ledger_entries WHERE customer_id=?').get(custId).b
check('AR balance (₱600)', balance, 60000)

// --- Running balance (entries oldest-first) -----------------------------------
const entries = db.prepare('SELECT datetime, debit, credit FROM ledger_entries WHERE customer_id=? ORDER BY datetime, id').all(custId)
let running = 0
const runningSeq = entries.map((e) => (running += e.debit - e.credit))
check('running balances', runningSeq, [50000, 80000, 60000])

// --- FIFO aging (mirrors electron/ipc/ledger.ts) ------------------------------
function aging(es, now) {
  const charges = []
  for (const e of es) {
    const net = e.debit - e.credit
    if (net > 0) charges.push({ date: e.datetime, rem: net })
    else if (net < 0) {
      let pay = -net
      for (const c of charges) {
        if (pay <= 0) break
        const t = Math.min(c.rem, pay)
        c.rem -= t
        pay -= t
      }
    }
  }
  let current = 0, d30 = 0, d60 = 0, d90 = 0
  for (const c of charges) {
    if (c.rem <= 0) continue
    const age = (now - new Date(c.date.replace(' ', 'T') + 'Z').getTime()) / 86400000
    if (age <= 30) current += c.rem
    else if (age <= 60) d30 += c.rem
    else if (age <= 90) d60 += c.rem
    else d90 += c.rem
  }
  return { current, d30, d60, d90 }
}
const a = aging(entries, Date.now())
// payment applied to oldest (60-day) charge: 50000-20000=30000 left in 31-60 bucket; 30000 current.
check('aging current (₱300)', a.current, 30000)
check('aging 31-60 (₱300)', a.d30, 30000)
check('aging 61-90', a.d60, 0)
check('aging 90+', a.d90, 0)
check('aging reconciles to balance', a.current + a.d30 + a.d60 + a.d90, balance)

// --- A completed credit sale exercises the sales/sale_items/stock FKs ---------
const itemId = Number(
  db.prepare("INSERT INTO items (sku, name, sell_price, cost_price, qty_on_hand) VALUES ('SKU1','Widget',30000,18000,10)").run().lastInsertRowid
)
const saleId = Number(
  db.prepare("INSERT INTO sales (sale_no, customer_id, user_id, subtotal, discount, voucher_discount, tax, total, payment_type, amount_paid, change, status) VALUES ('SI-000001',?,?,30000,0,0,3214,30000,'charge',0,0,'completed')").run(custId, userId).lastInsertRowid
)
db.prepare("INSERT INTO sale_items (sale_id, item_id, qty, price, cost_at_sale, line_discount, line_total) VALUES (?,?,1,30000,18000,0,30000)").run(saleId, itemId)
db.prepare("INSERT INTO payments (sale_id, method, amount) VALUES (?, 'charge', 30000)").run(saleId)
db.prepare("INSERT INTO stock_movements (item_id, type, qty_change, ref_table, ref_id, user_id, note) VALUES (?, 'sale', -1, 'sales', ?, ?, 'SI-000001')").run(itemId, saleId, userId)
const soldRow = db.prepare('SELECT COUNT(*) AS n FROM sale_items WHERE sale_id=?').get(saleId)
check('credit sale persisted (FKs intact)', soldRow.n, 1)

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`))
db.close()
process.exit(failures === 0 ? 0 : 1)
