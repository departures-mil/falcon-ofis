# v1.59: Fatura (invoices) + ödeme yöntemi (pay_method) — ana süreç kodu.
# Masaüstü: electron/services.js + electron/schema.js. Telefon: index-*.js içindeki gömülü services / schema
# (telefondaki kopya daha eski olsa da buradaki çapalar ikisinde de aynıdır).
# kullanım: python3 araclar/patch-srv-159.py <services.js|index-*.js> [<schema.js>]
import sys

MIGRATION = r"""
migrations.push({
  version: 28,
  name: 'v1.59-fatura-odeme-yontemi',
  sql: `
    -- v1.59: Para çıkışının ödeme yöntemi: cash (nakit) | shamcash | bank (havale / banka) | other. NULL = eski kayıt
    -- (Sham Cash bilgisi varsa arayüz onu Sham Cash sayar). bank / other için işlem no ve not sc_ref / sc_note'ta durur.
    ALTER TABLE cash_transactions ADD COLUMN pay_method TEXT;
    -- Faturalar. items: JSON [{name, qty, unit, price, product_id}]. Tutarlar faturanın para biriminde.
    -- status: pending (tahsil edilmedi) | partial (kısmi) | paid (ödendi) | cancelled (iptal). paid = tahsil edilen toplam.
    CREATE TABLE invoices (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      number           TEXT NOT NULL,
      date             TEXT NOT NULL,
      due_date         TEXT,
      customer_name    TEXT NOT NULL,
      customer_phone   TEXT,
      customer_email   TEXT,
      customer_address TEXT,
      customer_tax     TEXT,
      person_id        INTEGER,
      currency_code    TEXT NOT NULL,
      items            TEXT NOT NULL,
      subtotal         REAL NOT NULL DEFAULT 0,
      discount         REAL NOT NULL DEFAULT 0,
      tax_rate         REAL NOT NULL DEFAULT 0,
      tax              REAL NOT NULL DEFAULT 0,
      total            REAL NOT NULL DEFAULT 0,
      paid             REAL NOT NULL DEFAULT 0,
      status           TEXT NOT NULL DEFAULT 'pending',
      template         TEXT,
      lang             TEXT,
      note             TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at       TEXT
    );
    CREATE INDEX idx_invoices_date ON invoices(date);
    -- Tahsilatlar: her biri kasaya bir giriş (cash_transaction_id, related_type = 'invoice') olarak yazılır.
    CREATE TABLE invoice_payments (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id          INTEGER NOT NULL,
      date                TEXT NOT NULL,
      amount              REAL NOT NULL,
      account_id          INTEGER,
      cash_transaction_id INTEGER,
      note                TEXT,
      created_at          TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at          TEXT
    );
    CREATE INDEX idx_invoice_payments_inv ON invoice_payments(invoice_id);
  `,
});
"""

