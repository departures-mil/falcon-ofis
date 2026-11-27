# v1.60: Fatura — müşteri kayıtları, ürün kartı (KDV / depo / özel alanlar), fiyat geçmişi, satır bazında KDV, fatura başlık bilgileri (meta).
# Masaüstü: electron/services.js + electron/schema.js. Telefon: index-*.js içindeki gömülü services / schema (çapalar ikisinde aynı).
# kullanım: python3 araclar/patch-srv-160.py <services.js|index-*.js> [<schema.js>]
import sys

MIGRATION = r"""
migrations.push({
  version: 29,
  name: 'v1.60-fatura-musteri-urun',
  sql: `
    -- v1.60: Müşteri kayıtları (fatura alıcıları). Aynı VKN / ad ikinci kez açılmaz (servis eşleştirir). extra: kullanıcının eklediği alanlar (JSON).
    CREATE TABLE customers (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      tax_office  TEXT,
      tax_no      TEXT,
      address     TEXT,
      district    TEXT,
      city        TEXT,
      postal_code TEXT,
      country     TEXT,
      phone       TEXT,
      email       TEXT,
      web         TEXT,
      note        TEXT,
      extra       TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at  TEXT
    );
    CREATE INDEX idx_customers_tax ON customers(tax_no);
    CREATE INDEX idx_customers_name ON customers(name);
    -- Faturanın müşteri kaydı ve başlık bilgileri (ETTN, senaryo, fatura tipi, özelleştirme no, oluşma zamanı, kampanya kodu, kargo …) JSON
    ALTER TABLE invoices ADD COLUMN customer_id INTEGER;
    ALTER TABLE invoices ADD COLUMN meta TEXT;
    -- Ürün kartı: KDV oranı, depo ve kullanıcının eklediği alanlar (JSON)
    ALTER TABLE products ADD COLUMN vat_rate REAL;
    ALTER TABLE products ADD COLUMN depot TEXT;
    ALTER TABLE products ADD COLUMN extra TEXT;
    -- Fiyat geçmişi: eski fiyat silinmez. source: invoice (faturadan) | manual (ürün kartından)
    CREATE TABLE product_prices (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id    INTEGER NOT NULL,
      date          TEXT NOT NULL,
      price         REAL NOT NULL,
      currency_code TEXT,
      qty           REAL,
      invoice_id    INTEGER,
      customer_id   INTEGER,
      source        TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at    TEXT
    );
    CREATE INDEX idx_product_prices_p ON product_prices(product_id, date);
    CREATE INDEX idx_product_prices_inv ON product_prices(invoice_id);
  `,
});
"""

