# v1.71: faturaya özel dosyalar (yalnız programda görünür; fatura çıktısına / PDF'e girmez) + her türlü dosyayı kaydetme (files.saveFile).
#  - migration 31: invoice_files (invoice_id, file_path, original_name, mime_type, note) — eşitlenir (bulut + Wi‑Fi), dosyası da (FILE_COLUMNS)
#  - addInvoiceFiles / deleteInvoiceFile (Silinenler kutusu: 30 gün geri alınır, dosya silinmez) / setInvoiceFileNote; deleteInvoice satırları da kaldırır
#  - telefon: window.falcon.files.saveFile(bytes, ad) — baytlar değiştirilmeden belgeler/ altına (en çok 50 MB)
# Masaüstü: electron/services.js + electron/schema.js + electron/sync.js. Telefon: index-*.js (gömülü services + schema + sync).
# kullanım: python3 araclar/patch-srv-171.py <services.js|index-*.js> [schema.js] [sync.js]   (zaten yamalıysa atlar)
import re, sys

MIGRATION = """
migrations.push({
  version: 31,
  name: 'v1.71-invoice-files',
  sql: `
    -- v1.71: faturaya eklenen özel dosyalar (yalnız programda görünür; fatura çıktısına girmez)
    CREATE TABLE invoice_files (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id    INTEGER NOT NULL,
      file_path     TEXT NOT NULL,
      original_name TEXT,
      mime_type     TEXT,
      note          TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at    TEXT
    );
    CREATE INDEX idx_invoice_files_inv ON invoice_files(invoice_id);
  `,
});
"""

SERVICES_NEW = r"""
  // v1.71 invoice_files: faturaya özel dosyalar (yalnız programda; çıktıya girmez)
  function addInvoiceFiles({ invoice_id, files }) {
    const id = optId(invoice_id);
    if (!id || !db.get('SELECT id FROM invoices WHERE id = ?', [id])) throw new AppError('ERR_NOT_FOUND');
    const out = [];
    for (const f of files || []) {
      db.run(`INSERT INTO invoice_files (invoice_id, file_path, original_name, mime_type, note, updated_at) VALUES (?,?,?,?,?,${now})`,
        [id, required(f.relPath), f.originalName ?? null, f.mime ?? null, optText(f.note)]);
      out.push(db.get('SELECT last_insert_rowid() AS id').id);
    }
    return { ids: out };
  }
  // satır Silinenler kutusuna gider (30 gün geri alınabilir); dosya diskte kalır
  function deleteInvoiceFile({ id }) {
    db.run('DELETE FROM invoice_files WHERE id = ?', [optId(id)]);
    return { ok: true };
  }
  function setInvoiceFileNote({ id, note }) {
    if (!db.get('SELECT id FROM invoice_files WHERE id = ?', [optId(id)])) throw new AppError('ERR_NOT_FOUND');
    db.run(`UPDATE invoice_files SET note = ?, updated_at = ${now} WHERE id = ?`, [optText(note), optId(id)]);
    return { ok: true };
  }
  function deleteInvoice({ id }) {"""

R = [
    ("  function deleteInvoice({ id }) {", SERVICES_NEW),
    ("    db.run('DELETE FROM product_prices WHERE invoice_id = ?', [id]);\n    db.run('DELETE FROM invoices WHERE id = ?', [id]);\n",
     "    db.run('DELETE FROM product_prices WHERE invoice_id = ?', [id]);\n    db.run('DELETE FROM invoice_files WHERE invoice_id = ?', [id]);\n    db.run('DELETE FROM invoices WHERE id = ?', [id]);\n"),
    ("    saveInvoice, addInvoicePayment, deleteInvoicePayment, setInvoiceCancelled, deleteInvoice, setTxPayment,",
     "    saveInvoice, addInvoicePayment, deleteInvoicePayment, setInvoiceCancelled, deleteInvoice, setTxPayment, addInvoiceFiles, deleteInvoiceFile, setInvoiceFileNote,"),
    ("    deleteInvoice: 'invoices', deleteInvoicePayment: 'invoice_payments', deleteCustomer: 'customers',",
     "    deleteInvoice: 'invoices', deleteInvoicePayment: 'invoice_payments', deleteCustomer: 'customers', deleteInvoiceFile: 'invoice_files',"),
    ("    ['cash_transactions', 'sc_qr_path'], ['shamcash_payees', 'qr_path']];",
     "    ['cash_transactions', 'sc_qr_path'], ['shamcash_payees', 'qr_path'], ['invoice_files', 'file_path']];"),
]
FILECOL_A = "cash_transactions: 'sc_qr_path', shamcash_payees: 'qr_path' };"
FILECOL_B = "cash_transactions: 'sc_qr_path', shamcash_payees: 'qr_path', invoice_files: 'file_path' };"


