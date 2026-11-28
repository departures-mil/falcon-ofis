/* Falcon Ofis v1.65 — Sham Cash dekontları (PDF ya da resim) → kasa hareketi (giriş / çıkış). Masaüstü + telefon aynı dosya.
 *   window.FalconShamDekont.open({ refresh })        Kasa → "Sham Cash dekontu" düğmesi (patch-ui-165.py)
 *   window.FalconShamDekont.read(bytes, mime, name)  → Promise<{ doc, source, check, ... }>
 * Okuma: 1) çevrimiçi yapay zekâ (kullanıcının KENDİ Gemini anahtarı; dosyanın kendisi gönderilir)
 *        2) çevrimdışı okuma (masaüstü: dist/assets/ocr — tesseract, dil verisi falcon://app/ocr) her zaman yanında çalışır ve
 *           yapay zekâ sonucunu TEYİT eder (işlem no, tutar, tarih, saat, hesap sonları). İkisi de yoksa alanlar elle doldurulur.
 * Kurallar (kullanıcı): Arapça adlar dekonttaki gibi yazılır (çeviri / harf düzeltmesi yok); orijinal dosya bayt bayt saklanır;
 * aynı işlem no ikinci kez kaydedilmez; kullanıcının serbest notu (gerçek sahibi vb.) ayrı alanda; yön "benim adlarım"dan bulunur
 * (gönderen bensem çıkış, alıcı bensem giriş; ikisi de değilse sorulur).
 * Masaüstü dekont kutusu: "Falcon Ofis Veri\Sham Cash Dekontları" klasörüne konan dosyalar program açıkken okunur; yanında aynı adlı
 * .json (doğrulanmış alanlar) varsa ya da yapay zekâ + çevrimdışı okuma birebir tutuyorsa kendiliğinden kaydedilir, değilse onaya gelir. */