CODE = r"""
  // ---------- v1.60: Müşteriler, ürün kartı, fiyat geçmişi ----------
  const CUST_COLS = ['name', 'tax_office', 'tax_no', 'address', 'district', 'city', 'postal_code', 'country', 'phone', 'email', 'web', 'note'];
  // Ad karşılaştırması: büyük / küçük harf, noktalama ve boşluk farkı önemsiz (Türkçe harfler korunur)
  const normKey = (s) => String(s || '').toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const taxKey = (s) => String(s || '').replace(/\s+/g, '');
  function extraJson(x) {
    if (x === undefined) return undefined;
    if (x === null || x === '') return null;
    if (typeof x === 'string') { try { x = JSON.parse(x); } catch { return null; } }
    if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
    const o = {};
    for (const [k, v] of Object.entries(x)) {
      const s = optText(v === null || v === undefined ? '' : String(v));
      if (s) o[String(k).slice(0, 60)] = s.slice(0, 2000);
    }
    return Object.keys(o).length ? JSON.stringify(o) : null;
  }
  function findCustomer({ tax_no, name }) {
    const tn = taxKey(tax_no);
    if (tn) {
      const r = db.get("SELECT id FROM customers WHERE replace(COALESCE(tax_no, ''), ' ', '') = ? ORDER BY id LIMIT 1", [tn]);
      if (r) return r.id;
    }
    const nk = normKey(name);
    if (!nk) return null;
    for (const r of db.all('SELECT id, name, tax_no FROM customers ORDER BY id')) {
      if (normKey(r.name) === nk && (!tn || !taxKey(r.tax_no))) return r.id;
    }
    return null;
  }
  // mode 'merge' (faturadan / PDF'den): eşleşen kayıtta yalnız dolu gelen alanlar yazılır, eldeki bilgi silinmez.
  // mode 'full' (müşteri kartından): bütün alanlar formdaki gibi yazılır.
  function saveCustomer(p = {}) {
    const name = required(p.name, 'ERR_CUSTOMER_REQUIRED');
    const merge = p.mode === 'merge';
    let id = optId(p.id);
    if (id && !db.get('SELECT id FROM customers WHERE id = ?', [id])) id = null;
    if (!id && (merge || p.match !== false)) id = findCustomer({ tax_no: p.tax_no, name });
    const vals = {};
    for (const k of CUST_COLS) vals[k] = k === 'name' ? String(name).trim() : optText(p[k] === null || p[k] === undefined ? '' : String(p[k]));
    let extra = extraJson(p.extra);
    if (id) {
      const old = db.get('SELECT * FROM customers WHERE id = ?', [id]);
      if (merge) {
        for (const k of CUST_COLS) if (!vals[k]) vals[k] = old[k];
        if (extra !== undefined) {
          let o = {};
          try { o = JSON.parse(old.extra || '{}') || {}; } catch { o = {}; }
          if (extra) Object.assign(o, JSON.parse(extra));
          extra = extraJson(o);
        } else extra = old.extra;
      } else if (extra === undefined) extra = old.extra;
      db.run(`UPDATE customers SET ${CUST_COLS.map((k) => `${k}=?`).join(', ')}, extra=?, updated_at=${now} WHERE id=?`, [...CUST_COLS.map((k) => vals[k]), extra ?? null, id]);
    } else {
      id = db.run(`INSERT INTO customers (${CUST_COLS.join(', ')}, extra, updated_at) VALUES (${CUST_COLS.map(() => '?').join(',')},?,${now})`,
        [...CUST_COLS.map((k) => vals[k]), extra ?? null]).lastInsertRowid;
    }
    return { id };
  }
  // Faturası olan müşteri silinebilir: faturalar müşteri bilgisinin kopyasını taşır, bozulmaz (Silinenler kutusundan geri alınır)
  function deleteCustomer({ id }) {
    db.run('DELETE FROM customers WHERE id = ?', [id]);
    return { ok: true };
  }
  // Eski faturalardaki alıcılar müşteri listesine aktarılır (aynı VKN / ad bir kez)
  function importInvoiceCustomers() {
    let n = 0;
    for (const inv of db.all('SELECT id, customer_name, customer_phone, customer_email, customer_address, customer_tax FROM invoices WHERE customer_id IS NULL ORDER BY date, id')) {
      if (!optText(inv.customer_name)) continue;
      const before = db.get('SELECT COUNT(*) AS c FROM customers').c;
      const cid = saveCustomer({ name: inv.customer_name, phone: inv.customer_phone, email: inv.customer_email, address: inv.customer_address, tax_no: inv.customer_tax, mode: 'merge' }).id;
      if (db.get('SELECT COUNT(*) AS c FROM customers').c > before) n++;
      db.run('UPDATE invoices SET customer_id = ? WHERE id = ?', [cid, inv.id]);
    }
    return { added: n };
  }
  // Fatura kalemi → ürün kaydı: önce ürün no, sonra stok kodu, sonra ad (ilk satır) eşleşir; yoksa yeni ürün açılır
  function linkInvoiceProducts(its, cur) {
    for (const it of its) {
      const first = String(it.name).split('\n')[0].trim();
      let pid = it.product_id && db.get('SELECT id FROM products WHERE id = ?', [it.product_id]) ? it.product_id : null;
      if (!pid && it.code) pid = db.get('SELECT id FROM products WHERE code = ?', [it.code])?.id ?? null;
      if (!pid) {
        const nk = normKey(first);
        for (const r of db.all('SELECT id, name FROM products ORDER BY id')) if (normKey(r.name) === nk) { pid = r.id; break; }
      }
      if (!pid) {
        const rest = String(it.name).split('\n').slice(1).join('\n').trim();
        const code = it.code && !db.get('SELECT id FROM products WHERE code = ?', [it.code]) ? it.code : null;
        pid = saveProduct({ name: first || it.name, code, unit: it.unit || 'pcs', description: rest || null, sale_price: it.price, cost_currency: cur }).id;
        db.run('UPDATE products SET vat_rate = ?, depot = ? WHERE id = ?', [it.vat ?? null, it.depot || null, pid]);
      } else {
        // eksik bilgiler tamamlanır (var olan bilgi değiştirilmez)
        const p = db.get('SELECT code, vat_rate, depot FROM products WHERE id = ?', [pid]);
        if (!p.code && it.code && !db.get('SELECT id FROM products WHERE code = ? AND id <> ?', [it.code, pid])) db.run('UPDATE products SET code = ? WHERE id = ?', [it.code, pid]);
        if (p.vat_rate === null && it.vat !== undefined) db.run('UPDATE products SET vat_rate = ? WHERE id = ?', [it.vat, pid]);
        if (!p.depot && it.depot) db.run('UPDATE products SET depot = ? WHERE id = ?', [it.depot, pid]);
      }
      it.product_id = pid;
    }
  }
  // Satış fiyatı: ürünün para birimi uyuşuyorsa ürünün güncel fiyatı yazılır (maliyet varsa kâr yüzdesi de)
  function setProductPrice(pid, price, cur) {
    const p = db.get('SELECT cost_price, cost_currency FROM products WHERE id = ?', [pid]);
    if (!p) return;
    if (p.cost_currency && p.cost_currency !== cur && p.cost_price !== null) return;
    const pct = p.cost_price > 0 ? (price / p.cost_price - 1) * 100 : null;
    db.run(`UPDATE products SET sale_price = ?, cost_currency = ?, profit_pct = CASE WHEN ? IS NULL THEN profit_pct ELSE ? END, updated_at = ${now} WHERE id = ?`, [price, cur, pct, pct, pid]);
  }
  // Faturanın fiyatları geçmişe yazılır (fatura düzenlenirse kendi satırları yenilenir). Fatura, ürünün en yeni fiyat kaydıysa
  // ürünün güncel satış fiyatı olur — eski tarihli bir faturayı düzenlemek güncel fiyatı geri götürmez.
  function recordInvoicePrices(invId, its, date, cur, custId) {
    db.run('DELETE FROM product_prices WHERE invoice_id = ?', [invId]);
    const seen = new Set();
    for (const it of its) {
      if (!it.product_id) continue;
      db.run(`INSERT INTO product_prices (product_id, date, price, currency_code, qty, invoice_id, customer_id, source, updated_at) VALUES (?,?,?,?,?,?,?,'invoice',${now})`,
        [it.product_id, date, it.price, cur, it.qty, invId, custId || null]);
      if (seen.has(it.product_id)) continue;
      seen.add(it.product_id);
      const newer = db.get('SELECT id FROM product_prices WHERE product_id = ? AND date > ? AND (invoice_id IS NULL OR invoice_id <> ?) LIMIT 1', [it.product_id, date, invId]);
      if (!newer) setProductPrice(it.product_id, it.price, cur);
    }
  }
  function metaJson(m) {
    if (m === undefined) return undefined;
    return extraJson(m);
  }
  // Ürün kartı (Fatura → Ürünler): ad, stok kodu, birim, fiyat + para birimi, KDV, depo, açıklama, özel alanlar
  function saveProductCard(p = {}) {
    const id = optId(p.id);
    const empty = (v) => v === '' || v === null || v === undefined;
    const price = empty(p.sale_price) ? null : nonNegative(p.sale_price);
    const cur = optText(p.currency) || 'USD';
    if (!db.get('SELECT code FROM currencies WHERE code = ?', [cur])) throw new AppError('ERR_INVALID_CURRENCY');
    let vat = null;
    if (!empty(p.vat_rate)) { vat = Number(p.vat_rate); if (!Number.isFinite(vat) || vat < 0 || vat > 100) throw new AppError('ERR_INVALID_AMOUNT'); }
    let pid = id;
    if (id) {
      const old = db.get('SELECT * FROM products WHERE id = ?', [id]);
      if (!old) throw new AppError('ERR_NOT_FOUND');
      if (old.cost_price !== null && old.cost_currency && old.cost_currency !== cur && price !== null) throw new AppError('ERR_INVALID_CURRENCY');
      const c = optText(p.code);
      if (c && db.get('SELECT id FROM products WHERE code = ? AND id <> ?', [c, id])) throw new AppError('ERR_DUPLICATE_CODE');
      db.run(`UPDATE products SET name=?, code=?, unit=?, description=?, vat_rate=?, depot=?, updated_at=${now} WHERE id=?`,
        [required(p.name), c, optText(p.unit) || old.unit || 'pcs', optText(p.description), vat, optText(p.depot), id]);
      if (p.extra !== undefined) db.run('UPDATE products SET extra = ? WHERE id = ?', [extraJson(p.extra), id]);
      if (price !== null && (old.sale_price !== price || (old.cost_currency || cur) !== cur)) {
        setProductPrice(id, price, cur);
        db.run(`INSERT INTO product_prices (product_id, date, price, currency_code, source, updated_at) VALUES (?,?,?,?,'manual',${now})`, [id, today(), price, cur]);
      } else if (price === null && old.sale_price !== null) {
        db.run(`UPDATE products SET sale_price = NULL, updated_at = ${now} WHERE id = ?`, [id]);
      }
    } else {
      pid = saveProduct({ name: p.name, code: p.code, unit: optText(p.unit) || 'pcs', description: p.description, sale_price: price, cost_currency: price === null ? null : cur }).id;
      db.run('UPDATE products SET vat_rate = ?, depot = ?, extra = ? WHERE id = ?', [vat, optText(p.depot), extraJson(p.extra) ?? null, pid]);
      if (price !== null) db.run(`INSERT INTO product_prices (product_id, date, price, currency_code, source, updated_at) VALUES (?,?,?,?,'manual',${now})`, [pid, today(), price, cur]);
    }
    return { id: pid };
  }

"""

