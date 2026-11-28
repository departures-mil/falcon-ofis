# v1.65: Sham Cash dekontları (PDF / resim) → kasa hareketi (giriş ya da çıkış).
#  - migration 30: cash_transactions.sc_doc (dekontun okunan alanları, JSON, OLDUĞU GİBİ; Arapça adlara dokunulmaz) + sc_ref dizini
#  - importShamCashReceipt: aynı işlem no ikinci kez kaydedilmez (duplicate döner), orijinal dosya receipts'e aynen bağlanır
#  - setShamCashNote: kullanıcının serbest notu (gerçek sahibi vb.) — dekont alanları değişmez
#  - saveShamCash: dekonttan gelen harekette Sham Cash alanları korunur (giriş yönünde de), yalnız not değişebilir
# Masaüstü: electron/services.js + electron/schema.js. Telefon: index-*.js (gömülü services + schema).
# kullanım: python3 araclar/patch-srv-165.py <services.js|index-*.js> [schema.js]   (zaten yamalıysa atlar)
import sys

MIGRATION = """
migrations.push({
  version: 30,
  name: 'v1.65-shamcash-dekont',
  sql: `
    -- v1.65: Sham Cash dekontundan okunan alanlar (JSON; dekonttaki yazı aynen: işlem türü, no, tarih, saat, gönderen, alıcı, hesaplar, tutar, not, dosya adı).
    -- Kullanıcının kendi notu sc_note'ta ayrı durur; dekont alanları sonradan değiştirilmez.
    ALTER TABLE cash_transactions ADD COLUMN sc_doc TEXT;
    CREATE INDEX idx_cash_sc_ref ON cash_transactions(sc_ref);
  `,
});
"""

SERVICES_NEW = r"""
  // v1.65 sc_doc: Sham Cash dekontundan kasa hareketi. doc alanları dekonttaki gibi saklanır (çeviri / düzeltme yok).
  // Aynı işlem numarası ikinci kez kaydedilmez: { id, duplicate: true } döner (üst üste yazılmaz).
  function importShamCashReceipt(p) {
    const doc = p && p.doc && typeof p.doc === 'object' ? p.doc : {};
    const ref = optText(doc.ref);
    if (!ref) throw new AppError('ERR_REQUIRED');
    const dup = db.get('SELECT id FROM cash_transactions WHERE sc_ref = ? AND sc_doc IS NOT NULL ORDER BY id LIMIT 1', [ref]);
    if (dup) return { id: dup.id, duplicate: true };
    const direction = p.direction === 'in' ? 'in' : p.direction === 'out' ? 'out' : null;
    if (!direction) throw new AppError('ERR_REQUIRED');
    const keep = {};
    for (const k of ['kind', 'ref', 'date', 'time', 'from_name', 'from_account', 'to_name', 'to_account', 'amount', 'currency', 'note', 'file_name', 'read_by', 'generated']) {
      if (doc[k] !== undefined && doc[k] !== null && String(doc[k]) !== '') keep[k] = String(doc[k]);
    }
    const r = saveCashTxCore({
      account_id: p.account_id, direction, amount: p.amount, date: p.date, category: p.category || 'other',
      person: p.person, people: p.people, description: p.description, add_to_cash: p.add_to_cash !== false,
      newReceipts: p.receipt ? [p.receipt] : [],
    });
    const other = direction === 'out' ? { name: keep.to_name, account: keep.to_account } : { name: keep.from_name, account: keep.from_account };
    db.run(`UPDATE cash_transactions SET sc_name=?, sc_account=?, sc_ref=?, sc_note=?, pay_method='shamcash', sc_doc=?, updated_at=${now} WHERE id=?`,
      [optText(other.name), optText(other.account), ref, optText(p.note), JSON.stringify(keep), r.id]);
    return { id: r.id, duplicate: false };
  }

  function setShamCashNote({ id, note }) {
    if (!db.get('SELECT id FROM cash_transactions WHERE id = ?', [id])) throw new AppError('ERR_NOT_FOUND');
    db.run(`UPDATE cash_transactions SET sc_note=?, updated_at=${now} WHERE id=?`, [optText(note), id]);
    return { id };
  }

  function saveShamCash(txId, p) {"""

R = [
    ("  function saveShamCash(txId, p) {", SERVICES_NEW),
    ("    const tx = db.get('SELECT direction, sc_qr_path, sc_payee_id FROM cash_transactions WHERE id = ?', [txId]);\n    if (!tx) return;\n",
     "    const tx = db.get('SELECT direction, sc_qr_path, sc_payee_id, sc_doc FROM cash_transactions WHERE id = ?', [txId]);\n    if (!tx) return;\n"
     "    // v1.65 sc_doc: dekonttan gelen kayıtta Sham Cash bilgileri (orijinal) korunur; formdan yalnız not değişir\n"
     "    if (tx.sc_doc) { if (p.sc_note !== undefined) db.run('UPDATE cash_transactions SET sc_note=? WHERE id=?', [optText(p.sc_note), txId]); return; }\n"),
    ("    saveCashTx, deleteCashTx, transfer,", "    saveCashTx, importShamCashReceipt, setShamCashNote, deleteCashTx, transfer,"),
]


def patch_services(s, path):
    if 'v1.65 sc_doc' in s:
        print(path, 'services zaten yamalı'); return s
    for a, b in R:
        if s.count(a) != 1:
            sys.exit('çapa bulunamadı / birden çok (%d): %s … %s' % (s.count(a), path, a[:70]))
        s = s.replace(a, b)
    return s


def patch_schema(s, path):
    if 'v1.65-shamcash-dekont' in s:
        print(path, 'schema zaten yamalı'); return s
    anchor = "    CREATE INDEX idx_product_prices_inv ON product_prices(invoice_id);\n  `,\n});\n"
    if s.count(anchor) != 1:
        sys.exit('schema çapası yok: ' + path)
    return s.replace(anchor, anchor + MIGRATION)


if __name__ == '__main__':
    t = sys.argv[1]
    s = open(t, encoding='utf8').read()
    s = patch_services(s, t)
    if 'migrations.push(' in s:  # telefon paketi: schema da aynı dosyada
        s = patch_schema(s, t)
    open(t, 'w', encoding='utf8').write(s)
    for extra in sys.argv[2:]:
        x = open(extra, encoding='utf8').read()
        open(extra, 'w', encoding='utf8').write(patch_schema(x, extra))
    print('tamam', t)
