# v1.66: fatura tahsilatı Sham Cash dekontundan — addInvoicePayment / invoicePay isteğe bağlı `sc` alır:
#   sc = { ref, name, account, doc } → kasa hareketine sc_ref / sc_name / sc_account / pay_method='shamcash' / sc_doc (dekonttaki gibi, JSON) yazılır.
#   Aynı işlem no (sc_ref) daha önce kaydedildiyse tahsilat yazılmaz: ERR_SC_DUPLICATE (kullanıcı kuralı: dekont iki kez işlenmez).
# Masaüstü: electron/services.js. Telefon: index-*.js (gömülü services; 1.65 yaması — sc_doc sütunu — üstüne).
# kullanım: python3 araclar/patch-srv-166.py <services.js|index-*.js>   (zaten yamalıysa atlar)
import sys

R = [
    ("  function invoicePay(invoiceId, { amount, date, account_id, note }) {\n",
     "  function invoicePay(invoiceId, { amount, date, account_id, note, sc }) {\n"
     "    // v1.66: Sham Cash dekontu (sc) — aynı işlem no ikinci kez yazılmaz\n"
     "    const scRef = sc && typeof sc === 'object' ? optText(sc.ref) : null;\n"
     "    if (scRef && db.get('SELECT id FROM cash_transactions WHERE sc_ref = ? LIMIT 1', [scRef])) throw new AppError('ERR_SC_DUPLICATE');\n"),
    ("    db.run('UPDATE invoice_payments SET cash_transaction_id = ?, account_id = (SELECT account_id FROM cash_transactions WHERE id = ?) WHERE id = ?', [txId, txId, payId]);\n    return payId;\n",
     "    db.run('UPDATE invoice_payments SET cash_transaction_id = ?, account_id = (SELECT account_id FROM cash_transactions WHERE id = ?) WHERE id = ?', [txId, txId, payId]);\n"
     "    if (scRef) {\n"
     "      const keep = {};\n"
     "      const doc = sc.doc && typeof sc.doc === 'object' ? sc.doc : {};\n"
     "      for (const k of ['kind', 'ref', 'date', 'time', 'from_name', 'from_account', 'to_name', 'to_account', 'amount', 'currency', 'note', 'file_name', 'read_by']) {\n"
     "        if (doc[k] !== undefined && doc[k] !== null && String(doc[k]) !== '') keep[k] = String(doc[k]).slice(0, 500);\n"
     "      }\n"
     "      if (!keep.ref) keep.ref = scRef;\n"
     "      db.run(`UPDATE cash_transactions SET sc_ref=?, sc_name=?, sc_account=?, pay_method='shamcash', sc_doc=? WHERE id=?`,\n"
     "        [scRef, optText(sc.name), optText(sc.account), JSON.stringify(keep), txId]);\n"
     "    }\n"
     "    return payId;\n"),
    ("  function addInvoicePayment({ invoice_id, amount, date, account_id, note }) {\n    const id = invoicePay(invoice_id, { amount, date, account_id, note });\n",
     "  function addInvoicePayment({ invoice_id, amount, date, account_id, note, sc }) {\n    const id = invoicePay(invoice_id, { amount, date, account_id, note, sc });\n"),
]

def patch(path):
    s = open(path, encoding='utf-8').read()
    if 'ERR_SC_DUPLICATE' in s:
        print('zaten yamalı:', path); return
    for a, b in R:
        if s.count(a) != 1:
            raise SystemExit('bulunamadı (%d): %s … %s' % (s.count(a), path, a[:70]))
        s = s.replace(a, b)
    open(path, 'w', encoding='utf-8').write(s)
    print('yamalandı:', path)

for p in sys.argv[1:]:
    patch(p)
