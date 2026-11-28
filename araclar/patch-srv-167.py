# v1.67 servis yaması: Sham Cash her yerde.
#  - saveShamCash: giriş yönündeki hareketlerde de Sham Cash / banka / diğer ödeme bilgisi yazılır (eskiden yalnız çıkış; düzenlemede
#    gelen tahsilatın Sham Cash bilgisi siliniyordu). Kayıtlı alıcı listesine yalnız çıkışlar eklenir.
#  - Elle girilen kayda eklenen dekont: sc_doc (dekonttaki alanlar AYNEN, JSON) + sc_doc_file (orijinal dosya, receipts'e bağlanır).
#    Aynı işlem no başka bir kayıtta varsa ERR_SC_DUPLICATE (işlem geri alınır, hiçbir şey yazılmaz).
#  - Kasalar arası aktarım: Sham Cash kasasından çıkan / giren taraf kendiliğinden «Sham Cash» ödeme yöntemiyle işaretlenir.
# Masaüstü: electron/services.js. Telefon: index-*.js (gömülü services; metin birebir aynı).
# kullanım: python3 araclar/patch-srv-167.py <services.js|index-*.js>   (zaten yamalıysa atlar)
import sys

f = sys.argv[1]
s = open(f, encoding='utf-8').read()
if 'attachShamDoc(' in s:
    print('atlandı (zaten yamalı):', f); sys.exit(0)


def rep(a, b):
    global s
    if s.count(a) != 1:
        sys.exit('çapa %d kez: %s' % (s.count(a), a[:90]))
    s = s.replace(a, b)


rep("""    const method = tx.direction === 'out' && PM.includes(p.pay_method) ? p.pay_method : null;
    const on = (method ? method === 'shamcash' : p.sc_on !== false) && tx.direction === 'out';""",
    """    // v1.67: giriş yönünde de (gönderen bilgisi); kayıtlı alıcılar yalnız çıkışta
    const method = PM.includes(p.pay_method) ? p.pay_method : null;
    const on = method ? method === 'shamcash' : p.sc_on !== false;""")
rep("    if (on && p.sc_save_payee && (v.account || v.name)) {", "    if (on && tx.direction === 'out' && p.sc_save_payee && (v.account || v.name)) {")
rep("""      [v.account, v.name, v.phone, v.ref, v.note, qr || null, v.qrText, on ? payeeId : null, method || (on && (v.account || v.name || qr || v.ref || v.phone) ? 'shamcash' : null), txId]);
  }
""", """      [v.account, v.name, v.phone, v.ref, v.note, qr || null, v.qrText, on ? payeeId : null, method || (on && (v.account || v.name || qr || v.ref || v.phone) ? 'shamcash' : null), txId]);
    if (on && p.sc_doc) attachShamDoc(txId, p);
  }

  // v1.67: elle girilen kayda eklenen Sham Cash dekontu. Dekonttaki alanlar aynen saklanır (çeviri / düzeltme yok), orijinal dosya
  // kayda bağlanır. Aynı işlem no başka kayıtta varsa ERR_SC_DUPLICATE (çağrı geri alınır).
  function attachShamDoc(txId, p) {
    let doc = p.sc_doc;
    if (typeof doc === 'string') { try { doc = JSON.parse(doc); } catch (e) { doc = null; } }
    if (!doc || typeof doc !== 'object') return;
    const keep = {};
    for (const k of ['kind', 'ref', 'date', 'time', 'from_name', 'from_account', 'to_name', 'to_account', 'amount', 'currency', 'note', 'file_name', 'file_path', 'read_by']) {
      if (doc[k] !== undefined && doc[k] !== null && String(doc[k]) !== '') keep[k] = String(doc[k]);
    }
    const ref = optText(keep.ref) || optText(p.sc_ref);
    if (ref && db.get('SELECT id FROM cash_transactions WHERE sc_ref = ? AND id <> ? AND sc_doc IS NOT NULL LIMIT 1', [ref, txId])) throw new AppError('ERR_SC_DUPLICATE');
    const file = p.sc_doc_file && typeof p.sc_doc_file === 'object' && optText(p.sc_doc_file.relPath) ? p.sc_doc_file : null;
    if (file) keep.file_path = String(file.relPath);
    db.run(`UPDATE cash_transactions SET sc_doc=?, sc_ref=COALESCE(?, sc_ref), pay_method='shamcash', updated_at=${now} WHERE id=?`, [JSON.stringify(keep), ref, txId]);
    if (file && !db.get('SELECT id FROM receipts WHERE transaction_id = ? AND file_path = ?', [txId, file.relPath])) {
      addReceiptRows(txId, [{ relPath: file.relPath, originalName: optText(file.originalName), mime: optText(file.mime) }]);
    }
  }

  // v1.67: Sham Cash kasası mı (ayarda seçilen kasa ya da adında Sham / شام geçen kasa)
  function isShamAccount(id) {
    const a = db.get('SELECT name, currency_code FROM cash_accounts WHERE id = ?', [id]);
    if (!a) return false;
    const st = db.get('SELECT value FROM settings WHERE key = ?', ['shamcash_acc_' + a.currency_code]);
    if (st && String(st.value) === String(id)) return true;
    return /sham|شام/i.test(String(a.name || ''));
  }
""")
rep("""      [required(to_account), 'in', b, d, 'transfer', desc, outId],
    );
    return { id: outId };""", """      [required(to_account), 'in', b, d, 'transfer', desc, outId],
    );
    // v1.67: Sham Cash kasasının tarafı kendiliğinden Sham Cash ödemesi olarak işaretlenir
    if (isShamAccount(from_account)) db.run("UPDATE cash_transactions SET pay_method='shamcash' WHERE id = ?", [outId]);
    if (isShamAccount(to_account)) db.run("UPDATE cash_transactions SET pay_method='shamcash' WHERE related_type = 'transfer' AND related_id = ? AND direction = 'in'", [outId]);
    return { id: outId };""")
open(f, 'w', encoding='utf-8').write(s)
print('yamalandı:', f)