(function () {
  'use strict';
  if (window.FalconShamDekont) return;
  var VERSION = '1.67.2';

  // ---------- dil ----------
  var TX = {
    tr: {
      btn: 'Sham Cash dekontu', btnTip: 'Sham Cash dekontunu (PDF ya da resim) okuyup kasaya giriş / çıkış olarak kaydeder',
      title: 'Sham Cash dekontları', pick: '📄 Dekont seç (PDF / resim)', drop: 'Dekontları buraya sürükleyin ya da seçin. Birden fazla olabilir.',
      inbox: '📁 Dekont klasörü', inboxTip: 'Bu klasöre konan dekontlar program açıkken kendiliğinden okunur',
      reading: 'Okunuyor…', readAi: '✓ Yapay zekâ ile okundu', readOff: '⚠ Çevrimdışı okundu — alanları dekontla karşılaştırın',
      readBoth: '✓ Yapay zekâ ile okundu, çevrimdışı okumayla teyit edildi', readDiff: '⚠ İki okuma farklı: işaretli alanları kontrol edin',
      readSide: '✓ Doğrulanmış bilgilerle', readNone: '⚠ Okunamadı — alanları dekonttan doldurun', readNoAi: 'Yapay zekâ anahtarı yok / internet yok: çevrimdışı okundu',
      docInfo: 'Dekonttaki bilgiler (olduğu gibi)', docHint: 'Adlar ve hesaplar dekontta nasıl yazıyorsa öyle kaydedilir. Okuma hatası varsa yalnız hatalı harfi düzeltin.',
      kind: 'İşlem türü', ref: 'İşlem no', date: 'Tarih', time: 'Saat', dateTime: 'Tarih / saat', from_name: 'Gönderen', from_account: 'Gönderen hesap',
      to_name: 'Alıcı', to_account: 'Alıcı hesap', amount: 'Tutar', currency: 'Para birimi', amountCur: 'Tutar', docNote: 'Dekont notu', note: 'Dekont notu',
      record: 'Kayıt', dir: 'Yön', in: 'Giriş', out: 'Çıkış', account: 'Kasa', category: 'Kategori', description: 'Açıklama', descPh: 'İsteğe bağlı',
      myNote: 'Notum', myNotePh: 'Ör. gerçek sahibi, ne için', addToCash: 'Kasaya işle (işaretsizse yalnız bilgi kaydı)',
      meSender: 'Gönderen sizsiniz → çıkış', meRecipient: 'Alıcı sizsiniz → giriş', meUnknown: 'Hangisi sizsiniz?',
      iamSender: 'Gönderen benim', iamRecipient: 'Alıcı benim', neither: 'İkisi de değilim',
      save: 'Kaydet', skip: 'Atla', cancel: 'Vazgeç', close: 'Kapat', saved: '✓ Kaydedildi', savedAuto: '✓ Kendiliğinden kaydedildi',
      dup: 'Bu dekont zaten kayıtlı (aynı işlem no). İkinci kez yazılmadı.', curMismatch: 'Dikkat: dekontun para birimi ({a}) seçili kasanınkinden ({b}) farklı',
      noAccount: '{c} kasası yok. Kasa seçin.', needDir: 'Önce yönü seçin', needAmount: 'Tutar ve işlem no gerekli',
      me: 'Benim Sham Cash adlarım ve hesaplarım', meHint: 'Her satıra bir ad ya da hesabın son 4 hanesi. Yön bunlardan bulunur.', meSave: 'Kaydet',
      openOriginal: 'Orijinal dekontu aç', docTitle: 'dekontu', editNote: 'Notu düzenle', autoDone: 'Sham Cash: {n} dekont kendiliğinden kaydedildi',
      waiting: 'Sham Cash: {n} dekont onayınızı bekliyor', open: 'Aç', fileErr: 'Dosya okunamadı', pdfOnly: 'Yalnız PDF, JPEG ya da PNG',
      checkField: 'iki okuma farklı',
      fAttach: '📎 Sham Cash dekontu ekle (PDF / resim)', fAttachTip: 'Dekont okunur, alanlar kendiliğinden dolar; orijinal dosya kayda olduğu gibi eklenir',
      fAttached: 'Ekli dekont', fRemove: 'Kaldır', fRead: '✓ Dekont okundu, alanlar dolduruldu — kontrol edip kaydedin',
      fReadDiff: '⚠ Dekont okundu ama iki okuma farklı ({f}) — tutar ve işlem noyu dekontla karşılaştırın',
      fNone: '⚠ Dekont okunamadı — dosya eklendi, alanları elle doldurun', fDup: 'Bu dekont zaten kayıtlı (aynı işlem no). Eklenmedi.',
      fAcc: 'Kasa Sham Cash kasası olarak ayarlandı: {a}', fCur: 'Dikkat: dekontun para birimi {c}; {c} Sham Cash kasası yok', fLocked: 'Dekont bilgileri (değiştirilemez)',
      fReading: 'Dekont okunuyor…', fStepOn: '🌐 Online okunuyor (yapay zekâ)…', fStepOff: '📴 Offline okunuyor / teyit ediliyor…',
      stOn: '🌐 Online: {s} sn…', stOnOk: '🌐 Online ✓ {s} sn', stOnNo: '🌐 Online yok', stOff: '📴 Offline teyit: {s} sn…', stOffOk: '📴 Offline ✓ {s} sn', stOffNo: '📴 Offline yok',
      fSkip: '⏭ Beklemeden doldur', fSkipTip: 'Hazır olan okumayla alanları hemen doldurur; diğer okuma arkada sürer ve bitince sonuç tabloya eklenir',
      mAiWait: '🌐 Online okundu · 📴 offline teyit arkada sürüyor…', mOffWait: '📴 Offline okundu · 🌐 online okuma arkada sürüyor…', fLateDiff: '⚠ Arkadan gelen okuma bazı alanlarda farklı — dekont tablosundan doğrusunu seçin', fLateOk: '✓ Arkadan gelen okuma alanları teyit etti',
      mBoth: '🌐 Online okundu · ✓ offline okumayla teyit edildi', mDiff: '🌐 Online okundu · ⚠ offline okuma {n} alanda farklı — aşağıdan doğrusunu seçin',
      mAiOnly: '🌐 Online okundu · offline teyit yapılamadı — alanları dekontla karşılaştırın', mOffNet: '📴 İnternet yok: offline okundu — alanları kontrol edin',
      mOffKey: '📴 Yapay zekâ anahtarı yok: offline okundu — alanları kontrol edin', mOff: '📴 Offline okundu (online okuma yapılamadı) — alanları kontrol edin',
      mNone: '⚠ Dekont okunamadı — dosya eklendi, alanları elle doldurun',
      sOk: 'teyitli', sAi: 'yalnız online', sOff: 'yalnız offline', sDiff: 'farklı', pickOn: 'Online', pickOff: 'Offline',
      filled: 'Forma dolduruldu. Kontrol edip «Kaydet»e basın; «İptal» derseniz hiçbir şey kaydedilmez.',
      kindDir: '{k} → {d}', conflict: '⚠ Dekont türü {k}: Tür «{d}» yapıldı. Bu dekont sizin değilse Tür\'ü değiştirin.',
      dropHere: 'Sham Cash dekontunu buraya bırakın (PDF / JPEG / PNG)', payeeHit: 'Kayıtlı alıcı: {n}', other_in: 'Gönderen', other_out: 'Alıcı',
      other_acc_in: 'Gönderen hesap', other_acc_out: 'Alıcı hesap', ocrSham: 'Sham Cash dekontu tanındı'
    },
    en: {
      btn: 'Sham Cash receipt', btnTip: 'Reads a Sham Cash receipt (PDF or image) and records it as cash in / cash out',
      title: 'Sham Cash receipts', pick: '📄 Choose receipt (PDF / image)', drop: 'Drag receipts here or choose them. You can add several.',
      inbox: '📁 Receipts folder', inboxTip: 'Receipts placed in this folder are read automatically while the program is open',
      reading: 'Reading…', readAi: '✓ Read with AI', readOff: '⚠ Read offline — compare the fields with the receipt',
      readBoth: '✓ Read with AI and confirmed by the offline reading', readDiff: '⚠ The two readings differ: check the marked fields',
      readSide: '✓ From verified details', readNone: '⚠ Could not be read — fill in the fields from the receipt', readNoAi: 'No AI key / no internet: read offline',
      docInfo: 'Details on the receipt (as printed)', docHint: 'Names and accounts are saved exactly as printed. If a letter was misread, correct only that letter.',
      kind: 'Transaction type', ref: 'Transaction no', date: 'Date', time: 'Time', dateTime: 'Date / time', from_name: 'Sender', from_account: 'Sender account',
      to_name: 'Recipient', to_account: 'Recipient account', amount: 'Amount', currency: 'Currency', amountCur: 'Amount', docNote: 'Receipt note', note: 'Receipt note',
      record: 'Record', dir: 'Direction', in: 'Cash in', out: 'Cash out', account: 'Cash box', category: 'Category', description: 'Description', descPh: 'Optional',
      myNote: 'My note', myNotePh: 'e.g. actual owner, purpose', addToCash: 'Post to the cash box (unticked: record only)',
      meSender: 'You are the sender → cash out', meRecipient: 'You are the recipient → cash in', meUnknown: 'Which one are you?',
      iamSender: 'I am the sender', iamRecipient: 'I am the recipient', neither: 'Neither',
      save: 'Save', skip: 'Skip', cancel: 'Cancel', close: 'Close', saved: '✓ Saved', savedAuto: '✓ Saved automatically',
      dup: 'This receipt is already recorded (same transaction no). It was not written twice.', curMismatch: 'Note: the receipt currency ({a}) differs from the selected cash box ({b})',
      noAccount: 'There is no {c} cash box. Choose a cash box.', needDir: 'Choose the direction first', needAmount: 'Amount and transaction no are required',
      me: 'My Sham Cash names and accounts', meHint: 'One name or the last 4 digits of an account per line. The direction is found from these.', meSave: 'Save',
      openOriginal: 'Open original receipt', docTitle: 'receipt', editNote: 'Edit note', autoDone: 'Sham Cash: {n} receipt(s) saved automatically',
      waiting: 'Sham Cash: {n} receipt(s) waiting for your approval', open: 'Open', fileErr: 'The file could not be read', pdfOnly: 'PDF, JPEG or PNG only',
      checkField: 'the two readings differ',
      fAttach: '📎 Attach Sham Cash receipt (PDF / image)', fAttachTip: 'The receipt is read and the fields are filled in; the original file is attached unchanged',
      fAttached: 'Attached receipt', fRemove: 'Remove', fRead: '✓ Receipt read and fields filled in — check and save',
      fReadDiff: '⚠ Receipt read but the two readings differ ({f}) — compare the amount and transaction no with the receipt',
      fNone: '⚠ The receipt could not be read — the file is attached, fill in the fields by hand', fDup: 'This receipt is already recorded (same transaction no). Not attached.',
      fAcc: 'Cash box set to the Sham Cash box: {a}', fCur: 'Note: the receipt currency is {c}; there is no {c} Sham Cash box', fLocked: 'Receipt details (cannot be changed)',
      fReading: 'Reading receipt…', fStepOn: '🌐 Reading online (AI)…', fStepOff: '📴 Reading / confirming offline…',
      stOn: '🌐 Online: {s} s…', stOnOk: '🌐 Online ✓ {s} s', stOnNo: '🌐 Online n/a', stOff: '📴 Offline check: {s} s…', stOffOk: '📴 Offline ✓ {s} s', stOffNo: '📴 Offline n/a',
      fSkip: '⏭ Fill in without waiting', fSkipTip: 'Fills the fields now with the reading that is ready; the other reading continues in the background and is added to the table when done',
      mAiWait: '🌐 Read online · 📴 offline confirmation still running…', mOffWait: '📴 Read offline · 🌐 online reading still running…', fLateDiff: '⚠ The later reading differs in some fields — choose the correct value in the receipt table', fLateOk: '✓ The later reading confirmed the fields',
      mBoth: '🌐 Read online · ✓ confirmed by the offline reading', mDiff: '🌐 Read online · ⚠ the offline reading differs in {n} field(s) — choose the correct value below',
      mAiOnly: '🌐 Read online · offline confirmation not possible — compare the fields with the receipt', mOffNet: '📴 No internet: read offline — check the fields',
      mOffKey: '📴 No AI key: read offline — check the fields', mOff: '📴 Read offline (online reading failed) — check the fields',
      mNone: '⚠ The receipt could not be read — the file is attached, fill in the fields by hand',
      sOk: 'confirmed', sAi: 'online only', sOff: 'offline only', sDiff: 'differs', pickOn: 'Online', pickOff: 'Offline',
      filled: 'Filled into the form. Check and press «Save»; «Cancel» records nothing.',
      kindDir: '{k} → {d}', conflict: '⚠ Receipt type {k}: Type set to «{d}». If this is not your receipt, change the Type.',
      dropHere: 'Drop the Sham Cash receipt here (PDF / JPEG / PNG)', payeeHit: 'Saved recipient: {n}', other_in: 'Sender', other_out: 'Recipient',
      other_acc_in: 'Sender account', other_acc_out: 'Recipient account', ocrSham: 'Sham Cash receipt recognised'
    },
    ar: {
      btn: 'إيصال شام كاش', btnTip: 'يقرأ إيصال شام كاش (PDF أو صورة) ويسجّله كإدخال أو إخراج في الصندوق',
      title: 'إيصالات شام كاش', pick: '📄 اختيار إيصال (PDF / صورة)', drop: 'اسحب الإيصالات إلى هنا أو اخترها. يمكن إضافة أكثر من إيصال.',
      inbox: '📁 مجلد الإيصالات', inboxTip: 'تُقرأ الإيصالات الموضوعة في هذا المجلد تلقائياً أثناء عمل البرنامج',
      reading: 'جارٍ القراءة…', readAi: '✓ قُرئ بالذكاء الاصطناعي', readOff: '⚠ قُرئ دون اتصال — قارن الحقول بالإيصال',
      readBoth: '✓ قُرئ بالذكاء الاصطناعي وتأكّد بالقراءة دون اتصال', readDiff: '⚠ القراءتان مختلفتان: تحقّق من الحقول المعلَّمة',
      readSide: '✓ من بيانات مُتحقَّق منها', readNone: '⚠ تعذّرت القراءة — املأ الحقول من الإيصال', readNoAi: 'لا يوجد مفتاح ذكاء اصطناعي / لا يوجد إنترنت: قُرئ دون اتصال',
      docInfo: 'بيانات الإيصال (كما هي)', docHint: 'تُحفظ الأسماء والحسابات كما وردت في الإيصال تماماً. إن أُخطئ في قراءة حرف فصحّح ذلك الحرف فقط.',
      kind: 'نوع العملية', ref: 'رقم العملية', date: 'التاريخ', time: 'الوقت', dateTime: 'التاريخ / الوقت', from_name: 'المرسل', from_account: 'حساب المرسل',
      to_name: 'المستلم', to_account: 'حساب المستلم', amount: 'المبلغ', currency: 'العملة', amountCur: 'المبلغ', docNote: 'ملاحظة الإيصال', note: 'ملاحظة الإيصال',
      record: 'القيد', dir: 'الاتجاه', in: 'إدخال', out: 'إخراج', account: 'الصندوق', category: 'التصنيف', description: 'الوصف', descPh: 'اختياري',
      myNote: 'ملاحظتي', myNotePh: 'مثلاً: المالك الفعلي، الغرض', addToCash: 'ترحيل إلى الصندوق (دون تحديد: قيد للعلم فقط)',
      meSender: 'أنت المرسل ← إخراج', meRecipient: 'أنت المستلم ← إدخال', meUnknown: 'أيّهما أنت؟',
      iamSender: 'أنا المرسل', iamRecipient: 'أنا المستلم', neither: 'لا هذا ولا ذاك',
      save: 'حفظ', skip: 'تخطٍّ', cancel: 'إلغاء', close: 'إغلاق', saved: '✓ حُفظ', savedAuto: '✓ حُفظ تلقائياً',
      dup: 'هذا الإيصال مسجَّل مسبقاً (رقم العملية نفسه). لم يُسجَّل مرة ثانية.', curMismatch: 'تنبيه: عملة الإيصال ({a}) تختلف عن عملة الصندوق المحدد ({b})',
      noAccount: 'لا يوجد صندوق {c}. اختر صندوقاً.', needDir: 'اختر الاتجاه أولاً', needAmount: 'المبلغ ورقم العملية مطلوبان',
      me: 'أسمائي وحساباتي في شام كاش', meHint: 'اسم واحد أو آخر 4 أرقام من الحساب في كل سطر. يُحدَّد الاتجاه منها.', meSave: 'حفظ',
      openOriginal: 'فتح الإيصال الأصلي', docTitle: 'إيصال', editNote: 'تعديل الملاحظة', autoDone: 'شام كاش: حُفظ {n} إيصال تلقائياً',
      waiting: 'شام كاش: {n} إيصال بانتظار موافقتك', open: 'فتح', fileErr: 'تعذّرت قراءة الملف', pdfOnly: 'PDF أو JPEG أو PNG فقط',
      checkField: 'القراءتان مختلفتان',
      fAttach: '📎 إرفاق إيصال شام كاش (PDF / صورة)', fAttachTip: 'يُقرأ الإيصال وتُملأ الحقول تلقائياً؛ ويُرفق الملف الأصلي دون تغيير',
      fAttached: 'الإيصال المرفق', fRemove: 'إزالة', fRead: '✓ قُرئ الإيصال ومُلئت الحقول — تحقّق ثم احفظ',
      fReadDiff: '⚠ قُرئ الإيصال لكن القراءتين مختلفتان ({f}) — قارن المبلغ ورقم العملية بالإيصال',
      fNone: '⚠ تعذّرت قراءة الإيصال — أُرفق الملف، املأ الحقول يدوياً', fDup: 'هذا الإيصال مسجَّل مسبقاً (رقم العملية نفسه). لم يُرفق.',
      fAcc: 'ضُبط الصندوق على صندوق شام كاش: {a}', fCur: 'تنبيه: عملة الإيصال {c}؛ ولا يوجد صندوق شام كاش بعملة {c}', fLocked: 'بيانات الإيصال (لا تُعدَّل)',
      fReading: 'جارٍ قراءة الإيصال…', fStepOn: '🌐 قراءة عبر الإنترنت (ذكاء اصطناعي)…', fStepOff: '📴 قراءة / تحقّق دون اتصال…',
      stOn: '🌐 عبر الإنترنت: {s} ث…', stOnOk: '🌐 عبر الإنترنت ✓ {s} ث', stOnNo: '🌐 عبر الإنترنت غير متاح', stOff: '📴 تحقّق دون اتصال: {s} ث…', stOffOk: '📴 دون اتصال ✓ {s} ث', stOffNo: '📴 دون اتصال غير متاح',
      fSkip: '⏭ املأ دون انتظار', fSkipTip: 'يملأ الحقول الآن بالقراءة الجاهزة؛ وتستمر القراءة الأخرى في الخلفية وتُضاف نتيجتها إلى الجدول عند انتهائها',
      mAiWait: '🌐 قُرئ عبر الإنترنت · 📴 التحقّق دون اتصال جارٍ في الخلفية…', mOffWait: '📴 قُرئ دون اتصال · 🌐 القراءة عبر الإنترنت جارية في الخلفية…', fLateDiff: '⚠ القراءة اللاحقة تختلف في بعض الحقول — اختر القيمة الصحيحة من جدول الإيصال', fLateOk: '✓ أكّدت القراءة اللاحقة الحقول',
      mBoth: '🌐 قُرئ عبر الإنترنت · ✓ وتأكّد بالقراءة دون اتصال', mDiff: '🌐 قُرئ عبر الإنترنت · ⚠ القراءة دون اتصال تختلف في {n} حقل — اختر القيمة الصحيحة أدناه',
      mAiOnly: '🌐 قُرئ عبر الإنترنت · تعذّر التحقّق دون اتصال — قارن الحقول بالإيصال', mOffNet: '📴 لا يوجد إنترنت: قُرئ دون اتصال — تحقّق من الحقول',
      mOffKey: '📴 لا يوجد مفتاح ذكاء اصطناعي: قُرئ دون اتصال — تحقّق من الحقول', mOff: '📴 قُرئ دون اتصال (تعذّرت القراءة عبر الإنترنت) — تحقّق من الحقول',
      mNone: '⚠ تعذّرت قراءة الإيصال — أُرفق الملف، املأ الحقول يدوياً',
      sOk: 'مؤكَّد', sAi: 'عبر الإنترنت فقط', sOff: 'دون اتصال فقط', sDiff: 'مختلف', pickOn: 'عبر الإنترنت', pickOff: 'دون اتصال',
      filled: 'مُلئت الحقول في النموذج. تحقّق ثم اضغط «حفظ»؛ وعند «إلغاء» لا يُسجَّل شيء.',
      kindDir: '{k} ← {d}', conflict: '⚠ نوع الإيصال {k}: ضُبط النوع على «{d}». إن لم يكن هذا إيصالك فغيّر النوع.',
      dropHere: 'أفلت إيصال شام كاش هنا (PDF / JPEG / PNG)', payeeHit: 'مستلم محفوظ: {n}', other_in: 'المرسل', other_out: 'المستلم',
      other_acc_in: 'حساب المرسل', other_acc_out: 'حساب المستلم', ocrSham: 'تم التعرّف على إيصال شام كاش'
    }
  };
  var CATS = {
    tr: { capital: 'Sermaye', sale: 'Satış', purchase: 'Alış', expense: 'Gider', salary: 'Maaş', rent: 'Kira', bill: 'Fatura', debt: 'Borç / alacak', gift: 'Örtülü ödenek', profit_share: 'Kâr payı', material: 'Malzeme', asset: 'Demirbaş', transfer: 'Aktarım', crypto_in: 'Kripto giriş', crypto_out: 'Kripto çıkış', other: 'Diğer' },
    en: { capital: 'Capital', sale: 'Sale', purchase: 'Purchase', expense: 'Expense', salary: 'Salary', rent: 'Rent', bill: 'Bill', debt: 'Debt / receivable', gift: 'Discretionary fund', profit_share: 'Profit share', material: 'Material', asset: 'Fixed asset', transfer: 'Transfer', crypto_in: 'Crypto in', crypto_out: 'Crypto out', other: 'Other' },
    ar: { capital: 'رأس المال', sale: 'مبيعات', purchase: 'مشتريات', expense: 'مصروف', salary: 'رواتب', rent: 'إيجار', bill: 'فاتورة', debt: 'دين / ذمم', gift: 'مخصص سري', profit_share: 'حصة أرباح', material: 'مواد', asset: 'أصول ثابتة', transfer: 'تحويل', crypto_in: 'إدخال عملات مشفرة', crypto_out: 'إخراج عملات مشفرة', other: 'أخرى' }
  };
  var ui = function () { var l = document.documentElement.lang; return TX[l] ? l : 'tr'; };
  var t = function (k, v) { var s = (TX[ui()] || TX.tr)[k] || TX.tr[k] || k; if (v) for (var x in v) s = s.split('{' + x + '}').join(v[x]); return s; };

  var F = function () { return window.falcon || {}; };
  var isDesk = function () { return F().platform !== 'android'; };
  var base = (function () {
    try { var s = document.currentScript && document.currentScript.src; if (s) return s.replace(/[^\/]*$/, ''); } catch (e) {}
    return './assets/';
  })();
  var unwrap = function (r) { if (r && typeof r === 'object' && 'ok' in r) { if (!r.ok) { var e = new Error(r.error || 'ERR'); e.code = r.error; throw e; } return r.data; } return r; };
  function setting(k) { try { return Promise.resolve(F().settings.get(k)).then(function (v) { return v == null ? '' : String(v); }, function () { return ''; }); } catch (e) { return Promise.resolve(''); } }
  function setSetting(k, v) { try { return Promise.resolve(F().settings.set(k, v)).catch(function () {}); } catch (e) { return Promise.resolve(); } }
  function dbAll(sql, p) { try { return Promise.resolve(F().db.all(sql, p || [])).then(function (r) { return Array.isArray(r) ? r : (r && r.data) || []; }, function () { return []; }); } catch (e) { return Promise.resolve([]); } }
  function call(name, payload) { return Promise.resolve(F().call(name, payload)).then(unwrap); }

  // ---------- yardımcılar ----------
  var clean = function (s) { return String(s == null ? '' : s).replace(/[‎‏‪-‮⁦-⁩]/g, '').replace(/\s+/g, ' ').trim(); };
  var nospace = function (s) { return clean(s).replace(/\s+/g, ''); };
  var last4 = function (s) { var d = String(s || '').replace(/\D/g, ''); return d.length >= 4 ? d.slice(-4) : ''; };
  function toIso(d) {
    var m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(clean(d));
    if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    m = /^(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})$/.exec(clean(d));
    return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : '';
  }
  function validDate(d) { var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d || ''); return !!m && +m[1] >= 1 && +m[1] <= 31 && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 2015 && +m[3] <= 2099; }
  function curOf(s) {
    s = String(s || '');
    if (/USD|\$|دولار/i.test(s)) return 'USD';
    if (/SYP|ل\.?\s?س|ليرة سورية|S\.?P/i.test(s)) return 'SYP';
    if (/TRY|TL\b|₺/i.test(s)) return 'TRY';
    if (/EUR|€/i.test(s)) return 'EUR';
    return '';
  }
  function amountNum(s) {
    var x = String(s || '').replace(/[^\d.,]/g, '');
    if (!x) return null;
    if (/,\d{3}(\D|$)/.test(x) && x.indexOf('.') < 0) x = x.replace(/,/g, '');
    else if (x.indexOf(',') >= 0 && x.indexOf('.') >= 0) x = x.lastIndexOf(',') > x.lastIndexOf('.') ? x.replace(/\./g, '').replace(',', '.') : x.replace(/,/g, '');
    else if (x.indexOf(',') >= 0) x = x.replace(',', '.');
    var n = Number(x);
    return isFinite(n) && n > 0 ? n : null;
  }
  // Sham Cash dosya adı: sham_cash_receipt_20261126_190349_….pdf → 26/11/2026, 19:03:49 (yalnız teyit / yedek)
  function fromFileName(n) {
    var m = /(20\d{2})(\d{2})(\d{2})[_\-](\d{2})(\d{2})(\d{2})/.exec(String(n || ''));
    return m ? { date: m[3] + '/' + m[2] + '/' + m[1], time: m[4] + ':' + m[5] + ':' + m[6] } : null;
  }
  function b64(u8) {
    var s = '', CH = 0x8000;
    for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return btoa(s);
  }
  function mimeOf(name, mime) {
    if (mime && /pdf|jpe?g|png|webp/.test(mime)) return mime;
    var e = String(name || '').toLowerCase().split('.').pop();
    return e === 'pdf' ? 'application/pdf' : e === 'png' ? 'image/png' : e === 'webp' ? 'image/webp' : /jpe?g/.test(e) ? 'image/jpeg' : '';
  }

  // ---------- görüntü: PDF'in 1. sayfası ya da resim → tuval ----------
  var pdfjsP = null;
  function pdfjs() {
    if (!pdfjsP) {
      pdfjsP = import(base + 'pdfjs/pdf.min.mjs').then(function (lib) {
        lib.GlobalWorkerOptions.workerSrc = base + 'pdfjs/pdf.worker.min.mjs';
        return import(base + 'pdfjs/pdf.worker.min.mjs').then(function (w) { window.pdfjsWorker = w; return lib; }, function () { return lib; });
      });
      pdfjsP.catch(function () { pdfjsP = null; });
    }
    return pdfjsP;
  }
  // Dönüş: { canvas, text } — text: PDF'te yazı katmanı varsa (satırlar), yoksa ''
  function toCanvas(u8, mime) {
    if (mime === 'application/pdf') {
      return pdfjs().then(function (lib) { return lib.getDocument({ data: u8.slice(0), isEvalSupported: false, useSystemFonts: true }).promise; }).then(function (doc) {
        return doc.getPage(1).then(function (pg) {
          var vp1 = pg.getViewport({ scale: 1 }), sc = Math.min(4, 2480 / vp1.width), vp = pg.getViewport({ scale: sc });
          var c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
          var cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
          return pg.getTextContent().then(function (tc) {
            var rows = {};
            tc.items.forEach(function (it) { if (!it.str || !it.str.trim()) return; var y = Math.round((vp1.height - it.transform[5]) / 4); (rows[y] = rows[y] || []).push({ x: it.transform[4], s: it.str }); });
            var text = Object.keys(rows).sort(function (a, b) { return a - b; }).map(function (y) { return rows[y].sort(function (a, b) { return a.x - b.x; }).map(function (i) { return i.s; }).join(' '); }).join('\n');
            return pg.render({ canvasContext: cx, viewport: vp }).promise.then(function () { try { doc.destroy(); } catch (e) {} return { canvas: c, text: text }; });
          });
        });
      });
    }
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(new Blob([u8], { type: mime || 'image/jpeg' })), im = new Image();
      im.onload = function () {
        var sc = Math.min(3, Math.max(1, 2480 / im.naturalWidth)), c = document.createElement('canvas');
        c.width = Math.round(im.naturalWidth * sc); c.height = Math.round(im.naturalHeight * sc);
        var cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height); cx.drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); res({ canvas: c, text: '' });
      };
      im.onerror = function () { URL.revokeObjectURL(url); rej(new Error('image')); };
      im.src = url;
    });
  }

  // ---------- 1) çevrimiçi yapay zekâ ----------
  var API = 'https://generativelanguage.googleapis.com/v1beta/';
  var FALLBACK = ['gemini-flash-latest', 'gemini-pro-latest', 'gemini-3.8-flash', 'gemini-3.6-flash'];
  function http(url, body, key, ms) {
    var ai = F().ai;
    if (ai && ai.request) return Promise.resolve(ai.request({ url: url, body: body, key: key, timeout: ms })).then(function (r) { if (r && r.status === 0) { var e = new Error(r.error || 'network'); e.net = true; throw e; } return r; });
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null, tm = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms);
    return fetch(url, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: body ? JSON.stringify(body) : undefined, signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) { clearTimeout(tm); return res.json().catch(function () { return null; }).then(function (d) { return { status: res.status, data: d }; }); }, function (e) { clearTimeout(tm); var x = new Error(String(e && e.message || e)); x.net = true; throw x; });
  }
  var AI_REQ = 25000, AI_TOTAL = 45000;
  var modelsCache = null;
  function models(key) {
    if (modelsCache) return Promise.resolve(modelsCache);
    // v1.67.2: liste 24 saat saklanır (her açılışta model listesi beklenmesin)
    try { var mc = JSON.parse(localStorage.getItem('sc_ai_models') || 'null'); if (mc && mc.l && mc.l.length && Date.now() - mc.t < 864e5) { modelsCache = mc.l; return Promise.resolve(modelsCache); } } catch (e) {}
    return http(API + 'models?pageSize=200', null, key, 10000).then(function (r) {
      if (r.status === 401 || r.status === 403) { var e = new Error('ai-key'); e.key = true; throw e; }
      var ls = r.data && r.data.models ? r.data.models.filter(function (m) { return (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0; }).map(function (m) { return String(m.name).replace(/^models\//, ''); }) : [];
      var sc = function (n) { var m = /^gemini-(\d+(?:\.\d+)?)-(pro|flash)(-lite)?(?:-(.*))?$/.exec(n); if (!m || /image|tts|audio|live|embed|thinking-exp|computer|robotics|nano/.test(n)) return null; return (m[2] === 'flash' && !m[3] ? 3 : m[2] === 'pro' ? 2 : 1) * 1000 + Number(m[1]) * 100 - (m[4] ? (/preview/.test(m[4]) ? 1 : 2) : 0); };
      var best = ls.map(function (n) { return { n: n, s: sc(n) }; }).filter(function (x) { return x.s != null; }).sort(function (a, b) { return b.s - a.s; }).map(function (x) { return x.n; });
      modelsCache = best.length ? best.slice(0, 4) : FALLBACK;
      if (best.length) try { localStorage.setItem('sc_ai_models', JSON.stringify({ t: Date.now(), l: modelsCache })); } catch (e) {}
      return modelsCache;
    }, function (e) { if (e.net) throw e; return FALLBACK; });
  }
  var PROMPT = [
    'This is a money transfer receipt from the Syrian e-wallet "Sham Cash" (ShamCash). Return ONLY JSON, no prose.',
    'Copy every value EXACTLY as printed, character by character. NEVER translate or transliterate. Keep Arabic names in Arabic letters exactly',
    '(same letters, hamza, dots, spaces and word order). Keep masked account numbers with their asterisks (e.g. "************0951").',
    'Keys: {"kind":"TRANSACTION value, e.g. SEND / RECEIVE","ref":"TRANSACTION NUMBER","date":"DD/MM/YYYY","time":"HH:MM:SS",',
    '"from_name":"SENDER NAME","from_account":"SENDER ACCOUNT","to_name":"RECIPIENT NAME","to_account":"RECIPIENT ACCOUNT",',
    '"amount":"number only as printed, e.g. 300 or 1,500,000","currency":"as printed, e.g. USD or SYP","note":"NOTE value (\\"-\\" if empty)","generated":"GENERATED BY date"}',
    'If the receipt labels are in Arabic, map them the same way. Unknown → "". Do not guess.'
  ].join('\n');
  function viaAi(u8, mime) {
    return Promise.all([setting('ai_gemini_key'), setting('ai_mode')]).then(function (r) {
      var key = r[0].trim();
      if (!key || r[1] === 'local') { var e = new Error('no-ai'); e.skip = true; throw e; }
      if (navigator.onLine === false) { var e2 = new Error('offline'); e2.net = true; throw e2; }
      var data = b64(u8), t0 = Date.now();
      // v1.67.2: hız — istek başına 25 sn, toplam 45 sn; meşgul / kota (429, 5xx) cevabında hemen sonraki model;
      // dekontu kopyalamak için «düşünme» kapalı (flash: minimal / bütçe 0, pro: low / 128). Model düşünme ayarını kabul etmezse
      // (400) aynı model bir sonraki biçimle denenir; çalışan biçim modele göre hatırlanır.
      var body = function (m, v) {
        var g = { temperature: 0, responseMimeType: 'application/json' }, pro = /-pro/.test(m);
        if (v === 0) g.thinkingConfig = { thinkingLevel: pro ? 'low' : 'minimal' };
        else if (v === 1) g.thinkingConfig = { thinkingBudget: pro ? 128 : 0 };
        return { contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime, data: data } }, { text: PROMPT }] }], generationConfig: g };
      };
      var memo = {}; try { memo = JSON.parse(localStorage.getItem('sc_ai_think') || '{}') || {}; } catch (e) { memo = {}; }
      return models(key).then(function (list) {
        var i = 0, last = null;
        var next = function () {
          if (i >= list.length) throw last || new Error('ai-failed');
          var left = AI_TOTAL - (Date.now() - t0);
          if (left < 8000) { var et = new Error('timeout'); et.timeout = true; throw last || et; }
          var m = list[i++];
          var tryV = function (v) {
            return http(API + 'models/' + encodeURIComponent(m) + ':generateContent', body(m, v), key, Math.min(AI_REQ, left)).then(function (res) {
              if (res.status === 401 || res.status === 403) { var e = new Error('ai-key'); e.key = true; throw e; }
              if (res.status === 400 && v < 2 && /thinking/i.test(JSON.stringify(res.data || ''))) { memo[m] = v + 1; try { localStorage.setItem('sc_ai_think', JSON.stringify(memo)); } catch (e) {} left = AI_TOTAL - (Date.now() - t0); return tryV(v + 1); }
              if (res.status !== 200) { last = new Error('ai-' + res.status); return next(); }
              var parts = res.data && res.data.candidates && res.data.candidates[0] && res.data.candidates[0].content && res.data.candidates[0].content.parts || [];
              var txt = parts.filter(function (p) { return !p.thought; }).map(function (p) { return p.text || ''; }).join('').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
              var o; try { o = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1)); } catch (e) { last = e; return next(); }
              o = normDoc(o); o._model = m;
              if (!o.ref && !o.amount) { last = new Error('ai-empty'); return next(); }
              return o;
            }, function (e) { if (e && /timeout/i.test(e.message)) { last = e; return next(); } throw e; });
          };
          return tryV(memo[m] || 0);
        };
        return next();
      });
    });
  }
  function normDoc(o) {
    o = o || {};
    var d = {};
    ['kind', 'ref', 'date', 'time', 'from_name', 'from_account', 'to_name', 'to_account', 'amount', 'currency', 'note', 'generated'].forEach(function (k) { d[k] = clean(o[k]); });
    d.ref = d.ref.replace(/\s/g, '');
    if (d.currency) d.currency = curOf(d.currency) || d.currency.toUpperCase();
    if (!d.currency) d.currency = curOf(o.amount);
    d.amount = d.amount.replace(/[^\d.,]/g, '');
    d.kind = d.kind.toUpperCase();
    return d;
  }

  // ---------- 2) çevrimdışı okuma (masaüstü) ----------
  var ocrP = null;
  function ocrAvailable() { return isDesk() && !!(F().files && F().files.read); }
  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
  function ocrWorkers() {
    if (!ocrP) {
      ocrP = (window.Tesseract ? Promise.resolve() : loadScript(base + 'ocr/tesseract.min.js')).then(function () {
        var o = { workerPath: base + 'ocr/worker.min.js', corePath: base + 'ocr/tesseract-core-simd-lstm.wasm.js', langPath: 'falcon://app/ocr', workerBlobURL: false, cacheMethod: 'none', gzip: true };
        return Promise.all([window.Tesseract.createWorker('eng', 1, o), window.Tesseract.createWorker('ara', 1, o)]);
      }).then(function (w) { return { eng: w[0], ara: w[1] }; });
      ocrP.catch(function () { ocrP = null; });
    }
    return ocrP;
  }
  // Etiketler (soldaki büyük harfler) her zaman iyi okunur: önce sayfa okunup satırlar bulunur, sonra her değerin bölgesi
  // ayrı okunur. Rakamlar nokta vuruşlu (dot-matrix) yazı olduğundan bölge bulanıklaştırılıp eşiklenir.
  var LABELS = [
    ['kind', /^TRANSACTION\s*$|^TRANSACTION\s+(?!NUMBER|DATE)/], ['ref', /TRANSACTION\s*NUMB/], ['date', /TRANSACTION\s*(DATE|\d)/],
    ['from_name', /SENDER\s*NAME/], ['from_account', /SENDER\s*[AR]CC/], ['to_name', /RECIPIENT\s*NAME/], ['to_account', /RECIPIENT\s*[AR]CC/],
    ['amount', /^AMOUNT/], ['note', /^NOTE/], ['generated', /GENERATED/]
  ];
  // Örnek dekonttaki satır yükseklikleri (sayfa yüksekliğine oran) — etiket bulunamazsa
  var ROWS = { kind: 0.166, ref: 0.233, date: 0.300, from_name: 0.401, from_account: 0.469, to_name: 0.537, to_account: 0.606, amount: 0.673, note: 0.740, generated: 0.950 };
  function crop(src, x, y, w, h, mode) {
    var c = document.createElement('canvas'), sc = mode === 'name' ? 1 : 1;
    c.width = Math.max(1, Math.round(w * sc)); c.height = Math.max(1, Math.round(h * sc));
    var cx = c.getContext('2d', { willReadFrequently: true });
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
    if (mode === 'digits') cx.filter = 'blur(' + Math.max(1, Math.round(3 * src.width / 2480)) + 'px)';
    cx.drawImage(src, x, y, w, h, 0, 0, c.width, c.height);
    cx.filter = 'none';
    var img = cx.getImageData(0, 0, c.width, c.height), d = img.data, thr = mode === 'digits' ? 200 : 170;
    for (var i = 0; i < d.length; i += 4) { var v = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) < thr ? 0 : 255; d[i] = d[i + 1] = d[i + 2] = v; }
    cx.putImageData(img, 0, 0);
    return c;
  }
  function viaOcr(cv) {
    return ocrWorkers().then(function (W) {
      var H = cv.height, Wd = cv.width;
      return W.eng.setParameters({ tessedit_pageseg_mode: '3', tessedit_char_whitelist: '', user_defined_dpi: '300' }).then(function () {
        return W.eng.recognize(cv, {}, { blocks: true });
      }).then(function (r) {
        var lines = [];
        (r.data.blocks || []).forEach(function (b) { (b.paragraphs || []).forEach(function (p) { (p.lines || []).forEach(function (l) { lines.push(l); }); }); });
        var pos = {};
        LABELS.forEach(function (L) {
          for (var i = 0; i < lines.length; i++) { var tx = clean(lines[i].text).toUpperCase(); if (L[1].test(tx) && !pos[L[0]]) { pos[L[0]] = lines[i].bbox; break; } }
        });
        var y = function (k) { var b = pos[k]; if (b) return { y0: b.y0, y1: b.y1 }; var c = ROWS[k] * H; return { y0: c - 0.012 * H, y1: c + 0.012 * H }; };
        // değerler sağa yaslı: satırın sağ ucu (etiket satırının kutusu değeri de kapsar)
        var right = function (k) { var b = pos[k]; return b && b.x1 > Wd * 0.8 ? Math.min(Wd, b.x1 + Math.round(Wd * 0.01)) : Math.round(Wd * 0.955); };
        var out = {}, seq = Promise.resolve();
        var field = function (k, mode, x0) {
          seq = seq.then(function () {
            var b = y(k), pad = Math.round((b.y1 - b.y0) * 0.35), x = Math.round(Wd * x0), xr = right(k);
            // hesap no: yalnız son 4 hane okunur (yıldızlar rakam sanılmasın); bir karakter ≈ satır yüksekliğinin 1,2 katı
            if (mode === 'last4') { x = Math.max(0, xr - Math.round((b.y1 - b.y0) * 1.25 * 4.6)); }
            var c = crop(cv, x, Math.max(0, b.y0 - pad), xr - x, Math.min(H, b.y1 + pad) - Math.max(0, b.y0 - pad), mode === 'last4' ? 'digits' : mode);
            var w = mode === 'name' ? W.ara : W.eng;
            var prm = mode === 'name' ? { tessedit_pageseg_mode: '7', preserve_interword_spaces: '1' } : { tessedit_pageseg_mode: '7', tessedit_char_whitelist: mode === 'last4' ? '0123456789' : mode === 'digits' ? '0123456789/:-*. ABCDEFGHIJKLMNOPQRSTUVWXYZ' : '' };
            prm.user_defined_dpi = '300';
            return w.setParameters(prm).then(function () { return w.recognize(c, {}, { blocks: mode === 'name' }); }).then(function (x) { out[k] = { text: mode === 'name' ? (spacedName(x.data, c.height) || clean(x.data.text)) : clean(x.data.text), conf: x.data.confidence }; });
          });
        };
        field('kind', 'digits', 0.55); field('ref', 'digits', 0.55); field('date', 'digits', 0.42);
        field('from_name', 'name', 0.40); field('from_account', 'last4', 0.42); field('to_name', 'name', 0.40); field('to_account', 'last4', 0.42);
        field('amount', 'digits', 0.55); field('note', 'digits', 0.55); field('generated', 'digits', 0.55);
        return seq.then(function () { return parseOcr(out); });
      });
    });
  }
  // Arapça adlarda çevrimdışı okuma bazen boşluğu kaçırır ("فخر الدين" → "فخرالدين"): harf kutuları arasındaki boşluk satır
  // yüksekliğinin ~%30'undan büyükse kelime ayrılır (sağdan sola; kutular üst üste binebildiğinden kelimenin en sol ucu izlenir).
  function spacedName(data, h) {
    var words = [];
    (data.blocks || []).forEach(function (b) { (b.paragraphs || []).forEach(function (p) { (p.lines || []).forEach(function (l) { (l.words || []).forEach(function (w) { words.push(w); }); }); }); });
    if (!words.length) return '';
    var out = [], thr = h * 0.3;
    words.forEach(function (w) {
      var sy = w.symbols || [], cur = '', minX = null;
      if (!sy.length) { if (clean(w.text)) out.push(clean(w.text)); return; }
      sy.forEach(function (q) {
        if (minX != null && minX - q.bbox.x1 > thr && cur) { out.push(cur); cur = ''; minX = null; }
        cur += q.text; minX = minX == null ? q.bbox.x0 : Math.min(minX, q.bbox.x0);
      });
      if (cur) out.push(cur);
    });
    return clean(out.join(' '));
  }
  function parseOcr(o) {
    var g = function (k) { return o[k] ? o[k].text : ''; };
    var d = { kind: (/SEND|RECEIVE|TRANSFER|DEPOSIT|WITHDRAW/.exec(g('kind').toUpperCase()) || [g('kind').replace(/[^A-Z ]/g, '').trim()])[0] };
    d.ref = (/\d{5,}/.exec(g('ref').replace(/\s/g, '')) || [''])[0];
    var dt = g('date'), tm = /(\d{2}):?(\d{2}):(\d{2})/.exec(dt);
    d.time = tm ? tm[1] + ':' + tm[2] + ':' + tm[3] : '';
    var iso = /(20\d{2})\s*[-\/.]\s*(\d{1,2})\s*[-\/.]\s*(\d{1,2})/.exec(dt);
    d.date = iso ? dateFix(('0' + iso[3]).slice(-2) + '/' + ('0' + iso[2]).slice(-2) + '/' + iso[1]) : dateFix(dt.split(/\s-\s|\s+-|-\s+/)[0]);
    var gen = /(\d{1,2}[\/7\-.]+\d{1,2}[\/7\-.]+\d{4})/.exec(g('generated'));
    d.generated = gen ? dateFix(gen[1]) : '';
    d.from_name = g('from_name'); d.to_name = g('to_name');
    // Sham Cash hesapları maskeli yazılır: "************" + son 4 hane (yalnız son 4 hane okunur)
    var acc = function (s) { var m = /(\d{4})\D*$/.exec(String(s).replace(/\s/g, '')); return m ? '************' + m[1] : ''; };
    d.from_account = acc(g('from_account')); d.to_account = acc(g('to_account'));
    var am = /([\d.,]+)\s*([A-Z]{3})?/.exec(g('amount').replace(/\s+(?=[\d])/g, ''));
    d.amount = am ? am[1] : ''; d.currency = curOf(g('amount')) || '';
    d.note = /^[-–—~_]?$/.test(g('note')) ? '-' : g('note');
    d._conf = {}; for (var k in o) d._conf[k] = o[k].conf;
    return d;
  }
  // "26/711/72026" gibi: bölü çizgisinden sonra fazladan okunan 7 / 1 atılır; geçerli tarih aranır
  function dateFix(s) {
    s = String(s || '').replace(/(\d)[-.](?=\d)/g, '$1/').replace(/[^\d\/]/g, '');
    if (validDate(s)) return s;
    var parts = s.split('/').filter(Boolean);
    var cands = [];
    var gen = function (i, acc) {
      if (i === parts.length) { cands.push(acc.join('/')); return; }
      var p = parts[i];
      gen(i + 1, acc.concat(p));
      if (i > 0 && /^[71]/.test(p) && p.length > 1) gen(i + 1, acc.concat(p.slice(1)));
    };
    if (parts.length === 3) gen(0, []);
    var dig = s.replace(/\D/g, '');
    if (dig.length === 8) cands.push(dig.slice(0, 2) + '/' + dig.slice(2, 4) + '/' + dig.slice(4));
    for (var i = 0; i < cands.length; i++) {
      var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(cands[i]);
      if (m) { var v = ('0' + m[1]).slice(-2) + '/' + ('0' + m[2]).slice(-2) + '/' + m[3]; if (validDate(v)) return v; }
    }
    return '';
  }

  // ---------- birleştirme / teyit ----------
  var CHECK = ['ref', 'amount', 'date', 'time', 'from_account', 'to_account', 'currency', 'kind'];
  var FIELDS = ['kind', 'ref', 'amount', 'currency', 'date', 'time', 'from_name', 'from_account', 'to_name', 'to_account'];
  // Genel OCR metninden (telefon) ad ve hesaplar güvenilir okunmaz: teyitte kullanılmaz
  var PARTIAL_SKIP = ['from_name', 'from_account', 'to_name', 'to_account'];
  function sameAny(k, a, b) { return /_name$/.test(k) ? nospace(a) === nospace(b) : same(k, a, b); }
  function same(k, a, b) {
    if (!a || !b) return true; // biri okuyamadıysa fark sayılmaz
    if (k === 'amount') return amountNum(a) === amountNum(b);
    if (/account/.test(k)) return last4(a) === last4(b);
    if (k === 'time') return a.replace(/\D/g, '') === b.replace(/\D/g, '');
    if (k === 'kind') return a.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) === b.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    return clean(a) === clean(b);
  }
  // Bilinen adlar: dekont adı bunlardan biriyle (boşluklar hariç) aynıysa bilinen yazılış kullanılır (çevrimdışı okuma boşluk kaçırabilir)
  function knownNames(me) {
    return dbAll("SELECT DISTINCT sc_name AS n FROM cash_transactions WHERE sc_name IS NOT NULL UNION SELECT name FROM shamcash_payees UNION " +
      "SELECT json_extract(sc_doc,'$.from_name') FROM cash_transactions WHERE sc_doc IS NOT NULL UNION SELECT json_extract(sc_doc,'$.to_name') FROM cash_transactions WHERE sc_doc IS NOT NULL")
      .then(function (rows) { return rows.map(function (r) { return r.n; }).concat(me.names).filter(Boolean); });
  }
  function snapName(s, known) {
    if (!s) return s;
    var k = nospace(s);
    for (var i = 0; i < known.length; i++) if (nospace(known[i]) === k) return clean(known[i]);
    return s;
  }
  function getMe() {
    return setting('shamcash_me').then(function (v) {
      var o = {}; try { o = JSON.parse(v || '{}') || {}; } catch (e) { o = {}; }
      return { names: (o.names || []).map(clean).filter(Boolean), accounts: (o.accounts || []).map(last4).filter(Boolean) };
    });
  }
  function saveMe(me) { return setSetting('shamcash_me', JSON.stringify({ names: me.names, accounts: me.accounts })); }
  function addMe(name, account) {
    return getMe().then(function (me) {
      if (name && me.names.map(nospace).indexOf(nospace(name)) < 0) me.names.push(clean(name));
      var a = last4(account); if (a && me.accounts.indexOf(a) < 0) me.accounts.push(a);
      return saveMe(me).then(function () { return me; });
    });
  }
  // Ad (boşluklar hariç birebir) ya da hesabın son 4 hanesi "benim" listesindeyse
  function isMe(me, name, account) {
    if (name && me.names.some(function (n) { return nospace(n) === nospace(name); })) return true;
    var a = last4(account);
    return !!a && me.accounts.indexOf(a) >= 0;
  }
  function directionOf(me, d) {
    var s = isMe(me, d.from_name, d.from_account), r = isMe(me, d.to_name, d.to_account);
    if (s && !r) return 'out';
    if (r && !s) return 'in';
    return '';
  }

  // Ana okuma: { doc, source: side|both|ai|offline|none, diffs: [alan], aiError }
  function read(u8, mime, name, side, onStep) {
    mime = mimeOf(name, mime);
    var st = null, step = function (k, x) { try { if (onStep) onStep(k, x || (st ? statusText(st) : '')); } catch (e) {} };
    if (side && side.ref) {
      var d0 = normDoc(side);
      ['from_name', 'to_name', 'from_account', 'to_account', 'note', 'kind'].forEach(function (k) { if (side[k] != null) d0[k] = String(side[k]); }); // doğrulanmış metin aynen
      return Promise.resolve({ doc: d0, source: 'side', diffs: [], verified: true });
    }
    var cvP = toCanvas(u8, mime).catch(function () { return null; });
    // Önce online (yapay zekâ); internet / anahtar yoksa yalnız offline. Online okunsa bile offline okuma da yapılır ve alan alan karşılaştırılır.
    // v1.67.2: iki okuma ayrı izlenir (ekranda saniyeli durum). Online sonuç geldikten sonra offline en çok 4 sn beklenir; bitmediyse alanlar
    // online sonuçla hemen doldurulur, offline teyit arkada sürer ve bitince `late` ile tabloya eklenir. «Beklemeden doldur» (skipWait) hazır
    // olan okumayla (online ya da offline) hemen bitirir.
    var now = Date.now(); st = { on: { t0: now }, off: { t0: now } };
    var tick = function () { step('tick'); };
    step('online');
    var ticker = setInterval(tick, 250);
    var aiP = viaAi(u8, mime).then(function (d) { st.on.done = Date.now(); st.on.ok = true; tick(); return { d: d }; },
      function (e) { st.on.done = Date.now(); st.on.no = true; tick(); return { e: e }; });
    var offP = cvP.then(function (cv) {
      step('offline');
      if (!cv) return null;
      if (cv.text && /SENDER|RECIPIENT|TRANSACTION|المرسل/.test(cv.text)) return parseText(cv.text);
      var viaText = function () { return textOcr(cv.canvas); };
      return ocrAvailable() ? viaOcr(cv.canvas).then(function (d) { return d && (d.ref || d.amount) ? d : viaText(); }, viaText) : viaText();
    }).then(function (d) { return d || null; }, function () { return null; }).then(function (d) { st.off.done = Date.now(); st.off.ok = !!d; st.off.no = !d; tick(); return d; });
    var combine = function (aiR, off) {
      return Promise.resolve(getMe()).then(function (me) {
      var ai = aiR.d || null, fn = fromFileName(name);
      return knownNames(me).then(function (known) {
        var doc, source, diffs = [];
        if (ai && off) {
          source = 'both'; doc = ai;
          CHECK.forEach(function (k) { if (!same(k, ai[k], off[k])) diffs.push(k); });
          ['from_name', 'to_name'].forEach(function (k) { if (ai[k] && off[k] && nospace(ai[k]) !== nospace(off[k])) diffs.push(k); });
        } else if (ai) { source = 'ai'; doc = ai; }
        else if (off) { source = 'offline'; doc = off; doc.from_name = snapName(doc.from_name, known); doc.to_name = snapName(doc.to_name, known); }
        else { source = 'none'; doc = normDoc({}); }
        if (fn) {
          if (!validDate(doc.date)) doc.date = fn.date;
          if (doc.time && fn.time && doc.date === fn.date && Math.abs(secs(doc.time) - secs(fn.time)) > 600 && source === 'offline') diffs.push('time');
        }
        if (!doc.currency && off && off.currency) doc.currency = off.currency;
        if (fn && !doc.time && fn.time && validDate(doc.date) && doc.date === fn.date) doc.time = fn.time;
        // alan alan: ok (iki okuma aynı) · diff (farklı) · ai (yalnız online) · off (yalnız offline)
        var checks = {};
        FIELDS.forEach(function (k) {
          var a = ai && ai[k], o = off && !(off._partial && PARTIAL_SKIP.indexOf(k) >= 0) && off[k];
          if (a && o) checks[k] = diffs.indexOf(k) >= 0 || !sameAny(k, a, o) ? 'diff' : 'ok';
          else if (a) checks[k] = 'ai'; else if (o || doc[k]) checks[k] = 'off';
        });
        diffs = FIELDS.filter(function (k) { return checks[k] === 'diff'; });
        var aiDoc = ai ? Object.assign({}, ai) : null, offDoc = off ? Object.assign({}, off) : null;
        if (aiDoc) { delete aiDoc._conf; delete aiDoc._model; } if (offDoc) { delete offDoc._conf; delete offDoc._partial; }
        return { doc: doc, source: source, diffs: diffs, checks: checks, aiDoc: aiDoc, offDoc: offDoc, model: ai && ai._model || '',
          aiError: aiR.e ? (aiR.e.pending ? 'wait' : aiR.e.skip ? 'skip' : aiR.e.key ? 'key' : aiR.e.net ? 'net' : 'fail') : '', verified: source === 'both' && !diffs.length, canvas: null };
      });
      });
    };
    var lateOf = function (res) {
      return { checks: res.checks, diffs: res.diffs, aiDoc: res.aiDoc, offDoc: res.offDoc, model: res.model, aiError: res.aiError, verified: res.verified, source: res.source };
    };
    var raced = new Promise(function (resolve) {
      var aiR = null, off, aiIn = false, offIn = false, fin = false, grace = null;
      var finish = function () { if (fin) return; fin = true; clearTimeout(grace); resolve({ aiR: aiIn ? aiR : null, off: offIn ? off : undefined }); };
      var check = function () {
        if (aiIn && offIn) return finish();
        if (aiIn && aiR.d && !grace) grace = setTimeout(finish, OFF_GRACE);
      };
      aiP.then(function (r) { aiR = r; aiIn = true; check(); });
      offP.then(function (o) { off = o; offIn = true; check(); });
      waiting = {
        can: function () { return !fin && ((aiIn && !!aiR.d && !offIn) || (offIn && !!off && !aiIn)); },
        skip: function () { if (this.can()) finish(); }
      };
    });
    return raced.then(function (x) {
      clearInterval(ticker); waiting = null;
      var aiR = x.aiR || { e: { pending: true } }, offPending = x.off === undefined;
      return combine(aiR, offPending ? null : x.off).then(function (res) {
        if (offPending) { res.pendingOff = true; res.late = offP.then(function (o) { return o ? combine(aiR, o).then(lateOf) : { offFailed: true }; }); }
        else if (!x.aiR) { res.pendingAi = true; res.late = aiP.then(function (r) { return r.d ? combine(r, x.off).then(lateOf) : null; }); }
        return res;
      });
    }).then(function (res) { return cvP.then(function (cv) { res.preview = cv ? cv.canvas : null; return res; }); });
  }
  var OFF_GRACE = 4000, waiting = null;
  function statusText(st) {
    var now = Date.now(), sec = function (a) { return Math.max(0, Math.round(((a.done || now) - a.t0) / 1000)); };
    var on = st.on.done ? (st.on.ok ? t('stOnOk', { s: sec(st.on) }) : t('stOnNo')) : t('stOn', { s: sec(st.on) });
    var off = st.off.done ? (st.off.ok ? t('stOffOk', { s: sec(st.off) }) : t('stOffNo')) : t('stOff', { s: sec(st.off) });
    return on + ' · ' + off;
  }
  function canSkip() { return !!(waiting && waiting.can()); }
  function skipWait() { if (waiting) waiting.skip(); }
  // Masaüstünde OCR motorları form açılınca önceden hazırlanır (ilk dekontta ~8 MB yükleme beklenmesin)
  function warm() { if (ocrAvailable()) ocrWorkers().catch(function () {}); }
  // Arkadan gelen okuma (online ya da offline) bitince forma yazılacak bilgi (yalnız okuma özeti; alanlara dokunulmaz)
  function late(v, x) {
    var info = v && v.sc_doc_info;
    if (!info || !x || !v.sc_doc_file || v.sc_doc_file.relPath !== x.file) return null;
    if (x.offFailed) return { sc_doc_info: Object.assign({}, info, { pendingOff: false, pendingAi: false }) };
    var p = { sc_doc_info: Object.assign({}, info, { source: x.source, checks: x.checks, aiDoc: x.aiDoc, offDoc: x.offDoc, aiError: x.aiError, pendingOff: false, pendingAi: false }) };
    try { var d = JSON.parse(v.sc_doc || '{}'); d.read_by = x.source + (x.model ? ':' + x.model : ''); p.sc_doc = JSON.stringify(d); } catch (e) {}
    return p;
  }
  // Telefonda (ya da masaüstü OCR'ı başarısızsa) genel okuyucunun Tesseract'ı: sayfa metni → "ETİKET değer" satırları
  function textOcr(canvas) {
    var FD = window.FalconDekont;
    if (!FD || !FD.ocr) return null;
    return Promise.resolve(FD.ocr(canvas)).then(function (txt) {
      if (!txt || !/TRANSACTION|SENDER|RECIPIENT|AMOUNT/i.test(txt)) return null;
      var d = parseText(txt);
      ['from_name', 'to_name'].forEach(function (k) { if (/[\u0600-\u06FF]/.test(d[k])) d[k] = clean(d[k].replace(/(^|\s)[A-Za-z][A-Za-z.]*(?=\s|$)/g, ' ')); });
      ['from_account', 'to_account'].forEach(function (k) { d[k] = /\*{4,}\d{4}$/.test(d[k]) ? d[k] : ''; });
      if (d.note && /^[-–—~_.]+$/.test(d.note)) d.note = '-';
      d._partial = true;
      return d.ref || d.amount ? d : null;
    }, function () { return null; });
  }
  function secs(s) { var m = /(\d{2}):(\d{2}):(\d{2})/.exec(s || ''); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0; }
  // PDF'in yazı katmanı varsa (bazı sürümler): "ETİKET değer" satırlarından
  function parseText(text) {
    var d = normDoc({}), L = String(text).split('\n').map(clean);
    var get = function (rx) { for (var i = 0; i < L.length; i++) { var m = rx.exec(L[i]); if (m) return clean(m[1]); } return ''; };
    d.kind = get(/^TRANSACTION\s+(?!NUMBER|DATE)([A-Z ]+)$/i).toUpperCase(); d.ref = get(/TRANSACTION\s+NUMBER\s+(\S+)/i);
    var dt = get(/TRANSACTION\s+(?:DATE\s+)?(\d{1,2}\/\d{1,2}\/\d{4}\s*-\s*\d{2}:\d{2}:\d{2})/i);
    if (dt) { d.date = dt.split('-')[0].trim(); d.time = dt.split('-')[1].trim(); }
    var dti = get(/TRANSACTION\s+(?:DATE\s+)?(\d{4}-\d{1,2}-\d{1,2}\s*-\s*\d{2}:\d{2}:\d{2})/i);
    if (!dt && dti) { var mi = /(\d{4})-(\d{1,2})-(\d{1,2})\s*-\s*(\S+)/.exec(dti); d.date = ('0' + mi[3]).slice(-2) + '/' + ('0' + mi[2]).slice(-2) + '/' + mi[1]; d.time = mi[4]; }
    d.from_name = get(/SENDER\s+NAME\s+(.+)$/i); d.from_account = get(/SENDER\s+ACCOUNT\s+(\S+)/i);
    d.to_name = get(/RECIPIENT\s+NAME\s+(.+)$/i); d.to_account = get(/RECIPIENT\s+ACCOUNT\s+(\S+)/i);
    var am = get(/AMOUNT\s+(.+)$/i); d.amount = am.replace(/[^\d.,]/g, ''); d.currency = curOf(am);
    d.note = get(/NOTE\s+(.*)$/i) || '-';
    return d;
  }

  // ---------- kasalar / kategoriler ----------
  function accounts() { return dbAll('SELECT id, name, currency_code, COALESCE(hidden,0) AS hidden FROM cash_accounts ORDER BY id'); }
  function categories() { return dbAll('SELECT key, name FROM cash_categories WHERE COALESCE(hidden,0) = 0 ORDER BY sort_order, id'); }
  function catLabel(c) { return c.name || (CATS[ui()] || CATS.tr)[c.key] || c.key; }
  function pickAccount(list, cur) {
    return setting('shamcash_acc_' + cur).then(function (v) {
      var vis = list.filter(function (a) { return !a.hidden; });
      var byId = vis.filter(function (a) { return String(a.id) === v && a.currency_code === cur; })[0];
      if (byId) return byId.id;
      var sc = vis.filter(function (a) { return a.currency_code === cur && /sham|شام/i.test(a.name || ''); })[0];
      if (sc) return sc.id;
      var c = vis.filter(function (a) { return a.currency_code === cur; })[0];
      return c ? c.id : null;
    });
  }
  function dupOf(ref) { return ref ? dbAll('SELECT id FROM cash_transactions WHERE sc_ref = ? AND sc_doc IS NOT NULL LIMIT 1', [ref]).then(function (r) { return r[0] ? r[0].id : null; }) : Promise.resolve(null); }

  // ---------- kaydetme ----------
  function saveItem(it) {
    // dekont kutusundan gelen dosya ancak kaydederken receipts'e (bayt bayt) kopyalanır
    if (!it.file.relPath && it.inbox && F().shamcash) {
      return Promise.resolve(F().shamcash.take(it.inbox)).then(unwrap).then(function (f) { it.file.relPath = f.relPath; it.file.mime = f.mime; it.file.originalName = f.originalName; return saveItem(it); });
    }
    var d = it.doc, payload = {
      account_id: Number(it.account_id), direction: it.direction, amount: amountNum(d.amount), date: toIso(d.date) || new Date().toISOString().slice(0, 10),
      category: it.category || 'other', description: clean(it.description) || null, note: clean(it.note) || null, add_to_cash: it.add_to_cash !== false,
      doc: Object.assign({}, d, { file_name: it.file.originalName || '', read_by: it.source + (it.model ? ':' + it.model : '') }),
      receipt: it.file.relPath ? { relPath: it.file.relPath, originalName: it.file.originalName, mime: it.file.mime } : null
    };
    delete payload.doc._conf; delete payload.doc._model;
    return call('importShamCashReceipt', payload).then(function (r) {
      setSetting('shamcash_acc_' + (d.currency || ''), String(it.account_id));
      setSetting('shamcash_cat_' + it.direction, it.category || 'other');
      if (it.inbox && F().shamcash) Promise.resolve(F().shamcash.done(it.inbox)).catch(function () {});
      return r;
    });
  }


  // v1.67: elle girilen bir para kaydına (Kasa giriş / çıkış, İnfak, düzenli ödeme …) Sham Cash dekontu ekleme.
  // Dosya seçilir (receipts'e bayt bayt kopyalanmış olarak gelir), okunur; forma doldurulacak alanlar döner. Kaydı form yapar
  // (saveShamCash: sc_doc + sc_doc_file). { file, doc, source, diffs, verified, direction, other: {name, account}, account_id, accountName, dup }
  function pick(opts) {
    opts = opts || {};
    return (opts.file ? Promise.resolve([opts.file]) : pickFiles()).then(function (files) {
      var f = files && files[0];
      if (!f) return null;
      if (opts.onFile) try { opts.onFile(f); } catch (e) {}
      return bytesOf(f).then(function (u8) { return read(u8, f.mime, f.originalName, null, opts.onStep); }, function () { return { doc: normDoc({}), source: 'none', diffs: [] }; }).then(function (res) {
        var d = res.doc || normDoc({});
        return Promise.all([getMe(), dupOf(d.ref), accounts()]).then(function (r) {
          var me = r[0], dup = r[1], list = r[2];
          var dir = directionOf(me, d) || '', dirFrom = dir ? 'me' : '';
          var want = opts.direction === 'in' || opts.direction === 'out' ? opts.direction : '';
          var kd = kindDir(d.kind), conflict = false;
          if (!dir && kd) { // v1.67.1: dekont türü (SEND → çıkış, RECEIVE → giriş)
            dir = kd; dirFrom = 'kind'; conflict = !!want && want !== kd;
            if (!conflict) addMe(dir === 'out' ? d.from_name : d.to_name, dir === 'out' ? d.from_account : d.to_account).catch(function () {});
          }
          if (!dir && want && res.source !== 'none') { // yön bulunamadı: formdaki yön esas, adımı öğren (sonraki dekontlar kendiliğinden)
            dir = want; dirFrom = 'form';
            addMe(dir === 'out' ? d.from_name : d.to_name, dir === 'out' ? d.from_account : d.to_account).catch(function () {});
          }
          var useDir = dir || want || 'out';
          var cur = d.currency || '';
          return Promise.all([cur ? pickAccount(list, cur) : Promise.resolve(null), useDir === 'out' ? payeeOf(d.to_name, d.to_account) : Promise.resolve(null)]).then(function (pr) {
            var accId = pr[0], payee = pr[1];
            var acc = list.filter(function (a) { return a.id === accId; })[0];
            var doc = Object.assign({}, d, { file_name: f.originalName || '', file_path: f.relPath, read_by: res.source + (res.model ? ':' + res.model : '') });
            delete doc._conf; delete doc._model;
            return {
              file: { relPath: f.relPath, originalName: f.originalName, mime: f.mime }, doc: doc, source: res.source, diffs: res.diffs || [], verified: !!res.verified,
              direction: useDir, dirKnown: !!dir, other: useDir === 'out' ? { name: d.to_name || '', account: d.to_account || '' } : { name: d.from_name || '', account: d.from_account || '' },
              amount: amountNum(d.amount), date: toIso(d.date) || '', currency: cur, account_id: acc ? acc.id : null, accountName: acc ? acc.name : '',
              accountIsSham: !!(acc && /sham|شام/i.test(acc.name || '')), dup: dup,
              checks: res.checks || {}, aiDoc: res.aiDoc || null, offDoc: res.offDoc || null, aiError: res.aiError || '', model: res.model || '',
              dirFrom: dirFrom, kindDir: kd, conflict: conflict, time: d.time || '', note: d.note && d.note !== '-' ? d.note : '', payee: payee,
              pendingOff: !!res.pendingOff, pendingAi: !!res.pendingAi, late: res.late ? res.late.then(function (x) { return x ? Object.assign(x, { file: f.relPath }) : null; }, function () { return null; }) : null
            };
          });
        });
      });
    });
  }

  function kindDir(k) {
    k = String(k || '').toUpperCase();
    if (/^(SEND|SENT|TRANSFER OUT|WITHDRAW|PAY|PAYMENT|إرسال|ارسال|تحويل صادر)/.test(k)) return 'out';
    if (/^(RECEIVE|RECEIVED|DEPOSIT|TRANSFER IN|استلام|استقبال|إيداع|تحويل وارد)/.test(k)) return 'in';
    return '';
  }
  // Kayıtlı Sham Cash alıcısı: hesabın son 4 hanesi ya da ad (boşluklar hariç) aynıysa
  function payeeOf(name, account) {
    var a = last4(account), n = nospace(name);
    if (!a && !n) return Promise.resolve(null);
    return dbAll('SELECT * FROM shamcash_payees ORDER BY use_count DESC, id').then(function (rows) {
      var byAcc = a ? rows.filter(function (r) { return last4(r.account_no) === a; }) : [];
      if (byAcc.length === 1) return byAcc[0];
      var byName = n ? (byAcc.length ? byAcc : rows).filter(function (r) { return nospace(r.name) === n; }) : [];
      return byName[0] || null;
    });
  }
  // Okuma sonucundan forma yazılacak alanlar (yalnız formda olan alanlar; kayıt kendiliğinden YAPILMAZ)
  function formPatch(r, v, doc) {
    v = v || {}; doc = doc || r.doc;
    var dir = r.formDir || r.direction, p = { pay_method: 'shamcash', sc_on: true, sc_doc: JSON.stringify(doc), sc_doc_file: r.file, sc_doc_ref: doc.ref || '' };
    if (doc.ref) p.sc_ref = doc.ref;
    var oName = dir === 'out' ? doc.to_name : doc.from_name, oAcc = dir === 'out' ? doc.to_account : doc.from_account;
    if (oName) p.sc_name = oName; if (oAcc) p.sc_account = oAcc;
    var am = amountNum(doc.amount); if ('amount' in v && am) p.amount = String(am);
    var dt = toIso(doc.date); if ('date' in v && dt) p.date = dt;
    if (r.form && (r.dirKnown || r.conflict)) p.direction = dir;
    if ('account_id' in v && r.account_id) p.account_id = r.account_id;
    var note = doc.note && doc.note !== '-' ? doc.note : '';
    if (note && !String(v.sc_note || '').trim()) p.sc_note = note;
    if (Array.isArray(v.people) && oName) {
      var ls = v.people.filter(function (x) { return String(x || '').trim(); });
      if (!ls.some(function (x) { return nospace(x) === nospace(oName); })) ls.push(oName);
      p.people = ls;
    }
    if (dir === 'out' && r.payee) { p.sc_payee_id = r.payee.id; p.sc_save_payee = false; if (r.payee.phone && !String(v.sc_phone || '').trim()) p.sc_phone = r.payee.phone; if (r.payee.qr_text) p.sc_qr_text = r.payee.qr_text; }
    p.sc_doc_info = { source: r.source, checks: r.checks || {}, aiDoc: r.aiDoc, offDoc: r.offDoc, aiError: r.aiError || '', dirFrom: r.dirFrom || '', conflict: !!r.conflict,
      kind: doc.kind || '', time: doc.time || '', note: note, direction: dir, pendingOff: !!r.pendingOff, pendingAi: !!r.pendingAi, accountName: r.accountName || '', currency: doc.currency || r.currency || '', payee: r.payee ? r.payee.name : '', chosen: (r.chosen || {}) };
    return p;
  }
  // Farklı okunan alanda kullanıcının seçimi: 'ai' ya da 'off' değeri dekonta ve forma yazılır
  function choose(v, k, which) {
    var info = v.sc_doc_info; if (!info) return null;
    var src = which === 'off' ? info.offDoc : info.aiDoc; if (!src || !src[k]) return null;
    var doc = {}; try { doc = JSON.parse(v.sc_doc || '{}'); } catch (e) { doc = {}; }
    doc[k] = src[k]; if (k === 'amount' && src.currency) doc.currency = src.currency;
    var chosen = Object.assign({}, info.chosen); chosen[k] = which;
    var r = { file: v.sc_doc_file, doc: doc, source: info.source, checks: info.checks, aiDoc: info.aiDoc, offDoc: info.offDoc, aiError: info.aiError, dirFrom: info.dirFrom,
      conflict: false, direction: v.direction || info.direction, formDir: v.direction || info.direction, form: false, accountName: info.accountName, currency: info.currency,
      payee: null, chosen: chosen };
    var p = formPatch(r, v, doc);
    delete p.account_id; delete p.people; delete p.sc_payee_id;
    if (k !== 'note') delete p.sc_note;
    p.sc_doc_info = Object.assign({}, info, { chosen: chosen, kind: doc.kind || info.kind, time: doc.time || info.time });
    return p;
  }
  function message(info) {
    if (!info) return { text: '', ok: false };
    var n = Object.keys(info.checks || {}).filter(function (k) { return info.checks[k] === 'diff' && !(info.chosen || {})[k]; }).length;
    if (info.source === 'ai' && info.pendingOff) return { text: t('mAiWait'), ok: true };
    if (info.source === 'offline' && info.pendingAi) return { text: t('mOffWait'), ok: false };
    if (info.source === 'both') return n ? { text: t('mDiff', { n: n }), ok: false } : { text: t('mBoth'), ok: true };
    if (info.source === 'ai') return { text: t('mAiOnly'), ok: false };
    if (info.source === 'offline') return { text: info.aiError === 'net' ? t('mOffNet') : info.aiError === 'skip' || info.aiError === 'key' ? t('mOffKey') : t('mOff'), ok: false };
    if (info.source === 'side') return { text: t('readSide'), ok: true };
    return { text: t('mNone'), ok: false };
  }
  // Okuma özeti tablosu: [{ k, label, value, st: ok|diff|ai|off, stText, choices? }]
  function rows(v) {
    var info = v && v.sc_doc_info; if (!info) return [];
    var doc = {}; try { doc = JSON.parse(v.sc_doc || '{}'); } catch (e) { doc = {}; }
    var dir = v.direction === 'in' || v.direction === 'out' ? v.direction : info.direction, ch = info.checks || {}, chosen = info.chosen || {};
    var nm = dir === 'out' ? 'to_name' : 'from_name', ac = dir === 'out' ? 'to_account' : 'from_account';
    var fmt = function (k, d) { if (!d) return ''; if (k === 'amount') return [d.amount, d.currency].filter(Boolean).join(' '); return d[k] || ''; };
    var list = [
      ['kind', doc.kind ? t('kindDir', { k: doc.kind, d: t(dir) }) : '', t('kind')],
      ['amount', fmt('amount', doc), t('amount')],
      ['account', info.accountName ? info.accountName + (info.currency ? ' (' + info.currency + ')' : '') : '', t('account')],
      ['date', doc.date || '', t('date')], ['time', doc.time || '', t('time')],
      [nm, doc[nm] || '', t('other_' + dir)], [ac, doc[ac] || '', t('other_acc_' + dir)],
      ['ref', doc.ref || '', t('ref')], ['note', doc.note && doc.note !== '-' ? doc.note : '', t('note')]
    ];
    var shown = list.map(function (x) { return x[0]; }).concat(['currency']);
    FIELDS.forEach(function (k) { if (ch[k] === 'diff' && shown.indexOf(k) < 0) list.push([k, doc[k] || '', t(k)]); });
    var out = [];
    list.forEach(function (x) {
      var k = x[0]; if (!x[1]) return;
      var st = k === 'amount' ? (ch.amount === 'diff' || ch.currency === 'diff' ? 'diff' : ch.amount || '') : ch[k] || '';
      var row = { k: k, label: x[2], value: x[1], st: st || 'none', stText: st === 'ok' ? '✓ ' + t('sOk') : st === 'ai' ? t('sAi') : st === 'off' ? t('sOff') : '' };
      if (k === 'account' && info.payee && dir === 'out') row.stText = t('payeeHit', { n: info.payee });
      if (st === 'diff' && info.aiDoc && info.offDoc) {
        var ck = k === 'amount' && ch.amount !== 'diff' ? 'currency' : k;
        row.choices = [{ which: 'ai', label: t('pickOn') + ': ' + fmt(k, info.aiDoc), on: chosen[ck] !== 'off' }, { which: 'off', label: t('pickOff') + ': ' + fmt(k, info.offDoc), on: chosen[ck] === 'off' }];
        row.key = ck;
        if (chosen[ck]) row.st = 'ok';
      }
      out.push(row);
    });
    return out;
  }
  // Kullanıcı dekont eklendikten sonra Tür'ü değiştirirse karşı taraf (ad / hesap / kişi) dekonttan yeniden alınır;
  // yön dekont türünden ya da formdan geldiyse kullanıcının seçimiyle «benim adım» öğrenilir.
  function redirect(v) {
    var info = v && v.sc_doc_info, dir = v && v.direction;
    if (!info || (dir !== 'in' && dir !== 'out') || dir === info.direction) return null;
    var doc = {}; try { doc = JSON.parse(v.sc_doc || '{}'); } catch (e) { return null; }
    var oldName = info.direction === 'out' ? doc.to_name : doc.from_name, nm = dir === 'out' ? doc.to_name : doc.from_name, ac = dir === 'out' ? doc.to_account : doc.from_account;
    var p = { sc_name: nm || '', sc_account: ac || '' };
    if (Array.isArray(v.people)) {
      var ls = v.people.filter(function (x) { return String(x || '').trim() && (!oldName || nospace(x) !== nospace(oldName)); });
      if (nm && !ls.some(function (x) { return nospace(x) === nospace(nm); })) ls.push(nm);
      p.people = ls.length ? ls : [''];
    }
    if (dir === 'in') { p.sc_payee_id = null; }
    if (info.dirFrom !== 'me') addMe(dir === 'out' ? doc.from_name : doc.to_name, dir === 'out' ? doc.from_account : doc.to_account).catch(function () {});
    p.sc_doc_info = Object.assign({}, info, { direction: dir, conflict: false, dirFrom: 'user', payee: dir === 'out' ? info.payee : '' });
    return p;
  }
  function conflictText(info) { return info && info.conflict ? t('conflict', { k: info.kind, d: t(info.direction) }) : ''; }
  function markForm(root, v) {
    var info = v && v.sc_doc_info; if (!root || !info) return;
    var ch = info.checks || {}, chosen = info.chosen || {}, open = function (k) { return ch[k] === 'diff' && !chosen[k]; };
    var bad = [];
    if (open('amount') || open('currency')) bad.push(v.amount);
    if (open('date')) bad.push(v.date);
    if (open('ref')) bad.push(v.sc_ref);
    var dir = v.direction === 'in' || v.direction === 'out' ? v.direction : info.direction, oth = dir === 'out' ? 'to_' : 'from_';
    if (open(oth + 'name')) bad.push(v.sc_name);
    if (open(oth + 'account')) bad.push(v.sc_account);
    var vals = [v.amount, v.date, v.sc_name, v.sc_account, v.sc_ref, info.note ? v.sc_note : '', info.accountName ? clean(info.accountName + ' (' + info.currency + ')') : '']
      .concat(Array.isArray(v.people) ? v.people : []).filter(function (x) { return bad.indexOf(x) < 0; });
    mark(root, vals, bad);
  }
  // «Fişten oku» için: dosya Sham Cash dekontu mu? (ad, PDF yazısı ya da hızlı sayfa okuması)
  function detect(file) {
    if (/sham[\s_\-]?cash/i.test(file && file.originalName || '')) return Promise.resolve(true);
    return bytesOf(file).then(function (u8) {
      return toCanvas(u8, mimeOf(file.originalName, file.mime)).then(function (cv) {
        if (cv.text) return /SHAM\s?CASH|TRANSACTION\s+NUMBER|RECIPIENT\s+ACCOUNT/i.test(cv.text);
        var small = document.createElement('canvas'), k = Math.min(1, 1100 / cv.canvas.width);
        small.width = Math.round(cv.canvas.width * k); small.height = Math.round(cv.canvas.height * k);
        small.getContext('2d').drawImage(cv.canvas, 0, 0, small.width, small.height);
        var rx = /SHAM\s?CASH|SHOM\s?CASH|TRANSACTION\s+NUMBER|RECIPIENT\s+(NAME|ACCOUNT)|SENDER\s+ACCOUNT/i;
        if (ocrAvailable()) return ocrWorkers().then(function (W) { return W.eng.setParameters({ tessedit_pageseg_mode: '3', tessedit_char_whitelist: '' }).then(function () { return W.eng.recognize(small); }); }).then(function (x) { return rx.test(x.data.text || ''); }, function () { return false; });
        var FD = window.FalconDekont;
        return FD && FD.ocr ? Promise.resolve(FD.ocr(cv.canvas)).then(function (tx) { return rx.test(tx || ''); }, function () { return false; }) : false;
      });
    }).catch(function () { return false; });
  }
  // Sürükle-bırak: dosya orijinal haliyle (bayt bayt) dekontlara kaydedilir
  function fromDrop(fileObj) {
    var fr = F().files || {};
    if (!fileObj || !/\.(pdf|jpe?g|png)$/i.test(fileObj.name || '') && !/pdf|jpeg|png/.test(fileObj.type || '')) return Promise.reject(new Error('type'));
    if (!fr.saveReceipt) return Promise.reject(new Error('save'));
    return fileObj.arrayBuffer().then(function (b) { return Promise.resolve(fr.saveReceipt(new Uint8Array(b), fileObj.name)); }).then(unwrap);
  }
  // Doldurulan alanları formda vurgula (kullanıcı değiştirince söner)
  function mark(root, vals, bad) {
    if (!root) return;
    var set = {}; (vals || []).forEach(function (x) { if (x != null && String(x).trim()) set[String(x).trim()] = 1; });
    var badSet = {}; (bad || []).forEach(function (x) { if (x != null && String(x).trim()) badSet[String(x).trim()] = 1; });
    Array.prototype.forEach.call(root.querySelectorAll('input:not([type=checkbox]):not([type=file]),select,textarea'), function (e) {
      var val = String(e.value || '').trim(), sel = e.tagName === 'SELECT' && e.selectedIndex >= 0 ? clean(e.options[e.selectedIndex].textContent) : '';
      e.classList.remove('sc-filled', 'sc-diff');
      if (!val) return;
      if (badSet[val]) e.classList.add('sc-diff'); else if (set[val] || (sel && set[sel])) e.classList.add('sc-filled');
      if (!e.__scMark) { e.__scMark = 1; e.addEventListener('input', function () { e.classList.remove('sc-filled', 'sc-diff'); }); }
    });
  }
  (function () {
    try {
      var st = document.createElement('style');
      st.textContent = '.sc-filled{outline:2px solid rgba(34,197,94,.75)!important;outline-offset:1px;background-color:rgba(34,197,94,.08)!important}' +
        '.sc-diff{outline:2px solid rgba(245,158,11,.9)!important;outline-offset:1px;background-color:rgba(245,158,11,.10)!important}' +
        '.sc-drop-on{outline:3px dashed #22c55e!important;outline-offset:-6px}' +
        '.sc-read{border:1px solid rgba(34,197,94,.35);border-radius:10px;padding:8px 10px;margin:6px 0;display:grid;gap:6px}' +
        '.sc-read .sc-msg{font-weight:600}.sc-read .sc-msg.ok{color:#22c55e}.sc-read .sc-msg.warn{color:#f59e0b}' +
        '.sc-read table{width:100%;border-collapse:collapse;font-size:12.5px}.sc-read td{padding:3px 6px;border-top:1px solid rgba(127,127,127,.18);vertical-align:middle}' +
        '.sc-read td.k{opacity:.7;white-space:nowrap}.sc-read td.s{white-space:nowrap;text-align:end}.sc-read .st-ok{color:#22c55e}.sc-read .st-diff{color:#f59e0b;font-weight:600}' +
        '.sc-read .st-ai,.sc-read .st-off{opacity:.65}.sc-read .chs{display:inline-flex;gap:4px;flex-wrap:wrap}.sc-read .chs button{font-size:11.5px;padding:2px 8px}' +
        '.sc-read .chs button.on{outline:2px solid #22c55e}.sc-read .sc-hint{opacity:.75;font-size:12px}';
      (document.head || document.documentElement).appendChild(st);
    } catch (e) {}
  })();

  // ---------- dosya alma ----------
  function bytesOf(file) {
    var fr = F().files || {};
    if (fr.read) return Promise.resolve(fr.read(file.relPath)).then(unwrap).then(function (b) { return b instanceof Uint8Array ? b : new Uint8Array(b); });
    var url = (F().fileBase || 'falcon://files/') + String(file.relPath).split('/').map(encodeURIComponent).join('/');
    return fetch(url).then(function (r) { if (!r.ok) throw new Error('read'); return r.arrayBuffer(); }).then(function (b) { return new Uint8Array(b); });
  }
  function pickFiles() {
    var fr = F().files || {};
    if (!fr.import) return Promise.resolve([]);
    return Promise.resolve(fr.import('receipt', true)).then(unwrap).then(function (a) { return a || []; });
  }

  // ---------- görünüm ----------
  function el(tag, a, kids) {
    var e = document.createElement(tag);
    for (var k in (a || {})) { var v = a[k]; if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else if (k === 'value') e.value = v; else e.setAttribute(k, v === true ? '' : v); }
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function css() {
    if (document.getElementById('shamcash-falcon-css')) return;
    var s = document.createElement('style'); s.id = 'shamcash-falcon-css';
    s.textContent = '.scd-top{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}.scd-drop{flex:1;min-width:220px;border:2px dashed var(--border,#3a4458);border-radius:12px;padding:12px;opacity:.85;font-size:13px;text-align:center}' +
      '.scd-drop.over{border-color:#0ea5e9;background:#0ea5e914}.scd-list{display:flex;flex-direction:column;gap:12px}' +
      '.scd-card{display:grid;grid-template-columns:minmax(180px,300px) 1fr;gap:14px;border:1px solid var(--border,#ffffff1f);border-radius:14px;padding:12px}' +
      '@media(max-width:720px){.scd-card{grid-template-columns:1fr}}.scd-pv{background:#fff;border-radius:10px;overflow:hidden;cursor:zoom-in;align-self:start}.scd-pv img{width:100%;display:block}' +
      '.scd-st{font-weight:600;margin-bottom:6px}.scd-st.ok{color:#22c55e}.scd-st.warn{color:#f59e0b}.scd-st.err{color:#ef4444}' +
      '.scd-g{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 10px}.scd-g label{display:flex;flex-direction:column;gap:2px;font-size:12px}.scd-g label span{opacity:.7}' +
      '.scd-g input,.scd-g select{width:100%}.scd-g .wide{grid-column:1/-1}.scd-g .diff input{outline:2px solid #f59e0b}.scd-h{font-weight:700;margin:10px 0 4px;font-size:13px}' +
      '.scd-hint{font-size:12px;opacity:.7;margin-bottom:6px}.scd-seg{display:inline-flex;gap:4px;padding:3px;border:1px solid var(--border,#3a4458);border-radius:9px}' +
      '.scd-seg button{border:0;background:none;color:inherit;padding:5px 12px;border-radius:6px;cursor:pointer;font-weight:600}.scd-seg button.on{background:#0ea5e933;color:#38bdf8}' +
      '.scd-me{font-size:12px;margin-top:4px}.scd-ask{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:4px 0}.scd-act{display:flex;gap:8px;justify-content:flex-end;margin-top:10px;flex-wrap:wrap}' +
      '.scd-done{opacity:.75}.scd-meb{margin-top:12px;border-top:1px solid var(--border,#ffffff1f);padding-top:8px}.scd-meb textarea{width:100%;min-height:60px}' +
      '.scd-toast{position:fixed;inset-inline-end:18px;bottom:18px;z-index:99999;background:#0f172a;color:#fff;border:1px solid #0ea5e9;border-radius:12px;padding:10px 14px;box-shadow:0 8px 30px #0006;display:flex;gap:10px;align-items:center;font-size:14px}' +
      '.sc-doc{border:1px solid var(--border,#ffffff1f);border-radius:10px;padding:8px 10px;margin:6px 0}.sc-doc-h{display:flex;gap:8px;align-items:center;font-weight:700;margin-bottom:4px;flex-wrap:wrap}' +
      '.sc-doc-h .btn{margin-inline-start:auto}.sc-note-ed{display:flex;gap:6px;flex:1}.sc-note-ed input{flex:1}.sc-note-row{align-items:center}.sc-doc-wrap .sc-val{word-break:normal;overflow-wrap:anywhere}.sc-doc .sc-val[dir=ltr]{white-space:nowrap}';
    document.head.appendChild(s);
  }
  function toast(msg, act) {
    css();
    var old = document.querySelector('.scd-toast'); if (old) old.remove();
    var tEl = el('div', { class: 'scd-toast', dir: document.documentElement.dir || 'ltr' }, [el('span', { text: msg }), act ? el('button', { type: 'button', class: 'btn small primary', text: act.label, onclick: function () { tEl.remove(); act.fn(); } }) : null,
      el('button', { type: 'button', class: 'icon-btn', text: '✕', onclick: function () { tEl.remove(); } })]);
    document.body.appendChild(tEl);
    setTimeout(function () { if (tEl.parentNode) tEl.remove(); }, act ? 20000 : 7000);
  }

  var current = null; // açık pencere
  function open(opts) {
    opts = opts || {};
    css();
    if (current) { if (opts.items) opts.items.forEach(current.add); return current; }
    var refresh = opts.refresh || window.__falconScRefresh || window.__falconLanRefresh;
    var list = el('div', { class: 'scd-list' });
    var bd = el('div', { class: 'modal-backdrop scd-modal' });
    var close = function () { bd.remove(); document.removeEventListener('keydown', onKey, true); current = null; if (refresh) try { refresh(); } catch (e) {} };
    var onKey = function (e) { if (e.key === 'Escape') { var all = document.querySelectorAll('.modal-backdrop'); if (all[all.length - 1] === bd) { e.stopPropagation(); close(); } } };
    document.addEventListener('keydown', onKey, true);
    var add = function (src) { list.insertBefore(card(src, refresh), list.firstChild); };
    var drop = el('div', { class: 'scd-drop', text: t('drop') });
    var onFiles = function (files) {
      Array.prototype.forEach.call(files, function (f) {
        if (!mimeOf(f.name, f.type)) { toast(t('pdfOnly')); return; }
        f.arrayBuffer().then(function (ab) {
          var u8 = new Uint8Array(ab), sc = F().shamcash;
          if (sc && sc.put) return Promise.resolve(sc.put(f.name, u8)).then(unwrap).then(function (nm) { seen[nm] = 1; add({ file: { originalName: f.name, mime: mimeOf(f.name, f.type) }, bytes: u8, inbox: nm }); });
          toast(t('fileErr'));
        }).catch(function () { toast(t('fileErr')); });
      });
    };
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
    drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('over'); onFiles(e.dataTransfer.files); });
    var top = el('div', { class: 'scd-top' }, [
      el('button', { type: 'button', class: 'btn primary', text: t('pick'), onclick: function () { pickFiles().then(function (fs) { fs.forEach(function (f) { add({ file: f }); }); }).catch(function () { toast(t('fileErr')); }); } }),
      F().shamcash ? el('button', { type: 'button', class: 'btn', title: t('inboxTip'), text: t('inbox'), onclick: function () { F().shamcash.openInbox(); } }) : null,
      isDesk() && F().shamcash && F().shamcash.put ? drop : null
    ]);
    var meBox = el('textarea', { dir: 'auto' });
    getMe().then(function (me) { meBox.value = me.names.concat(me.accounts).join('\n'); });
    var meb = el('details', { class: 'scd-meb' }, [el('summary', { text: t('me') }), el('div', { class: 'scd-hint', text: t('meHint') }), meBox,
      el('div', { class: 'scd-act' }, [el('button', { type: 'button', class: 'btn small', text: t('meSave'), onclick: function () {
        var lines = meBox.value.split('\n').map(clean).filter(Boolean);
        saveMe({ names: lines.filter(function (l) { return !/^\**\d{4}$/.test(l.replace(/\s/g, '')); }), accounts: lines.map(function (l) { return /^\**\d{4,}$/.test(l.replace(/\s/g, '')) ? last4(l) : ''; }).filter(Boolean) }).then(function () { toast(t('saved')); });
      } })])]);
    var box = el('div', { class: 'modal xwide', dir: document.documentElement.dir || 'ltr' }, [
      el('div', { class: 'modal-header' }, [el('h2', {}, [el('span', { class: 'sc-logo', text: 'Sham Cash' }), ' ', t('title')]), el('button', { type: 'button', class: 'icon-btn', text: '✕', onclick: close })]),
      el('div', { class: 'modal-body' }, [top, list, meb]),
      el('div', { class: 'modal-footer' }, [el('button', { type: 'button', class: 'btn', text: t('close'), onclick: close })])
    ]);
    bd.appendChild(box);
    bd.addEventListener('mousedown', function (e) { if (e.target === bd) close(); });
    document.body.appendChild(bd);
    current = { add: add, close: close };
    (opts.items || []).forEach(add);
    return current;
  }

  // Tek dekont kartı. src: { file: {relPath, originalName, mime, side}, bytes?, inbox?, result? }
  function card(src, refresh) {
    var file = src.file || {}, st = el('div', { class: 'scd-st', text: t('reading') }), pv = el('div', { class: 'scd-pv', title: t('openOriginal') });
    var body = el('div'), c = el('div', { class: 'scd-card' }, [pv, el('div', {}, [el('div', { class: 'muted', text: file.originalName || '' }), st, body])]);
    pv.addEventListener('click', function () { if (file.relPath && F().files && F().files.open) F().files.open(file.relPath); });
    var bytesP = src.bytes ? Promise.resolve(src.bytes) : bytesOf(file);
    Promise.all([bytesP, accounts(), categories(), getMe()]).then(function (r) {
      var u8 = r[0], accs = r[1], cats = r[2], me = r[3];
      return (src.result ? Promise.resolve(src.result) : read(u8, file.mime, file.originalName, file.side)).then(function (res) {
        if (res.preview) pv.appendChild(el('img', { src: res.preview.toDataURL('image/jpeg', 0.85), alt: '' }));
        return dupOf(res.doc.ref).then(function (dup) { return form(res, accs, cats, me, dup); });
      });
    }).catch(function (e) { st.className = 'scd-st err'; st.textContent = t('fileErr') + (e && e.message ? ' (' + e.message + ')' : ''); });

    function form(res, accs, cats, me, dup) {
      var d = res.doc;
      var SRC = { side: ['ok', 'readSide'], both: res.diffs.length ? ['warn', 'readDiff'] : ['ok', 'readBoth'], ai: ['ok', 'readAi'], offline: ['warn', 'readOff'], none: ['err', 'readNone'] }[res.source];
      st.className = 'scd-st ' + SRC[0]; st.textContent = t(SRC[1]) + (res.source === 'offline' && res.aiError && res.aiError !== 'fail' ? ' · ' + t('readNoAi') : '');
      if (dup) { st.className = 'scd-st warn'; st.textContent = t('dup'); }
      var inp = {};
      var fld = function (k, wide, ltr) {
        var i = el('input', { value: d[k] || '', dir: ltr ? 'ltr' : 'auto' });
        i.addEventListener('input', function () { d[k] = i.value; if (k === 'from_name' || k === 'to_name' || /account/.test(k)) updDir(); if (k === 'currency') updAcc(); });
        inp[k] = i;
        return el('label', { class: (wide ? 'wide ' : '') + (res.diffs.indexOf(k) >= 0 ? 'diff' : ''), title: res.diffs.indexOf(k) >= 0 ? t('checkField') : null }, [el('span', { text: t(k) }), i]);
      };
      var g1 = el('div', { class: 'scd-g' }, [fld('kind', false, true), fld('ref', false, true), fld('date', false, true), fld('time', false, true),
        fld('from_name', true), fld('from_account', false, true), el('span'), fld('to_name', true), fld('to_account', false, true), el('span'),
        fld('amount', false, true), fld('currency', false, true), fld('note', true)]);
      // yön
      var dir = directionOf(me, d), dirInfo = el('div', { class: 'scd-me' }), seg = el('div', { class: 'scd-seg' });
      var bIn = el('button', { type: 'button', text: t('in') }), bOut = el('button', { type: 'button', text: t('out') });
      seg.appendChild(bIn); seg.appendChild(bOut);
      var setDir = function (v) { dir = v; bIn.className = v === 'in' ? 'on' : ''; bOut.className = v === 'out' ? 'on' : ''; catSel.value = catFor(v); };
      bIn.onclick = function () { setDir('in'); }; bOut.onclick = function () { setDir('out'); };
      function updDir() {
        var v = directionOf(me, d);
        dirInfo.innerHTML = '';
        if (v) { setDir(v); dirInfo.textContent = t(v === 'out' ? 'meSender' : 'meRecipient'); return; }
        dirInfo.appendChild(el('div', { class: 'scd-ask' }, [el('b', { text: t('meUnknown') }),
          el('button', { type: 'button', class: 'btn small', text: t('iamSender'), onclick: function () { addMe(d.from_name, d.from_account).then(function (m) { me = m; updDir(); }); } }),
          el('button', { type: 'button', class: 'btn small', text: t('iamRecipient'), onclick: function () { addMe(d.to_name, d.to_account).then(function (m) { me = m; updDir(); }); } }),
          el('button', { type: 'button', class: 'btn small ghost', text: t('neither'), onclick: function () { dirInfo.textContent = t('dir') + ': ' + t('in') + ' / ' + t('out') + ' ↑'; } })]));
      }
      // kasa / kategori
      var accSel = el('select'), catSel = el('select'), catMemo = { in: 'other', out: 'other' };
      var catFor = function (v) { return catMemo[v] || 'other'; };
      cats.forEach(function (cc) { catSel.appendChild(el('option', { value: cc.key, text: catLabel(cc) })); });
      var accWarn = el('div', { class: 'scd-hint' });
      function updAcc() {
        var cur = curOf(d.currency) || d.currency;
        accSel.innerHTML = '';
        var vis = accs.filter(function (a) { return !a.hidden; }), mine = vis.filter(function (a) { return a.currency_code === cur; });
        mine.concat(vis.filter(function (a) { return a.currency_code !== cur; })).forEach(function (a) { accSel.appendChild(el('option', { value: a.id, text: a.name + ' (' + a.currency_code + ')' })); });
        pickAccount(accs, cur).then(function (id) { if (id) accSel.value = id; chkAcc(); });
      }
      function chkAcc() {
        var a = accs.filter(function (x) { return String(x.id) === accSel.value; })[0], cur = curOf(d.currency) || d.currency;
        accWarn.textContent = !accs.some(function (x) { return x.currency_code === cur && !x.hidden; }) && cur ? t('noAccount', { c: cur }) : a && cur && a.currency_code !== cur ? t('curMismatch', { a: cur, b: a.currency_code }) : '';
      }
      accSel.addEventListener('change', chkAcc);
      var desc = el('input', { placeholder: t('descPh'), dir: 'auto' }), note = el('input', { placeholder: t('myNotePh'), dir: 'auto' });
      var toCash = el('input', { type: 'checkbox' }); toCash.checked = true;
      var g2 = el('div', { class: 'scd-g' }, [
        el('label', {}, [el('span', { text: t('dir') }), seg]), el('label', {}, [el('span', { text: t('account') }), accSel]),
        el('div', { class: 'wide' }, [dirInfo, accWarn]),
        el('label', {}, [el('span', { text: t('category') }), catSel]), el('label', {}, [el('span', { text: t('description') }), desc]),
        el('label', { class: 'wide' }, [el('span', { text: t('myNote') }), note]),
        el('label', { class: 'wide check' }, [el('span', {}, [toCash, ' ', t('addToCash')])])
      ]);
      var saveBtn = el('button', { type: 'button', class: 'btn primary', text: t('save') });
      var skipBtn = el('button', { type: 'button', class: 'btn', text: t('skip'), onclick: function () { c.remove(); } });
      var act = el('div', { class: 'scd-act' }, [skipBtn, saveBtn]);
      body.appendChild(el('div', { class: 'scd-h', text: t('docInfo') })); body.appendChild(el('div', { class: 'scd-hint', text: t('docHint') })); body.appendChild(g1);
      body.appendChild(el('div', { class: 'scd-h', text: t('record') })); body.appendChild(g2); body.appendChild(act);
      Promise.all([setting('shamcash_cat_in'), setting('shamcash_cat_out')]).then(function (v) { catMemo.in = v[0] || 'other'; catMemo.out = v[1] || 'other'; if (dir) catSel.value = catFor(dir); else catSel.value = 'other'; });
      updAcc(); updDir();
      var finish = function (r, auto) {
        saveBtn.remove(); skipBtn.textContent = t('close');
        if (r.duplicate) { st.className = 'scd-st warn'; st.textContent = t('dup'); }
        else { st.className = 'scd-st ok'; st.textContent = auto ? t('savedAuto') : t('saved'); }
        Array.prototype.forEach.call(g1.querySelectorAll('input'), function (i) { i.disabled = true; });
        Array.prototype.forEach.call(g2.querySelectorAll('input,select,button'), function (i) { if (i !== note) i.disabled = true; });
        // kaydedildikten sonra da not yazılabilir
        if (!r.duplicate) {
          note.addEventListener('change', function () { call('setShamCashNote', { id: r.id, note: note.value }).then(function () { if (refresh) refresh(); }); });
        }
        c.classList.add('scd-done');
        if (refresh) try { refresh(); } catch (e) {}
      };
      saveBtn.onclick = function () {
        if (!dir) { toast(t('needDir')); return; }
        if (!amountNum(d.amount) || !clean(d.ref)) { toast(t('needAmount')); return; }
        if (!accSel.value) { toast(t('noAccount', { c: d.currency || '' })); return; }
        saveBtn.disabled = true;
        saveItem({ doc: d, direction: dir, account_id: accSel.value, category: catSel.value, description: desc.value, note: note.value, add_to_cash: toCash.checked, file: file, source: res.source, model: d._model, inbox: src.inbox })
          .then(function (r) { finish(r, false); }, function (e) { saveBtn.disabled = false; toast(t('fileErr') + ' (' + (e && (e.code || e.message)) + ')'); });
      };
      if (dup) { saveBtn.remove(); if (src.inbox && F().shamcash) F().shamcash.done(src.inbox); }
    }
    return c;
  }

  // ---------- masaüstü dekont kutusu: kendiliğinden işleme ----------
  var busy = false, seen = {};
  function auto(item, res) {
    // Kendiliğinden kayıt: doğrulanmış (.json) ya da iki okuma birebir aynı + yön belli + kasa belli + kopya değil
    if (!(res.source === 'side' || (res.source === 'both' && !res.diffs.length))) return Promise.resolve(null);
    var d = res.doc;
    if (!amountNum(d.amount) || !d.ref || !validDate(d.date)) return Promise.resolve(null);
    return Promise.all([getMe(), accounts(), dupOf(d.ref)]).then(function (r) {
      var side = item.file.side || {};
      if (side.me_name || side.me_account) return addMe(side.me_name, side.me_account).then(function (me) { return [me, r[1], r[2]]; });
      return r;
    }).then(function (r) {
      var me = r[0], accs = r[1], dup = r[2];
      if (dup) { F().shamcash.done(item.inbox); return { id: dup, duplicate: true }; }
      var dir = (item.file.side && /^(in|out)$/.test(item.file.side.direction)) ? item.file.side.direction : directionOf(me, d);
      if (!dir) return null;
      return pickAccount(accs, d.currency).then(function (acc) {
        if (!acc) return null;
        return setting('shamcash_cat_' + dir).then(function (cat) {
          var side = item.file.side || {};
          return saveItem({ doc: d, direction: dir, account_id: acc, category: side.category || cat || 'other', description: side.description || '', note: side.note || '', file: item.file, source: res.source, model: d._model, inbox: item.inbox });
        });
      });
    });
  }
  function checkInbox() {
    var sc = F().shamcash;
    if (busy || !sc || !sc.inbox || document.hidden) return;
    busy = true;
    Promise.resolve(sc.inbox()).then(unwrap).then(function (files) {
      files = (files || []).filter(function (f) { return !seen[f.name]; });
      var saved = 0, wait = [], seq = Promise.resolve();
      files.forEach(function (f) {
        seq = seq.then(function () {
          seen[f.name] = 1;
          return Promise.resolve(sc.peek(f.name)).then(unwrap).then(function (pk) {
            var file = { originalName: pk.originalName, mime: pk.mime, side: pk.side };
            return Promise.resolve(pk.bytes instanceof Uint8Array ? pk.bytes : new Uint8Array(pk.bytes)).then(function (u8) {
              return read(u8, file.mime, file.originalName, file.side).then(function (res) {
                var item = { file: file, bytes: u8, inbox: f.name, result: res };
                return auto(item, res).then(function (r) { if (r && !r.duplicate) { saved++; } else if (!r) wait.push(item); }, function () { wait.push(item); });
              });
            });
          }).catch(function () {});
        });
      });
      return seq.then(function () {
        var rf = window.__falconScRefresh || window.__falconLanRefresh;
        if (saved && rf) try { rf(); } catch (e) {}
        if (saved) toast(t('autoDone', { n: saved }));
        if (wait.length) {
          if (current) wait.forEach(current.add);
          else toast(t('waiting', { n: wait.length }), { label: t('open'), fn: function () { open({ items: wait }); } });
        }
      });
    }).catch(function () {}).then(function () { busy = false; });
  }
  if (isDesk()) {
    setTimeout(checkInbox, 8000);
    setInterval(checkInbox, 60000);
    window.addEventListener('focus', function () { setTimeout(checkInbox, 500); });
  }

  // Kayıttaki orijinal dekontu açar (dosyaya dokunmadan)
  function openOriginal(txId) {
    // v1.67: elle girilen kayda eklenen dekontun yolu sc_doc.file_path'te (kayıtta başka belgeler de olabilir)
    return dbAll("SELECT json_extract(sc_doc,'$.file_path') AS fp FROM cash_transactions WHERE id = ?", [txId]).catch(function () { return []; }).then(function (a) {
      if (a[0] && a[0].fp) return [{ file_path: a[0].fp }];
      return dbAll('SELECT file_path FROM receipts WHERE transaction_id = ? ORDER BY id LIMIT 1', [txId]);
    }).then(function (r) {
      if (r[0] && F().files && F().files.open) F().files.open(r[0].file_path);
    });
  }

  try { css(); } catch (e) {}
  window.FalconShamDekont = { open: open, read: read, pick: pick, formPatch: formPatch, choose: choose, rows: rows, conflictText: conflictText, redirect: redirect, markForm: markForm, message: message, detect: detect, fromDrop: fromDrop, mark: mark, late: late, warm: warm, skipWait: skipWait, canSkip: canSkip, statusText: statusText, kindDir: kindDir, payeeOf: payeeOf, toIso: toIso, amountNum: amountNum, accounts: accounts, t: t, openOriginal: openOriginal, checkInbox: checkInbox, parseOcr: parseOcr, dateFix: dateFix, parseText: parseText, version: VERSION,
    _test: { normDoc: normDoc, directionOf: directionOf, amountNum: amountNum, snapName: snapName, toIso: toIso, curOf: curOf } };
})();