REPL = [
    # 1) kalemler: stok kodu, depo, satır KDV'si ve kullanıcının eklediği sütunlar (x) korunur
    ("      out.push({ name, qty, unit: optText(it.unit), price, product_id: optId(it.product_id) });",
     "      const row = { name, qty, unit: optText(it.unit), price, product_id: optId(it.product_id) };\n"
     "      const code = optText(it.code === null || it.code === undefined ? '' : String(it.code));\n"
     "      if (code) row.code = code;\n"
     "      const depot = optText(it.depot === null || it.depot === undefined ? '' : String(it.depot));\n"
     "      if (depot) row.depot = depot;\n"
     "      if (it.vat !== undefined && it.vat !== null && it.vat !== '') {\n"
     "        const v = Number(it.vat);\n"
     "        if (!Number.isFinite(v) || v < 0 || v > 100) throw new AppError('ERR_INVALID_AMOUNT');\n"
     "        row.vat = v;\n"
     "      }\n"
     "      if (it.x && typeof it.x === 'object' && !Array.isArray(it.x)) {\n"
     "        const x = {};\n"
     "        for (const [k, v] of Object.entries(it.x)) { const s = optText(v === null || v === undefined ? '' : String(v)); if (s) x[String(k).slice(0, 40)] = s.slice(0, 500); }\n"
     "        if (Object.keys(x).length) row.x = x;\n"
     "      }\n"
     "      out.push(row);"),
    # 2) satır bazında KDV (e-Fatura gibi): her satırın vergisi ayrı yuvarlanır; indirim satırlara oranla dağılır
    ("    const rate = nonNegative(taxRate || 0);\n    if (rate > 100) throw new AppError('ERR_INVALID_AMOUNT');",
     "    if (items.some((it) => it.vat !== undefined)) {\n"
     "      const k = subtotal > 0 ? (subtotal - disc) / subtotal : 0;\n"
     "      const rates = new Set();\n"
     "      let lt = 0;\n"
     "      for (const it of items) { const v = it.vat || 0; rates.add(v); lt += r((it.qty * it.price * k * v) / 100); }\n"
     "      lt = r(lt);\n"
     "      return { subtotal, discount: disc, tax_rate: rates.size === 1 ? [...rates][0] : 0, tax: lt, total: r(subtotal - disc + lt) };\n"
     "    }\n"
     "    const rate = nonNegative(taxRate || 0);\n    if (rate > 100) throw new AppError('ERR_INVALID_AMOUNT');"),
    # 3) saveInvoice: müşteri kaydı, ürün kaydı, başlık bilgileri
    ("    discount, tax_rate, note, template, lang, record_cash = false, account_id, pay_amount }) {",
     "    discount, tax_rate, note, template, lang, record_cash = false, account_id, pay_amount, customer_id, customer_extra, meta, save_customer, save_products }) {"),
    ("    const its = invoiceItems(items);\n    const tt = invoiceTotals(its, discount, tax_rate, cur);",
     "    const its = invoiceItems(items);\n"
     "    // v1.60: alıcı müşteri listesine yazılır / güncellenir (VKN ya da ad eşleşirse aynı kayıt); kalemler ürün listesine bağlanır\n"
     "    let custId = optId(customer_id);\n"
     "    if (save_customer !== false) {\n"
     "      const ce = customer_extra && typeof customer_extra === 'object' ? customer_extra : {};\n"
     "      custId = saveCustomer({ ...ce, id: custId, name, phone: customer_phone, email: customer_email, address: customer_address, tax_no: customer_tax, mode: 'merge' }).id;\n"
     "    }\n"
     "    if (save_products !== false) linkInvoiceProducts(its, cur);\n"
     "    const tt = invoiceTotals(its, discount, tax_rate, cur);"),
    ("    refreshInvoice(invId);\n    return { id: invId, number: db.get('SELECT number FROM invoices WHERE id = ?', [invId]).number };",
     "    db.run('UPDATE invoices SET customer_id = ? WHERE id = ?', [custId, invId]);\n"
     "    const mj = metaJson(meta);\n"
     "    if (mj !== undefined) db.run('UPDATE invoices SET meta = ? WHERE id = ?', [mj, invId]);\n"
     "    if (save_products !== false) recordInvoicePrices(invId, its, d, cur, custId);\n"
     "    refreshInvoice(invId);\n    return { id: invId, number: db.get('SELECT number FROM invoices WHERE id = ?', [invId]).number };"),
    # 4) fatura silinince fiyat geçmişindeki satırları da gider (Silinenler kutusuyla geri gelir)
    ("    db.run('DELETE FROM invoice_payments WHERE invoice_id = ?', [id]);\n    db.run('DELETE FROM invoices WHERE id = ?', [id]);",
     "    db.run('DELETE FROM invoice_payments WHERE invoice_id = ?', [id]);\n    db.run('DELETE FROM product_prices WHERE invoice_id = ?', [id]);\n    db.run('DELETE FROM invoices WHERE id = ?', [id]);"),
    # 5) silinenler kutusu türü + yazma listesi + kod
    ("    deleteInvoice: 'invoices', deleteInvoicePayment: 'invoice_payments',",
     "    deleteInvoice: 'invoices', deleteInvoicePayment: 'invoice_payments', deleteCustomer: 'customers',"),
    ("    saveInvoice, addInvoicePayment, deleteInvoicePayment, setInvoiceCancelled, deleteInvoice, setTxPayment,\n",
     "    saveInvoice, addInvoicePayment, deleteInvoicePayment, setInvoiceCancelled, deleteInvoice, setTxPayment,\n"
     "    saveCustomer, deleteCustomer, importInvoiceCustomers, saveProductCard,\n"),
    ("  // ---------- v1.52: Silinenler kutusu", CODE + "  // ---------- v1.52: Silinenler kutusu"),
]


def patch_services(s, path):
    if 'function saveCustomer(' in s:
        print(path, 'services zaten yamalı'); return s
    for old, new in REPL:
        assert s.count(old) == 1, (path, old[:80], s.count(old))
        s = s.replace(old, new)
    return s


def patch_schema(s, path):
    if "v1.60-fatura-musteri-urun" in s:
        print(path, 'schema zaten yamalı'); return s
    anchor = "    CREATE INDEX idx_invoice_payments_inv ON invoice_payments(invoice_id);\n  `,\n});\n"
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