def patch_services(s, path):
    if 'v1.71 invoice_files' in s:
        print(path, 'services zaten yamalı'); return s
    for a, b in R:
        if s.count(a) != 1:
            sys.exit('çapa bulunamadı / birden çok (%d): %s … %s' % (s.count(a), path, a[:70]))
        s = s.replace(a, b)
    return s


def patch_schema(s, path):
    if 'v1.71-invoice-files' in s:
        print(path, 'schema zaten yamalı'); return s
    anchor = "    CREATE INDEX idx_cash_sc_ref ON cash_transactions(sc_ref);\n  `,\n});\n"
    if s.count(anchor) != 1:
        sys.exit('schema çapası yok: ' + path)
    return s.replace(anchor, anchor + MIGRATION)


def patch_sync(s, path):
    if FILECOL_B in s:
        return s
    if s.count(FILECOL_A) != 1:
        sys.exit('FILE_COLUMNS çapası yok: ' + path)
    return s.replace(FILECOL_A, FILECOL_B)


def patch_phone_files(s, path):
    # telefon: files.saveFile (her tür dosya, baytlar aynen, belgeler/ altına)
    if 'saveFile:' in s:
        return s
    m = list(re.finditer(r'files:\{import:([\w$]+)\(\(e,t\)=>([\w$]+)\(e,t\)\),', s))
    if len(m) != 1: sys.exit('files çapası %d kez' % len(m))
    J = m[0].group(1)
    w = list(re.finditer(r'saveImage:[\w$]+\(async e=>\{.{0,300}?return ([\w$]+)\.write\(n,t\)', s))
    if len(w) != 1: sys.exit('saveImage çapası %d kez' % len(w))
    PE = w[0].group(1)
    code = ('saveFile:%(J)s(async(b,nm)=>{let u=b instanceof Uint8Array?b:new Uint8Array(b),n=String(nm||``).replace(/[\\\\/:*?"<>|]+/g,` `).trim().slice(0,120);'
            'if(u.length<1||u.length>52428800)throw Error(`ERR_FILE_TYPE`);let x=((n.match(/\\.([A-Za-z0-9]{1,6})$/)||[])[1]||`bin`).toLowerCase(),'
            'M={pdf:`application/pdf`,jpg:`image/jpeg`,jpeg:`image/jpeg`,png:`image/png`,webp:`image/webp`,gif:`image/gif`,txt:`text/plain`,csv:`text/csv`,'
            'doc:`application/msword`,docx:`application/vnd.openxmlformats-officedocument.wordprocessingml.document`,xls:`application/vnd.ms-excel`,'
            'xlsx:`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,zip:`application/zip`},'
            'r=`belgeler/${Date.now()}-${Math.random().toString(16).slice(2,10)}.${x}`;%(PE)s.write(r,u);return{relPath:r,originalName:n||(`dosya.`+x),mime:M[x]||`application/octet-stream`}}),') % {'J': J, 'PE': PE}
    return s[:m[0].end()] + code + s[m[0].end():]


if __name__ == '__main__':
    t = sys.argv[1]
    s = open(t, encoding='utf8').read()
    s = patch_services(s, t)
    if 'migrations.push(' in s:  # telefon paketi: schema, sync ve dosya köprüsü de aynı dosyada
        s = patch_schema(s, t)
        s = patch_sync(s, t)
        s = patch_phone_files(s, t)
    open(t, 'w', encoding='utf8').write(s)
    for extra in sys.argv[2:]:
        x = open(extra, encoding='utf8').read()
        x = patch_schema(x, extra) if 'migrations.push(' in x else patch_sync(x, extra)
        open(extra, 'w', encoding='utf8').write(x)
    print('tamam', t)