INVOICE = r"""
  // ---------- v1.59: Fatura ----------
  // Fatura kesilirken "kasaya işle" seçilirse tahsilat hemen kasaya giriş olarak yazılır; seçilmezse fatura
  // "tahsil edilmedi" bekler ve sonradan (bir ya da birkaç kez, kısmi) kasaya işlenir.
  const INV_PAY_EPS = 0.005;
  function invoiceNumber(date) {
    const y = String(date || today()).slice(0, 4);
    const pre = String(db.get("SELECT value FROM settings WHERE key = 'invoice_prefix'")?.value || 'FAL').trim() || 'FAL';
    let n = 0;
    for (const r of db.all('SELECT number FROM invoices WHERE number LIKE ?', [`${pre}-${y}-%`])) {
      const m = /-(\d+)$/.exec(r.number || '');
      if (m) n = Math.max(n, Number(m[1]));
    }
    return `${pre}-${y}-${String(n + 1).padStart(4, '0')}`;
  }
  function invoiceItems(items) {
    const out = [];
    for (const it of Array.isArray(items) ? items : []) {
      const name = optText(it && it.name);
      if (!name) continue;
      const qty = Number(it.qty);
      const price = Number(it.price);
      if (!Number.isFinite(qty) || qty <= 0) throw new AppError('ERR_INVALID_QUANTITY');
      if (!Number.isFinite(price) || price < 0) throw new AppError('ERR_INVALID_AMOUNT');
      out.push({ name, qty, unit: optText(it.unit), price, product_id: optId(it.product_id) });
    }
    if (!out.length) throw new AppError('ERR_INVOICE_ITEMS');
    return out;
  }
  function invoiceTotals(items, discount, taxRate, cur) {
    const r = (n) => roundCur(n, cur);
    const subtotal = r(items.reduce((s, it) => s + it.qty * it.price, 0));
    const disc = Math.min(subtotal, r(nonNegative(discount || 0)));
    const rate = nonNegative(taxRate || 0);
    if (rate > 100) throw new AppError('ERR_INVALID_AMOUNT');
    const tax = r(((subtotal - disc) * rate) / 100);
    return { subtotal, discount: disc, tax_rate: rate, tax, total: r(subtotal - disc + tax) };
  }
  function refreshInvoice(id) {
    const inv = db.get('SELECT * FROM invoices WHERE id = ?', [id]);
    if (!inv) return;
    const paid = roundCur(db.get('SELECT COALESCE(SUM(amount), 0) AS s FROM invoice_payments WHERE invoice_id = ?', [id]).s, inv.currency_code);
    const status = inv.status === 'cancelled' ? 'cancelled' : inv.total > 0 && paid >= inv.total - INV_PAY_EPS ? 'paid' : paid > INV_PAY_EPS ? 'partial' : 'pending';
    db.run(`UPDATE invoices SET paid=?, status=?, updated_at=${now} WHERE id=?`, [paid, status, id]);
  }
  function invoicePay(invoiceId, { amount, date, account_id, note }) {
    const inv = db.get('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
    if (!inv) throw new AppError('ERR_NOT_FOUND');
    if (inv.status === 'cancelled') throw new AppError('ERR_INVOICE_CANCELLED');
    const amt = roundCur(positive(amount), inv.currency_code);
    const paid = db.get('SELECT COALESCE(SUM(amount), 0) AS s FROM invoice_payments WHERE invoice_id = ?', [invoiceId]).s;
    if (amt > inv.total - paid + INV_PAY_EPS) throw new AppError('ERR_INVOICE_OVERPAY');
    const acc = optId(account_id);
    if (acc && accountCurrency(acc) !== inv.currency_code) throw new AppError('ERR_INVALID_CURRENCY');
    const d = optText(date) || today();
    const payId = db.run(`INSERT INTO invoice_payments (invoice_id, date, amount, account_id, note, updated_at) VALUES (?,?,?,?,?,${now})`,
      [invoiceId, d, amt, acc, optText(note)]).lastInsertRowid;
    const txId = upsertLinkedTx(null, {
      currency: inv.currency_code, accountId: acc, direction: 'in', amount: amt, date: d, category: 'sale', personId: inv.person_id || null,
      description: `${inv.number} · ${inv.customer_name}` + (optText(note) ? ` · ${optText(note)}` : ''), relatedType: 'invoice', relatedId: payId,
    });
    db.run('UPDATE invoice_payments SET cash_transaction_id = ?, account_id = (SELECT account_id FROM cash_transactions WHERE id = ?) WHERE id = ?', [txId, txId, payId]);
    return payId;
  }
  function saveInvoice({ id, number, date, due_date, customer, customer_phone, customer_email, customer_address, customer_tax, currency, items,
    discount, tax_rate, note, template, lang, record_cash = false, account_id, pay_amount }) {
    const cur = required(currency);
    if (!db.get('SELECT code FROM currencies WHERE code = ?', [cur])) throw new AppError('ERR_INVALID_CURRENCY');
    const d = required(date);
    const name = required(typeof customer === 'string' ? customer : customer && customer.name, 'ERR_CUSTOMER_REQUIRED');
    // Müşteri Kişiler listesinde varsa ona bağlanır; yoksa listeye eklenmez
    const personId = customer && customer.id ? Number(customer.id) : db.get('SELECT id FROM people WHERE lower(name) = lower(?)', [name])?.id ?? null;
    const its = invoiceItems(items);
    const tt = invoiceTotals(its, discount, tax_rate, cur);
    const num = optText(number);
    const cols = [d, optText(due_date), name, optText(customer_phone), optText(customer_email), optText(customer_address), optText(customer_tax), personId,
      cur, JSON.stringify(its), tt.subtotal, tt.discount, tt.tax_rate, tt.tax, tt.total, optText(template), optText(lang), optText(note)];
    let invId = id;
    if (id) {
      const old = db.get('SELECT * FROM invoices WHERE id = ?', [id]);
      if (!old) throw new AppError('ERR_NOT_FOUND');
      const paid = db.get('SELECT COALESCE(SUM(amount), 0) AS s FROM invoice_payments WHERE invoice_id = ?', [id]).s;
      if (paid > 0 && old.currency_code !== cur) throw new AppError('ERR_INVOICE_HAS_PAYMENTS');
      if (paid > tt.total + INV_PAY_EPS) throw new AppError('ERR_INVOICE_BELOW_PAID');
      const n = num || old.number;
      if (db.get('SELECT id FROM invoices WHERE number = ? AND id <> ?', [n, id])) throw new AppError('ERR_INVOICE_NUMBER_TAKEN');
      db.run(`UPDATE invoices SET number=?, date=?, due_date=?, customer_name=?, customer_phone=?, customer_email=?, customer_address=?, customer_tax=?, person_id=?,
        currency_code=?, items=?, subtotal=?, discount=?, tax_rate=?, tax=?, total=?, template=?, lang=?, note=?, updated_at=${now} WHERE id=?`, [n, ...cols, id]);
      // Kasaya yazılmış tahsilatların açıklaması fatura bilgisiyle güncel kalır
      for (const p of db.all('SELECT cash_transaction_id AS t, note FROM invoice_payments WHERE invoice_id = ? AND cash_transaction_id IS NOT NULL', [id])) {
        db.run('UPDATE cash_transactions SET description = ?, person_id = ? WHERE id = ?', [`${n} · ${name}` + (p.note ? ` · ${p.note}` : ''), personId, p.t]);
      }
    } else {
      const n = num || invoiceNumber(d);
      if (db.get('SELECT id FROM invoices WHERE number = ?', [n])) throw new AppError('ERR_INVOICE_NUMBER_TAKEN');
      invId = db.run(`INSERT INTO invoices (number, date, due_date, customer_name, customer_phone, customer_email, customer_address, customer_tax, person_id,
        currency_code, items, subtotal, discount, tax_rate, tax, total, template, lang, note, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,${now})`, [n, ...cols]).lastInsertRowid;
      if (record_cash && tt.total > 0) {
        const amt = pay_amount === undefined || pay_amount === null || pay_amount === '' ? tt.total : Number(pay_amount);
        if (amt > 0) invoicePay(invId, { amount: amt, date: d, account_id });
      }
    }
    refreshInvoice(invId);
    return { id: invId, number: db.get('SELECT number FROM invoices WHERE id = ?', [invId]).number };
  }
  function addInvoicePayment({ invoice_id, amount, date, account_id, note }) {
    const id = invoicePay(invoice_id, { amount, date, account_id, note });
    refreshInvoice(invoice_id);
    return { id };
  }
  function deleteInvoicePayment({ id }) {
    const p = db.get('SELECT * FROM invoice_payments WHERE id = ?', [id]);
    if (!p) return { ok: true };
    db.run('DELETE FROM invoice_payments WHERE id = ?', [id]);
    deleteTx(p.cash_transaction_id);
    refreshInvoice(p.invoice_id);
    return { ok: true };
  }
  function setInvoiceCancelled({ id, cancelled }) {
    const inv = db.get('SELECT * FROM invoices WHERE id = ?', [id]);
    if (!inv) throw new AppError('ERR_NOT_FOUND');
    if (cancelled && db.get('SELECT id FROM invoice_payments WHERE invoice_id = ? LIMIT 1', [id])) throw new AppError('ERR_INVOICE_HAS_PAYMENTS');
    db.run(`UPDATE invoices SET status=?, updated_at=${now} WHERE id=?`, [cancelled ? 'cancelled' : 'pending', id]);
    refreshInvoice(id);
    return { ok: true };
  }
  function deleteInvoice({ id }) {
    const inv = db.get('SELECT id FROM invoices WHERE id = ?', [id]);
    if (!inv) return { ok: true };
    for (const p of db.all('SELECT cash_transaction_id AS t FROM invoice_payments WHERE invoice_id = ?', [id])) deleteTx(p.t);
    db.run('DELETE FROM invoice_payments WHERE invoice_id = ?', [id]);
    db.run('DELETE FROM invoices WHERE id = ?', [id]);
    return { ok: true };
  }
  // Para çıkışının ödeme yöntemi ve Sham Cash bilgileri sonradan da yazılabilir (İnfak, düzenli ödeme, borç ödemesi …)
  function setTxPayment(p) {
    const id = optId(p && p.id);
    if (!id || !db.get('SELECT id FROM cash_transactions WHERE id = ?', [id])) throw new AppError('ERR_NOT_FOUND');
    saveShamCash(id, p);
    return { ok: true };
  }

"""

