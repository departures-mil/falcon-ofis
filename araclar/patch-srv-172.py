# v1.72: fatura tahsilatı «kasaya eklenmeden» (no_cash) — fatura ödendi / kısmi ödendi sayılır, kasa hareketi oluşmaz
# (invoice_payments satırı account_id / cash_transaction_id boş). Masaüstü electron/services.js + telefon index-*.js.
# kullanım: python3 araclar/patch-srv-172.py <services.js|index-*.js>   (zaten yamalıysa atlar)
import sys

R = [
    ("  function invoicePay(invoiceId, { amount, date, account_id, note, sc }) {",
     "  function invoicePay(invoiceId, { amount, date, account_id, note, sc, no_cash }) {"),
    ("""    const acc = optId(account_id);
    if (acc && accountCurrency(acc) !== inv.currency_code) throw new AppError('ERR_INVALID_CURRENCY');
    const d = optText(date) || today();
""",
     """    const d = optText(date) || today();
    // v1.72 no_cash: tahsil edildi sayılır, kasaya para eklenmez (kasa hareketi yok)
    if (no_cash) {
      return db.run(`INSERT INTO invoice_payments (invoice_id, date, amount, account_id, note, updated_at) VALUES (?,?,?,NULL,?,${now})`,
        [invoiceId, d, amt, optText(note)]).lastInsertRowid;
    }
    const acc = optId(account_id);
    if (acc && accountCurrency(acc) !== inv.currency_code) throw new AppError('ERR_INVALID_CURRENCY');
"""),
    ("""  function addInvoicePayment({ invoice_id, amount, date, account_id, note, sc }) {
    const id = invoicePay(invoice_id, { amount, date, account_id, note, sc });""",
     """  function addInvoicePayment({ invoice_id, amount, date, account_id, note, sc, no_cash }) {
    const id = invoicePay(invoice_id, { amount, date, account_id, note, sc: no_cash ? null : sc, no_cash: !!no_cash });"""),
]

t = sys.argv[1]
s = open(t, encoding='utf8').read()
if 'v1.72 no_cash' in s:
    print('atlandı (zaten yamalı):', t); sys.exit(0)
for a, b in R:
    if s.count(a) != 1:
        sys.exit('çapa bulunamadı / birden çok (%d): %s … %s' % (s.count(a), t, a[:70]))
    s = s.replace(a, b)
open(t, 'w', encoding='utf8').write(s)
print('tamam', t)