REPL = [
    # 1) ödeme yöntemi: Sham Cash seçiliyse bilgiler yazılır; havale / diğer için işlem no ve not korunur
    ("    const on = p.sc_on !== false && tx.direction === 'out';",
     "    const PM = ['cash', 'shamcash', 'bank', 'other'];\n"
     "    const method = tx.direction === 'out' && PM.includes(p.pay_method) ? p.pay_method : null;\n"
     "    const on = (method ? method === 'shamcash' : p.sc_on !== false) && tx.direction === 'out';\n"
     "    const keepRef = on || method === 'bank' || method === 'other';"),
    ("ref: on ? optText(p.sc_ref) : null, note: on ? optText(p.sc_note) : null,",
     "ref: keepRef ? optText(p.sc_ref) : null, note: keepRef ? optText(p.sc_note) : null,"),
    ("    if (p.sc_on === undefined && p.sc_account === undefined && p.sc_name === undefined) return; // eski arayüz: dokunma",
     "    if (p.sc_on === undefined && p.sc_account === undefined && p.sc_name === undefined && p.pay_method === undefined) return; // eski arayüz: dokunma"),
    ("sc_qr_path=?, sc_qr_text=?, sc_payee_id=? WHERE id=?',\n      [v.account, v.name, v.phone, v.ref, v.note, qr || null, v.qrText, on ? payeeId : null, txId]);",
     "sc_qr_path=?, sc_qr_text=?, sc_payee_id=?, pay_method=? WHERE id=?',\n      [v.account, v.name, v.phone, v.ref, v.note, qr || null, v.qrText, on ? payeeId : null, method || (on && (v.account || v.name || qr || v.ref || v.phone) ? 'shamcash' : null), txId]);"),
    # 2) İnfak: kasaya yazılan çıkışa ödeme yöntemi / Sham Cash
    ("  function saveGift({ id, person, amount, currency, date, description, record_cash = true, newReceipts = [] }) {",
     "  function saveGift(giftPayload) {\n    const { id, person, amount, currency, date, description, record_cash = true, newReceipts = [] } = giftPayload;"),
    ("      db.run('UPDATE gifts SET cash_transaction_id = ? WHERE id = ?', [txId, giftId]);\n      addReceiptRows(txId, newReceipts);",
     "      db.run('UPDATE gifts SET cash_transaction_id = ? WHERE id = ?', [txId, giftId]);\n      addReceiptRows(txId, newReceipts);\n      saveShamCash(txId, giftPayload);"),
    # 3) Düzenli İnfak / Aidat ödemesi: kasaya yazıldıysa o çıkışa ödeme yöntemi / Sham Cash
    ("  function saveRecurringPayment({ id, plan_id, date, amount, currency, paid = true, record_cash = false, add_gift = false, note, newFiles = [], removeFileIds = [] }) {",
     "  function saveRecurringPayment(recPayload) {\n    const { id, plan_id, date, amount, currency, paid = true, record_cash = false, add_gift = false, note, newFiles = [], removeFileIds = [] } = recPayload;"),
    ("    applyPaidState(payId, !!paid);\n    return { id: payId, next_date:",
     "    applyPaidState(payId, !!paid);\n    {\n      const rtx = db.get('SELECT cash_transaction_id AS t FROM recurring_payments WHERE id = ?', [payId])?.t;\n      if (rtx) saveShamCash(rtx, recPayload);\n    }\n    return { id: payId, next_date:"),
    # 4) silinenler kutusu türleri + yazma listesi
    ("    deleteRecurringPayment: 'recurring_payments', deleteRecurringPlan: 'recurring_plans', deleteTask: 'tasks',",
     "    deleteRecurringPayment: 'recurring_payments', deleteRecurringPlan: 'recurring_plans', deleteTask: 'tasks',\n    deleteInvoice: 'invoices', deleteInvoicePayment: 'invoice_payments',"),
    ("    saveTask, setTaskStatus, deleteTask,\n  };",
     "    saveTask, setTaskStatus, deleteTask,\n    saveInvoice, addInvoicePayment, deleteInvoicePayment, setInvoiceCancelled, deleteInvoice, setTxPayment,\n  };"),
    ("  // ---------- v1.52: Silinenler kutusu", INVOICE + "  // ---------- v1.52: Silinenler kutusu"),
]


def patch_services(s, path):
    if 'function saveInvoice(' in s:
        print(path, 'services zaten yamalı'); return s
    for old, new in REPL:
        assert s.count(old) == 1, (path, old[:70], s.count(old))
        s = s.replace(old, new)
    return s


def patch_schema(s, path):
    if "v1.59-fatura-odeme-yontemi" in s:
        print(path, 'schema zaten yamalı'); return s
    anchor = "    CREATE INDEX idx_tasks_status ON tasks(status, due_date);\n  `,\n});\n"
    assert s.count(anchor) == 1, (path, 'schema anchor')
    return s.replace(anchor, anchor + MIGRATION)


if __name__ == '__main__':
    target = sys.argv[1]
    s = open(target, encoding='utf8').read()
    s = patch_services(s, target)
    if 'migrations.push(' in s:  # telefon paketi: schema da aynı dosyada
        s = patch_schema(s, target)
    open(target, 'w', encoding='utf8').write(s)
    for extra in sys.argv[2:]:
        x = open(extra, encoding='utf8').read()
        open(extra, 'w', encoding='utf8').write(patch_schema(x, extra))
    print('tamam', target)
