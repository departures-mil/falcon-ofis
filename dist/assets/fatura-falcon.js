/* v1.59: Fatura sekmesi (masaüstü + telefon aynı dosya). v1.60: Müşteriler / Ürünler sekmeleri, modüler düzen (sütunlar, fatura bilgileri,
 * müşteri / ürün alanları), satır KDV'si, e-Fatura şablonu, karekod + barkod, PDF'den doldur (fatura-pdf.js).
 * Arayüz derlenmiş paket olduğundan sayfa burada düz JS ile çizilir; paket yalnız boş bir kutu (FalconInvoicesPage) açar ve
 * window.FalconFatura.mount(kutu, app) çağırır. Kayıtlar ana süreçte: saveInvoice, addInvoicePayment, deleteInvoicePayment,
 * setInvoiceCancelled, deleteInvoice (services.js). Ayarlar `settings` tablosunda (eşitlenir): invoice_company, invoice_defaults,
 * invoice_prefix, invoice_signature / invoice_stamp / invoice_logo (küçültülmüş resim, data: adresi — PDF'e doğrudan gömülür).
 * PDF: window.falcon.report.savePdf(html, ad) — masaüstünde gizli pencerede A4, telefonda yazdır / PDF kaydet. */
(function () {
  'use strict';
  if (window.FalconFatura) return;

  var CUR = ['USD', 'TRY', 'SYP'];
  var SYM = { USD: '$', TRY: '₺', SYP: 'ل.س' };
  var DEC = { USD: 2, TRY: 2, SYP: 0 };
  var TEMPLATES = ['falcon', 'efatura', 'classic', 'minimal'];

  // ---------- çeviriler ----------
  var TX = {
    tr: {
      intro: 'Ürün ve hizmet satışlarını faturalayın, PDF olarak verin; tahsilatı hemen ya da sonra kasaya işleyin.',
      newInv: 'Yeni fatura', settings: 'Fatura ayarları', search: 'Fatura no, müşteri, ürün…', all: 'Tümü',
      st_pending: 'Bekliyor', st_partial: 'Kısmi ödeme', st_paid: 'Ödendi', st_cancelled: 'İptal',
      allCur: 'Tüm para birimleri', from: 'Başlangıç', to: 'Bitiş',
      sumTotal: 'Faturalanan', sumPaid: 'Tahsil edilen', sumOpen: 'Bekleyen', count: 'fatura',
      empty: 'Henüz fatura yok. "Yeni fatura" ile başlayın.', noMatch: 'Filtreye uyan fatura yok.',
      no: 'No', date: 'Tarih', due: 'Vade', customer: 'Müşteri', total: 'Tutar', paid: 'Ödenen', remaining: 'Kalan', status: 'Durum',
      pdf: 'PDF', preview: 'Önizle', pay: 'Kasaya işle', payments: 'Tahsilatlar', edit: 'Düzenle', cancel: 'İptal et', uncancel: 'İptali geri al',
      del: 'Sil', close: 'Kapat', save: 'Kaydet', saveAndPdf: 'Kaydet ve PDF', saving: 'Kaydediliyor…',
      editInv: 'Faturayı düzenle', invNo: 'Fatura no', invNoHint: 'Boş bırakılırsa otomatik verilir',
      cName: 'Müşteri adı', cPhone: 'Telefon', cEmail: 'E-posta', cAddress: 'Adres', cTax: 'Vergi / kimlik no',
      currency: 'Para birimi', template: 'Şablon', lang: 'Fatura dili',
      items: 'Ürün / hizmet kalemleri', itemName: 'Ürün / hizmet', signField: 'İmza', signOn: 'İmza ekle', signOff: 'İmzasız', signFieldHint: 'Yalnız bu fatura için. İmzasızda imza alanı boş kalır (elle imzalanabilir).', itemNameHint: 'Shift+Enter: alt satır · Enter: miktara geç', itemPick: 'Kayıtlı ürünler', qty: 'Miktar', unit: 'Birim', price: 'Birim fiyat', line: 'Tutar',
      addItem: '+ Kalem ekle', removeItem: 'Kalemi sil', discount: 'İndirim', taxRate: 'Vergi oranı (%)', note: 'Not',
      subtotal: 'Ara toplam', tax: 'Vergi', grand: 'Genel toplam',
      cashTitle: 'Gelir kaydı', cashYes: 'Kasaya giriş yap', cashNo: 'Kasaya giriş yapma (tahsil edilmedi)',
      cashYesHint: 'Tutar şimdi gelir olarak kasaya yazılır.', cashNoHint: 'Fatura "Bekliyor" olarak kalır; sonradan "Kasaya işle" ile gelire alınır.',
      account: 'Kasa', payAmount: 'Tahsil edilen tutar', payAmountHint: 'Kısmi ödemede yalnız alınan tutarı yazın',
      payTitle: 'Tahsilat — kasaya işle', payDate: 'Tahsilat tarihi', payNote: 'Açıklama', payDel: 'Tahsilatı sil',
      payNone: 'Henüz tahsilat yok.', payDone: 'Fatura tamamen ödendi.', noAccount: 'Bu para biriminde kasa yok — Kasa sayfasından ekleyin.',
      confirmDel: 'Bu fatura silinsin mi? Kasaya işlenmiş tahsilatları da kasadan silinir (Silinenler kutusundan geri alınabilir).',
      confirmCancel: 'Fatura iptal edilsin mi?', confirmPayDel: 'Bu tahsilat silinsin mi? Kasadaki girişi de silinir.',
      sTitle: 'Fatura ayarları', sCompany: 'Firma bilgileri', sName: 'Firma adı', sAddress: 'Adres', sPhone: 'Telefon', sEmail: 'E-posta',
      sWeb: 'Web sitesi', sTax: 'Vergi no', sTaxOffice: 'Vergi dairesi', sMersis: 'MERSİS / Ticaret sicil no', sBank: 'Banka / ödeme bilgisi', sFooter: 'Teşekkür / alt not (her faturada)', sFF: 'Alt bilgi alanları', sFFHint: 'Faturanın altında görünür. Adı boş bırakılırsa faturanın dilindeki standart ad yazılır. Kutucuk kapalıysa alan basılmaz.', sFFAdd: '+ Alan ekle', sFFLabel: 'Ad', sFFValue: 'Değer', sFFCol: 'Sütun', sFFNew: 'Yeni alan', sFFCols: 'Sütun başlıkları', sFFColsHint: 'Boş = standart başlık; başlık istemezseniz - yazın.', sFFReset: 'Standart alanlara dön', sPos: 'Firma bilgilerinin yeri', sPosTop: 'Üstte (antette)', sPosBottom: 'Altta (alt bilgide)', sPosBoth: 'Üstte ve altta', sFFUp: 'Yukarı', sFFDown: 'Aşağı',
      sDefaults: 'Varsayılanlar', sPrefix: 'Fatura no ön eki', sLogo: 'Logo', sLogoFalcon: 'Falcon (standart)', sLogoFalconCti: 'Falcon CTI (eski)', sLogoCustom: 'Kendi logom',
      sSign: 'İmza', sStamp: 'Kaşe / mühür', upload: 'Yükle', change: 'Değiştir', remove: 'Kaldır',
      signSample: 'Şu an ÖRNEK imza kullanılıyor. Orijinal imzanızı yükleyin (şeffaf PNG en iyisi; beyaz zemin otomatik şeffaflaşır).',
      signReal: 'Kendi imzanız kullanılıyor.', stampNone: 'Kaşe yok (isteğe bağlı).', imgFail: 'Resim okunamadı.',
      tplFalcon: 'Falcon System (kurumsal)', tplClassic: 'Klasik', tplMinimal: 'Sade',
      saved: 'Kaydedildi', deleted: 'Silindi', pdfSaved: 'PDF hazırlandı', product: 'Ürün listesinden seç',
      errItems: 'En az bir kalem girin (ürün / hizmet adı).', errCustomer: 'Müşteri adını yazın.',
      langTr: 'Türkçe', langEn: 'İngilizce', langAr: 'Arapça', previewTitle: 'Fatura önizleme', overdue: 'vadesi geçti', previewDraft: 'Kaydedilmemiş taslak', previewSample: 'Örnek fatura', previewSampleCust: 'Örnek Müşteri Ltd.', previewSampleItem1: 'Danışmanlık hizmeti', previewSampleItem2: 'Eğitim (saat)', zoomFit: 'Sığdır', zoomFull: '%100'
    },
    en: {
      intro: 'Invoice product and service sales, export them as PDF and post the payment to the cash box now or later.',
      newInv: 'New invoice', settings: 'Invoice settings', search: 'Invoice no, customer, item…', all: 'All',
      st_pending: 'Unpaid', st_partial: 'Partly paid', st_paid: 'Paid', st_cancelled: 'Cancelled',
      allCur: 'All currencies', from: 'From', to: 'To',
      sumTotal: 'Invoiced', sumPaid: 'Collected', sumOpen: 'Outstanding', count: 'invoices',
      empty: 'No invoices yet. Start with "New invoice".', noMatch: 'No invoice matches the filter.',
      no: 'No', date: 'Date', due: 'Due', customer: 'Customer', total: 'Amount', paid: 'Paid', remaining: 'Balance', status: 'Status',
      pdf: 'PDF', preview: 'Preview', pay: 'Post to cash', payments: 'Payments', edit: 'Edit', cancel: 'Cancel invoice', uncancel: 'Undo cancel',
      del: 'Delete', close: 'Close', save: 'Save', saveAndPdf: 'Save and PDF', saving: 'Saving…',
      editInv: 'Edit invoice', invNo: 'Invoice no', invNoHint: 'Assigned automatically if left empty',
      cName: 'Customer name', cPhone: 'Phone', cEmail: 'E-mail', cAddress: 'Address', cTax: 'Tax / ID no',
      currency: 'Currency', template: 'Template', lang: 'Invoice language',
      items: 'Products / services', itemName: 'Product / service', signField: 'Signature', signOn: 'Add signature', signOff: 'No signature', signFieldHint: 'For this invoice only. Without a signature the signature box is left blank (can be signed by hand).', itemNameHint: 'Shift+Enter: new line · Enter: go to quantity', itemPick: 'Saved products', qty: 'Qty', unit: 'Unit', price: 'Unit price', line: 'Amount',
      addItem: '+ Add line', removeItem: 'Remove line', discount: 'Discount', taxRate: 'Tax rate (%)', note: 'Note',
      subtotal: 'Subtotal', tax: 'Tax', grand: 'Grand total',
      cashTitle: 'Income record', cashYes: 'Post to cash box', cashNo: 'Do not post to cash (not collected)',
      cashYesHint: 'The amount is recorded as income in the cash box now.', cashNoHint: 'The invoice stays "Unpaid"; post it later with "Post to cash".',
      account: 'Cash box', payAmount: 'Amount collected', payAmountHint: 'For a partial payment enter only the amount received',
      payTitle: 'Payment — post to cash', payDate: 'Payment date', payNote: 'Description', payDel: 'Delete payment',
      payNone: 'No payments yet.', payDone: 'The invoice is fully paid.', noAccount: 'No cash box in this currency — add one on the Cash page.',
      confirmDel: 'Delete this invoice? Its payments posted to the cash box are removed too (can be restored from Deleted items).',
      confirmCancel: 'Cancel this invoice?', confirmPayDel: 'Delete this payment? Its cash entry is deleted too.',
      sTitle: 'Invoice settings', sCompany: 'Company details', sName: 'Company name', sAddress: 'Address', sPhone: 'Phone', sEmail: 'E-mail',
      sWeb: 'Website', sTax: 'Tax no', sTaxOffice: 'Tax office', sMersis: 'Trade registry / MERSIS no', sBank: 'Bank / payment details', sFooter: 'Thank-you / footer note (on every invoice)', sFF: 'Footer fields', sFFHint: 'Shown at the bottom of the invoice. If the name is left empty, the standard name in the invoice language is used. Unticked fields are not printed.', sFFAdd: '+ Add field', sFFLabel: 'Name', sFFValue: 'Value', sFFCol: 'Column', sFFNew: 'New field', sFFCols: 'Column titles', sFFColsHint: 'Empty = standard title; type - for no title.', sFFReset: 'Back to standard fields', sPos: 'Position of company details', sPosTop: 'Top (letterhead)', sPosBottom: 'Bottom (footer)', sPosBoth: 'Top and bottom', sFFUp: 'Up', sFFDown: 'Down',
      sDefaults: 'Defaults', sPrefix: 'Invoice number prefix', sLogo: 'Logo', sLogoFalcon: 'Falcon (standard)', sLogoFalconCti: 'Falcon CTI (old)', sLogoCustom: 'My own logo',
      sSign: 'Signature', sStamp: 'Company stamp', upload: 'Upload', change: 'Change', remove: 'Remove',
      signSample: 'A SAMPLE signature is in use. Upload your original signature (transparent PNG is best; a white background is made transparent).',
      signReal: 'Your own signature is in use.', stampNone: 'No stamp (optional).', imgFail: 'The image could not be read.',
      tplFalcon: 'Falcon System (corporate)', tplClassic: 'Classic', tplMinimal: 'Minimal',
      saved: 'Saved', deleted: 'Deleted', pdfSaved: 'PDF ready', product: 'Pick from products',
      errItems: 'Enter at least one line (product / service name).', errCustomer: 'Enter the customer name.',
      langTr: 'Turkish', langEn: 'English', langAr: 'Arabic', previewTitle: 'Invoice preview', overdue: 'overdue', previewDraft: 'Unsaved draft', previewSample: 'Sample invoice', previewSampleCust: 'Sample Customer Ltd.', previewSampleItem1: 'Consulting service', previewSampleItem2: 'Training (hours)', zoomFit: 'Fit', zoomFull: '100%'
    },
    ar: {
      intro: 'أصدر فواتير مبيعات المنتجات والخدمات وصدّرها بصيغة PDF، وسجّل التحصيل في الصندوق فوراً أو لاحقاً.',
      newInv: 'فاتورة جديدة', settings: 'إعدادات الفواتير', search: 'رقم الفاتورة، العميل، الصنف…', all: 'الكل',
      st_pending: 'غير مدفوعة', st_partial: 'مدفوعة جزئياً', st_paid: 'مدفوعة', st_cancelled: 'ملغاة',
      allCur: 'كل العملات', from: 'من', to: 'إلى',
      sumTotal: 'إجمالي الفواتير', sumPaid: 'المحصَّل', sumOpen: 'المستحق', count: 'فاتورة',
      empty: 'لا توجد فواتير بعد. ابدأ بـ «فاتورة جديدة».', noMatch: 'لا توجد فاتورة مطابقة للتصفية.',
      no: 'الرقم', date: 'التاريخ', due: 'الاستحقاق', customer: 'العميل', total: 'المبلغ', paid: 'المدفوع', remaining: 'المتبقي', status: 'الحالة',
      pdf: 'PDF', preview: 'معاينة', pay: 'تسجيل في الصندوق', payments: 'التحصيلات', edit: 'تعديل', cancel: 'إلغاء الفاتورة', uncancel: 'التراجع عن الإلغاء',
      del: 'حذف', close: 'إغلاق', save: 'حفظ', saveAndPdf: 'حفظ و PDF', saving: 'جارٍ الحفظ…',
      editInv: 'تعديل الفاتورة', invNo: 'رقم الفاتورة', invNoHint: 'يُعطى تلقائياً إذا تُرك فارغاً',
      cName: 'اسم العميل', cPhone: 'الهاتف', cEmail: 'البريد الإلكتروني', cAddress: 'العنوان', cTax: 'الرقم الضريبي / الهوية',
      currency: 'العملة', template: 'القالب', lang: 'لغة الفاتورة',
      items: 'المنتجات / الخدمات', itemName: 'المنتج / الخدمة', signField: 'التوقيع', signOn: 'إضافة التوقيع', signOff: 'بدون توقيع', signFieldHint: 'لهذه الفاتورة فقط. عند عدم إضافة التوقيع يبقى حقل التوقيع فارغاً (يمكن التوقيع يدوياً).', itemNameHint: 'Shift+Enter: سطر جديد · Enter: الانتقال إلى الكمية', itemPick: 'المنتجات المحفوظة', qty: 'الكمية', unit: 'الوحدة', price: 'سعر الوحدة', line: 'المبلغ',
      addItem: '+ إضافة بند', removeItem: 'حذف البند', discount: 'الخصم', taxRate: 'نسبة الضريبة (%)', note: 'ملاحظة',
      subtotal: 'المجموع الفرعي', tax: 'الضريبة', grand: 'الإجمالي',
      cashTitle: 'تسجيل الإيراد', cashYes: 'تسجيل في الصندوق', cashNo: 'عدم التسجيل في الصندوق (لم تُحصَّل)',
      cashYesHint: 'يُسجَّل المبلغ الآن إيراداً في الصندوق.', cashNoHint: 'تبقى الفاتورة «غير مدفوعة»، وتُسجَّل لاحقاً بزر «تسجيل في الصندوق».',
      account: 'الصندوق', payAmount: 'المبلغ المحصَّل', payAmountHint: 'في الدفع الجزئي اكتب المبلغ المستلم فقط',
      payTitle: 'تحصيل — تسجيل في الصندوق', payDate: 'تاريخ التحصيل', payNote: 'البيان', payDel: 'حذف التحصيل',
      payNone: 'لا توجد تحصيلات بعد.', payDone: 'الفاتورة مدفوعة بالكامل.', noAccount: 'لا يوجد صندوق بهذه العملة — أضفه من صفحة الصندوق.',
      confirmDel: 'حذف هذه الفاتورة؟ تُحذف أيضاً تحصيلاتها المسجلة في الصندوق (يمكن استعادتها من المحذوفات).',
      confirmCancel: 'إلغاء هذه الفاتورة؟', confirmPayDel: 'حذف هذا التحصيل؟ يُحذف قيده في الصندوق أيضاً.',
      sTitle: 'إعدادات الفواتير', sCompany: 'بيانات الشركة', sName: 'اسم الشركة', sAddress: 'العنوان', sPhone: 'الهاتف', sEmail: 'البريد الإلكتروني',
      sWeb: 'الموقع الإلكتروني', sTax: 'الرقم الضريبي', sTaxOffice: 'دائرة الضرائب', sMersis: 'رقم السجل التجاري', sBank: 'بيانات البنك / الدفع', sFooter: 'عبارة الشكر / ملاحظة التذييل (في كل فاتورة)', sFF: 'حقول التذييل', sFFHint: 'تظهر أسفل الفاتورة. إذا تُرك الاسم فارغاً يُكتب الاسم القياسي بلغة الفاتورة. الحقل غير المحدد لا يُطبع.', sFFAdd: '+ إضافة حقل', sFFLabel: 'الاسم', sFFValue: 'القيمة', sFFCol: 'العمود', sFFNew: 'حقل جديد', sFFCols: 'عناوين الأعمدة', sFFColsHint: 'فارغ = العنوان القياسي؛ اكتب - لإخفاء العنوان.', sFFReset: 'العودة إلى الحقول القياسية', sPos: 'موضع بيانات الشركة', sPosTop: 'في الأعلى (الترويسة)', sPosBottom: 'في الأسفل (التذييل)', sPosBoth: 'في الأعلى والأسفل', sFFUp: 'أعلى', sFFDown: 'أسفل',
      sDefaults: 'الإعدادات الافتراضية', sPrefix: 'بادئة رقم الفاتورة', sLogo: 'الشعار', sLogoFalcon: 'فالكون (القياسي)', sLogoFalconCti: 'فالكون CTI (القديم)', sLogoCustom: 'شعاري الخاص',
      sSign: 'التوقيع', sStamp: 'ختم الشركة', upload: 'رفع', change: 'تغيير', remove: 'إزالة',
      signSample: 'يُستخدم الآن توقيع «نموذج». ارفع توقيعك الأصلي (PNG شفاف هو الأفضل؛ الخلفية البيضاء تُجعل شفافة تلقائياً).',
      signReal: 'يُستخدم توقيعك الخاص.', stampNone: 'لا يوجد ختم (اختياري).', imgFail: 'تعذّرت قراءة الصورة.',
      tplFalcon: 'Falcon System (مؤسسي)', tplClassic: 'كلاسيكي', tplMinimal: 'بسيط',
      saved: 'تم الحفظ', deleted: 'تم الحذف', pdfSaved: 'ملف PDF جاهز', product: 'اختر من المنتجات',
      errItems: 'أدخل بنداً واحداً على الأقل (اسم المنتج / الخدمة).', errCustomer: 'اكتب اسم العميل.',
      langTr: 'التركية', langEn: 'الإنجليزية', langAr: 'العربية', previewTitle: 'معاينة الفاتورة', overdue: 'متأخرة', previewDraft: 'مسودة غير محفوظة', previewSample: 'فاتورة نموذجية', previewSampleCust: 'شركة العميل النموذجي', previewSampleItem1: 'خدمة استشارية', previewSampleItem2: 'تدريب (ساعة)', zoomFit: 'ملاءمة', zoomFull: '100%'
    }
  };
  // v1.60 metinleri
  var TX2 = {
    tr: {
      tabInv: 'Faturalar', tabCust: 'Müşteriler', tabProd: 'Ürünler', tplEfatura: 'e-Fatura (GİB düzeni)', unitPcs: 'Adet', unitHour: 'Saat',
      fromPdf: 'PDF\'den doldur', fromPdfHint: 'PDF faturayı okuyup müşteri, fatura bilgileri, ürün ve fiyatları otomatik doldurur (önce yapay zeka, internet yoksa çevrimdışı)',
      secCustomer: 'Müşteri', secInfo: 'Fatura bilgileri', custLinked: 'Kayıtlı müşteri', custNew: 'Yeni müşteri — kaydedilince listeye eklenir', custFromOld: 'eski faturadan', custPick: 'Kayıtlı müşteriler',
      ettnNew: 'Yeni ETTN üret', vatCalc: 'Hesaplanan KDV',
      pdfApplied: 'PDF bilgileri dolduruldu — kontrol edip kaydedin', pdfNoReader: 'PDF okuyucu yüklenemedi.', pdfReading: 'PDF okunuyor…', pdfAi: 'Yapay zeka okuyor…', pdfOffline: 'Çevrimdışı okunuyor…',
      pdfScanned: 'Bu PDF taranmış resim; çevrimdışı okunamadı. İnternete bağlanıp yapay zeka anahtarıyla deneyin.', pdfNothing: 'PDF\'de fatura bilgisi bulunamadı.', pdfFail: 'PDF okunamadı.',
      pdfSrcAi: 'Yapay zeka ile okundu', pdfSrcOffline: 'Çevrimdışı okundu', pdfNoNet: 'internet yok', pdfNoKey: 'yapay zeka anahtarı yok (Ayarlar → Asistan)', pdfBadKey: 'yapay zeka anahtarı geçersiz',
      pdfWhy_skip: 'yapay zeka anahtarı yok ya da kapalı (Ayarlar → Asistan)', pdfWhy_key: 'yapay zeka anahtarı geçersiz', pdfWhy_net: 'internete ulaşılamadı', pdfWhy_timeout: 'yapay zeka zamanında cevap vermedi',
      pdfWhy_quota: 'yapay zeka kullanım kotası doldu', pdfWhy_empty: 'yapay zeka boş sonuç verdi', pdfWhy_fail: 'yapay zeka okuyamadı', pdfWhy_cancel: 'yapay zeka beklenmedi',
      pdfVerify: 'Çevrimdışı okumayla karşılaştırılıyor…', pdfSkipAi: 'Beklemeden çevrimdışı oku', pdfSec: '{s} sn',
      vMatch: 'Çevrimdışı okumayla teyit edildi — rakamlar birebir aynı', vFixed: 'Çevrimdışı okumayla {n} fark bulundu — PDF\'in kendi yazısındaki rakamlar kullanıldı (toplamlar tutuyor)',
      vFixedWhole: 'Yapay zeka okuması tutarsızdı ({n} fark) — çevrimdışı okuma kullanıldı (toplamlar tutuyor)', vDiff: 'Çevrimdışı okumayla {n} fark var — işaretli satırları kontrol edin',
      vNone: 'Çevrimdışı teyit yapılamadı (PDF\'te yazı katmanı yok — taranmış belge)', vShow: 'Farkları göster', vHide: 'Farkları gizle', vLine: '{f}: yapay zeka {a} · çevrimdışı {b}',
      vCount: 'Kalem sayısı', vRow: '{i}. satır {k}', vk_qty: 'miktar', vk_price: 'birim fiyat', vk_amount: 'tutar', vk_vat: 'KDV %', vk_code: 'stok kodu',
      vt_subtotal: 'Ara toplam', vt_discount: 'Toplam iskonto', vt_vat: 'Hesaplanan KDV', vt_total: 'Vergiler dahil toplam', vt_payable: 'Ödenecek tutar',
      vm_number: 'Fatura no', vm_date: 'Fatura tarihi', vm_ettn: 'ETTN', vb_tax_no: 'Alıcı VKN', vs_tax_no: 'Satıcı VKN',
      useAi: 'Yapay zeka okumasını kullan', useOff: 'Çevrimdışı okumayı kullan', rereadAi: 'Yapay zekayla tekrar oku',
      impTitle: 'PDF\'den okunan bilgiler', impApply: 'Faturaya aktar', impSideBuyer: 'Müşteri = SAYIN (alıcı)', impSideSeller: 'Müşteri = Satıcı',
      impCustFound: 'Kayıtlı müşteri: {n} — eksik bilgileri tamamlanır', impCustNew: 'Yeni müşteri olarak kaydedilecek', impNewProduct: 'Yeni ürün', impMatch: 'Ürün kaydı',
      impCurUnknown: 'Para birimi ({c}) desteklenmiyor — faturanın para birimini seçin', impMetaHint: 'İşaretli bilgiler faturaya alınır. Fatura No ve ETTN sizde yeniden üretilir.',
      impTotals: 'Kalemlerin toplamı {a} · PDF\'deki ara toplam {b}',
      custSearch: 'Ad, VKN, telefon, il…', custImport: 'Eski faturalardan aktar', custImportHint: 'Eski faturalardaki alıcıları müşteri listesine ekler (aynı VKN / ad bir kez)', custImported: '{n} müşteri eklendi',
      custNewBtn: 'Yeni müşteri', custEmpty: 'Henüz müşteri yok. Fatura kesildiğinde ya da PDF\'den okunduğunda alıcı otomatik eklenir.', custInvoices: 'Faturalar', custInvoice: 'Fatura kes',
      custDel: 'Bu müşteri silinsin mi? (Silinenler kutusundan geri alınabilir)', custDelUsed: 'Bu müşterinin {n} faturası var. Faturalar bozulmaz (müşteri bilgisi faturada kayıtlı). Silinsin mi?',
      custHistory: 'Faturaları', custNoInv: 'Bu müşteriye henüz fatura kesilmedi.',
      prodSearch: 'Ürün adı, stok kodu, depo…', prodNewBtn: 'Yeni ürün', prodHint: 'Faturaya giren her ürün buraya otomatik kaydedilir; aynı ürün stok kodu ya da adıyla tanınır. Stok sayfasındaki ürünlerle aynı listedir.',
      prodEmpty: 'Henüz ürün yok.', prodLast: 'Son satış', prodDel: 'Bu ürün silinsin mi?', prodDelUsed: 'Bu ürün {n} faturada geçiyor. Faturalar bozulmaz. Silinsin mi?',
      prodPrices: 'Fiyat ve satış geçmişi', prodNoHist: 'Henüz fiyat kaydı yok.', prodSource: 'Kaynak', prodManual: 'Elle', prodSold: 'Toplam {q} satıldı · {n} müşteri · {i} fatura satırı', errProdName: 'Ürün adını yazın.',
      sLogo2: 'İkinci logo (marka / mağaza)', sLogo2Hint: 'Faturanın sağ üstünde fatura bilgilerinin yanında görünür (isteğe bağlı).', logo2None: 'İkinci logo yok.',
      sLayout: 'Fatura düzeni', sLayoutHint: 'Alanları açıp kapatın, adlarını değiştirin, sıralayın, yeni alan ekleyin. Ad boşsa faturanın dilindeki standart ad yazılır. 🔒 alanlar zorunludur (yalnız adı değişir).',
      layCols: 'Kalem sütunları', layColsHint: 'KDV sütunu açıksa her satırın KDV oranı ayrı girilir (e-Fatura gibi). Birim sütunu kapalıysa birim miktarın yanına yazılır (5 Adet).',
      layMeta: 'Fatura bilgileri', layCust: 'Müşteri alanları', layCustHint: 'Faturadaki müşteri bloğu ve müşteri kartı bu alanları kullanır.', layProd: 'Ürün kartı alanları',
      layQr: 'Faturaya karekod (QR) bas', layBarcode: 'Faturaya barkod bas (ETTN)', layLocked: 'Zorunlu alan', layCustom: 'özel', layReset: 'Standart düzene dön',
      dVatHint: 'Yeni kalemlerin KDV oranı (ör. 20)'
    },
    en: {
      tabInv: 'Invoices', tabCust: 'Customers', tabProd: 'Products', tplEfatura: 'e-Invoice (GİB layout)', unitPcs: 'pcs', unitHour: 'hours',
      fromPdf: 'Fill from PDF', fromPdfHint: 'Reads a PDF invoice and fills the customer, invoice details, products and prices (AI first, offline when there is no internet)',
      secCustomer: 'Customer', secInfo: 'Invoice details', custLinked: 'Saved customer', custNew: 'New customer — added to the list when saved', custFromOld: 'from an old invoice', custPick: 'Saved customers',
      ettnNew: 'Generate a new ETTN', vatCalc: 'Calculated VAT',
      pdfApplied: 'Filled from the PDF — check and save', pdfNoReader: 'The PDF reader could not be loaded.', pdfReading: 'Reading the PDF…', pdfAi: 'AI is reading…', pdfOffline: 'Reading offline…',
      pdfScanned: 'This PDF is a scanned image and cannot be read offline. Connect to the internet and try with an AI key.', pdfNothing: 'No invoice data found in the PDF.', pdfFail: 'The PDF could not be read.',
      pdfSrcAi: 'Read with AI', pdfSrcOffline: 'Read offline', pdfNoNet: 'no internet', pdfNoKey: 'no AI key (Settings → Assistant)', pdfBadKey: 'invalid AI key',
      pdfWhy_skip: 'no AI key or AI turned off (Settings → Assistant)', pdfWhy_key: 'invalid AI key', pdfWhy_net: 'could not reach the internet', pdfWhy_timeout: 'the AI did not answer in time',
      pdfWhy_quota: 'AI usage quota exhausted', pdfWhy_empty: 'the AI returned an empty result', pdfWhy_fail: 'the AI could not read it', pdfWhy_cancel: 'did not wait for the AI',
      pdfVerify: 'Cross-checking with the offline reading…', pdfSkipAi: 'Read offline without waiting', pdfSec: '{s} s',
      vMatch: 'Verified by the offline reading — figures match exactly', vFixed: '{n} difference(s) found by the offline reading — figures taken from the PDF\'s own text (totals reconcile)',
      vFixedWhole: 'The AI reading was inconsistent ({n} differences) — the offline reading is used (totals reconcile)', vDiff: '{n} difference(s) from the offline reading — check the highlighted lines',
      vNone: 'Offline cross-check not possible (the PDF has no text layer — scanned document)', vShow: 'Show differences', vHide: 'Hide differences', vLine: '{f}: AI {a} · offline {b}',
      vCount: 'Number of lines', vRow: 'line {i} {k}', vk_qty: 'quantity', vk_price: 'unit price', vk_amount: 'amount', vk_vat: 'VAT %', vk_code: 'stock code',
      vt_subtotal: 'Subtotal', vt_discount: 'Total discount', vt_vat: 'Calculated VAT', vt_total: 'Total incl. taxes', vt_payable: 'Amount payable',
      vm_number: 'Invoice no.', vm_date: 'Invoice date', vm_ettn: 'ETTN', vb_tax_no: 'Buyer tax no.', vs_tax_no: 'Seller tax no.',
      useAi: 'Use the AI reading', useOff: 'Use the offline reading', rereadAi: 'Read again with AI',
      impTitle: 'Data read from the PDF', impApply: 'Apply to invoice', impSideBuyer: 'Customer = bill-to (buyer)', impSideSeller: 'Customer = seller',
      impCustFound: 'Saved customer: {n} — missing details are completed', impCustNew: 'Will be saved as a new customer', impNewProduct: 'New product', impMatch: 'Product record',
      impCurUnknown: 'Currency ({c}) is not supported — choose the invoice currency', impMetaHint: 'Ticked details are taken over. The invoice number and ETTN are generated here.',
      impTotals: 'Lines total {a} · subtotal on the PDF {b}',
      custSearch: 'Name, tax ID, phone, city…', custImport: 'Import from old invoices', custImportHint: 'Adds the buyers of old invoices to the customer list (same tax ID / name once)', custImported: '{n} customers added',
      custNewBtn: 'New customer', custEmpty: 'No customers yet. Buyers are added automatically when an invoice is issued or read from a PDF.', custInvoices: 'Invoices', custInvoice: 'New invoice',
      custDel: 'Delete this customer? (Can be restored from Deleted items)', custDelUsed: 'This customer has {n} invoices. The invoices stay intact (the customer details are stored on them). Delete?',
      custHistory: 'Invoices', custNoInv: 'No invoice issued to this customer yet.',
      prodSearch: 'Product name, stock code, warehouse…', prodNewBtn: 'New product', prodHint: 'Every product on an invoice is saved here automatically; the same product is recognised by its stock code or name. It is the same list as the Stock page.',
      prodEmpty: 'No products yet.', prodLast: 'Last sale', prodDel: 'Delete this product?', prodDelUsed: 'This product appears on {n} invoices. The invoices stay intact. Delete?',
      prodPrices: 'Price and sales history', prodNoHist: 'No price records yet.', prodSource: 'Source', prodManual: 'Manual', prodSold: '{q} sold in total · {n} customers · {i} invoice lines', errProdName: 'Enter the product name.',
      sLogo2: 'Second logo (brand / store)', sLogo2Hint: 'Shown at the top right next to the invoice details (optional).', logo2None: 'No second logo.',
      sLayout: 'Invoice layout', sLayoutHint: 'Turn fields on or off, rename, reorder or add new fields. If the name is empty, the standard name in the invoice language is used. 🔒 fields are required (only the name can change).',
      layCols: 'Line columns', layColsHint: 'With the VAT column on, each line has its own VAT rate (as on an e-invoice). With the Unit column off, the unit is written next to the quantity (5 pcs).',
      layMeta: 'Invoice details', layCust: 'Customer fields', layCustHint: 'The customer block on the invoice and the customer card use these fields.', layProd: 'Product card fields',
      layQr: 'Print a QR code on the invoice', layBarcode: 'Print a barcode on the invoice (ETTN)', layLocked: 'Required field', layCustom: 'custom', layReset: 'Back to the standard layout',
      dVatHint: 'VAT rate of new lines (e.g. 20)'
    },
    ar: {
      tabInv: 'الفواتير', tabCust: 'العملاء', tabProd: 'المنتجات', tplEfatura: 'فاتورة إلكترونية (نموذج GİB)', unitPcs: 'قطعة', unitHour: 'ساعة',
      fromPdf: 'التعبئة من PDF', fromPdfHint: 'يقرأ فاتورة PDF ويعبّئ بيانات العميل والفاتورة والمنتجات والأسعار تلقائياً (بالذكاء الاصطناعي أولاً، ودون اتصال عند انقطاع الإنترنت)',
      secCustomer: 'العميل', secInfo: 'بيانات الفاتورة', custLinked: 'عميل مسجَّل', custNew: 'عميل جديد — يُضاف إلى القائمة عند الحفظ', custFromOld: 'من فاتورة سابقة', custPick: 'العملاء المسجَّلون',
      ettnNew: 'توليد رقم ETTN جديد', vatCalc: 'ضريبة القيمة المضافة المحتسبة',
      pdfApplied: 'عُبّئت البيانات من PDF — راجعها ثم احفظ', pdfNoReader: 'تعذّر تحميل قارئ PDF.', pdfReading: 'جارٍ قراءة ملف PDF…', pdfAi: 'الذكاء الاصطناعي يقرأ…', pdfOffline: 'القراءة دون اتصال…',
      pdfScanned: 'هذا الملف صورة ممسوحة ضوئياً ولا يمكن قراءته دون اتصال. اتصل بالإنترنت وحاول بمفتاح الذكاء الاصطناعي.', pdfNothing: 'لم يُعثر على بيانات فاتورة في الملف.', pdfFail: 'تعذّرت قراءة ملف PDF.',
      pdfSrcAi: 'قُرئ بالذكاء الاصطناعي', pdfSrcOffline: 'قُرئ دون اتصال', pdfNoNet: 'لا يوجد إنترنت', pdfNoKey: 'لا يوجد مفتاح ذكاء اصطناعي (الإعدادات ← المساعد)', pdfBadKey: 'مفتاح الذكاء الاصطناعي غير صالح',
      pdfWhy_skip: 'لا يوجد مفتاح ذكاء اصطناعي أو أنه معطّل (الإعدادات ← المساعد)', pdfWhy_key: 'مفتاح الذكاء الاصطناعي غير صالح', pdfWhy_net: 'تعذّر الوصول إلى الإنترنت', pdfWhy_timeout: 'لم يستجب الذكاء الاصطناعي في الوقت المحدد',
      pdfWhy_quota: 'نفدت حصة استخدام الذكاء الاصطناعي', pdfWhy_empty: 'أعاد الذكاء الاصطناعي نتيجة فارغة', pdfWhy_fail: 'تعذّرت القراءة بالذكاء الاصطناعي', pdfWhy_cancel: 'لم يُنتظر الذكاء الاصطناعي',
      pdfVerify: 'جارٍ المطابقة مع القراءة دون اتصال…', pdfSkipAi: 'القراءة دون اتصال دون انتظار', pdfSec: '{s} ث',
      vMatch: 'تم التحقق بالقراءة دون اتصال — الأرقام متطابقة تماماً', vFixed: 'وُجد {n} اختلاف بالقراءة دون اتصال — اعتُمدت الأرقام من نص الملف نفسه (المجاميع متطابقة)',
      vFixedWhole: 'قراءة الذكاء الاصطناعي غير متّسقة ({n} اختلاف) — اعتُمدت القراءة دون اتصال (المجاميع متطابقة)', vDiff: 'يوجد {n} اختلاف عن القراءة دون اتصال — راجع البنود المميَّزة',
      vNone: 'تعذّر التحقق دون اتصال (لا توجد طبقة نصية في الملف — مستند ممسوح ضوئياً)', vShow: 'عرض الاختلافات', vHide: 'إخفاء الاختلافات', vLine: '{f}: الذكاء الاصطناعي {a} · دون اتصال {b}',
      vCount: 'عدد البنود', vRow: 'البند {i} — {k}', vk_qty: 'الكمية', vk_price: 'سعر الوحدة', vk_amount: 'المبلغ', vk_vat: 'نسبة ض.ق.م %', vk_code: 'رمز المخزون',
      vt_subtotal: 'المجموع الفرعي', vt_discount: 'إجمالي الخصم', vt_vat: 'ضريبة القيمة المضافة المحتسبة', vt_total: 'الإجمالي شاملاً الضرائب', vt_payable: 'المبلغ المستحق الدفع',
      vm_number: 'رقم الفاتورة', vm_date: 'تاريخ الفاتورة', vm_ettn: 'ETTN', vb_tax_no: 'الرقم الضريبي للمشتري', vs_tax_no: 'الرقم الضريبي للبائع',
      useAi: 'استخدام قراءة الذكاء الاصطناعي', useOff: 'استخدام القراءة دون اتصال', rereadAi: 'إعادة القراءة بالذكاء الاصطناعي',
      impTitle: 'البيانات المقروءة من PDF', impApply: 'نقل إلى الفاتورة', impSideBuyer: 'العميل = المشتري (السيد/ة)', impSideSeller: 'العميل = البائع',
      impCustFound: 'عميل مسجَّل: {n} — تُستكمل بياناته الناقصة', impCustNew: 'سيُسجَّل عميلاً جديداً', impNewProduct: 'منتج جديد', impMatch: 'سجل المنتج',
      impCurUnknown: 'العملة ({c}) غير مدعومة — اختر عملة الفاتورة', impMetaHint: 'تُنقل البيانات المحددة إلى الفاتورة. يُولَّد رقم الفاتورة ورقم ETTN هنا من جديد.',
      impTotals: 'مجموع البنود {a} · المجموع الفرعي في الملف {b}',
      custSearch: 'الاسم، الرقم الضريبي، الهاتف، المدينة…', custImport: 'استيراد من الفواتير السابقة', custImportHint: 'يضيف مشتري الفواتير السابقة إلى قائمة العملاء (مرة واحدة لكل رقم ضريبي / اسم)', custImported: 'أُضيف {n} عميل',
      custNewBtn: 'عميل جديد', custEmpty: 'لا يوجد عملاء بعد. يُضاف المشتري تلقائياً عند إصدار فاتورة أو قراءتها من PDF.', custInvoices: 'الفواتير', custInvoice: 'إصدار فاتورة',
      custDel: 'حذف هذا العميل؟ (يمكن استعادته من المحذوفات)', custDelUsed: 'لهذا العميل {n} فاتورة. لا تتأثر الفواتير (بيانات العميل محفوظة فيها). هل تريد الحذف؟',
      custHistory: 'فواتيره', custNoInv: 'لم تُصدر لهذا العميل فاتورة بعد.',
      prodSearch: 'اسم المنتج، رمز المخزون، المستودع…', prodNewBtn: 'منتج جديد', prodHint: 'يُسجَّل هنا تلقائياً كل منتج يرد في فاتورة، ويُعرف المنتج نفسه برمز المخزون أو الاسم. وهي القائمة نفسها في صفحة المخزون.',
      prodEmpty: 'لا توجد منتجات بعد.', prodLast: 'آخر بيع', prodDel: 'حذف هذا المنتج؟', prodDelUsed: 'يرد هذا المنتج في {n} فاتورة. لا تتأثر الفواتير. هل تريد الحذف؟',
      prodPrices: 'سجل الأسعار والمبيعات', prodNoHist: 'لا توجد سجلات أسعار بعد.', prodSource: 'المصدر', prodManual: 'يدوي', prodSold: 'المباع إجمالاً {q} · {n} عميل · {i} بند فاتورة', errProdName: 'اكتب اسم المنتج.',
      sLogo2: 'الشعار الثاني (العلامة التجارية / المتجر)', sLogo2Hint: 'يظهر أعلى اليمين بجانب بيانات الفاتورة (اختياري).', logo2None: 'لا يوجد شعار ثانٍ.',
      sLayout: 'تخطيط الفاتورة', sLayoutHint: 'فعّل الحقول أو أوقفها، وغيّر أسماءها وترتيبها، وأضف حقولاً جديدة. إذا تُرك الاسم فارغاً يُكتب الاسم القياسي بلغة الفاتورة. الحقول 🔒 إلزامية (يتغير اسمها فقط).',
      layCols: 'أعمدة البنود', layColsHint: 'عند تفعيل عمود الضريبة تُدخل نسبة الضريبة لكل بند على حدة (كما في الفاتورة الإلكترونية). عند إيقاف عمود الوحدة تُكتب الوحدة بجانب الكمية (5 قطع).',
      layMeta: 'بيانات الفاتورة', layCust: 'حقول العميل', layCustHint: 'تستخدم كتلة العميل في الفاتورة وبطاقة العميل هذه الحقول.', layProd: 'حقول بطاقة المنتج',
      layQr: 'طباعة رمز QR على الفاتورة', layBarcode: 'طباعة باركود على الفاتورة (ETTN)', layLocked: 'حقل إلزامي', layCustom: 'مخصص', layReset: 'العودة إلى التخطيط القياسي',
      dVatHint: 'نسبة الضريبة للبنود الجديدة (مثلاً 20)'
    }
  };
  ['tr', 'en', 'ar'].forEach(function (l) { Object.keys(TX2[l]).forEach(function (k) { TX[l][k] = TX2[l][k]; }); });
  // v1.61: döviz çevirisi + PDF içe aktarmada toplu aktif / pasif
  var TX3 = {
    tr: {
      fxTitle: 'Döviz kuru', fxRefresh: 'Kuru internetten güncelle', fxBusy: 'Kur alınıyor…', fxOnline: 'internet', fxStored: 'son kayıt', fxManual: 'elle girildi',
      fxNone: 'Kayıtlı kur yok', fxMissing: 'Bu para birimi için kur yok — kuru yazın, fiyatlar hemen çevrilir.',
      fxHint: 'Para birimi değişince fiyatlar orijinal fiyattan bu kurla çevrilir. Ürün kayıtlarındaki fiyatlar değişmez.',
      fxDone: '{n} kalem {c} birimine çevrildi',
      fxFromLbl: 'Fiyatlar şu birimde girildiyse:', fxConvertTo: 'Hepsini {c} birimine çevir',
      impSrcCur: 'PDF\'teki fiyatların para birimi', impDstCur: 'Fatura para birimi', impCurHint: 'Farklı seçerseniz bütün fiyatlar aktarılırken güncel kurla çevrilir (orijinal fiyat saklanır).',
      statusField: 'Ödeme durumu damgası', statusOn: 'Durum damgası', statusOff: 'Damgasız', statusFieldHint: 'Yalnız bu fatura için. Damgasızda «Ödendi / Ödenmedi / Kısmi ödeme» yazısı faturada görünmez.',
      statusDefault: 'Yeni faturalarda ödeme durumu damgası (Ödendi / Ödenmedi) görünsün',
      vatField: 'KDV', vatOn: 'KDV\'li', vatOff: 'KDV\'siz', vatFieldHint: 'Yalnız bu fatura için. KDV\'sizde KDV oranı / tutarı sütunları ve toplamdaki KDV satırları faturada hiç görünmez, KDV hesaplanmaz.',
      vatDefault: 'Yeni faturalar KDV\'li olsun (kapalıysa KDV\'siz başlar)',
      codeField: 'Kodlar', codeQr: 'Karekod (QR)', codeBc: 'Barkod', codeFieldHint: 'Yalnız bu fatura için; tıklayarak açıp kapatın. Bütün faturalarda kapatmak için: Fatura ayarları → Fatura düzeni.',
      impAllOff: 'Tümünü pasif yap', impAllOn: 'Tümünü aktif yap', impActive: '{a} / {b} aktif', impOffHint: 'Pasif ürünler faturaya ve ürün kayıtlarına girmez; silinmez, tekrar aktif yapılabilir.'
    },
    en: {
      fxTitle: 'Exchange rate', fxRefresh: 'Update the rate from the internet', fxBusy: 'Fetching the rate…', fxOnline: 'internet', fxStored: 'last saved', fxManual: 'entered manually',
      fxNone: 'No saved rate', fxMissing: 'No rate for this currency — enter it and prices are converted at once.',
      fxHint: 'When the currency changes, prices are converted from their original price at this rate. Saved product prices are not changed.',
      fxDone: '{n} items converted to {c}',
      fxFromLbl: 'If the prices were entered in:', fxConvertTo: 'Convert all to {c}',
      impSrcCur: 'Currency of the prices in the PDF', impDstCur: 'Invoice currency', impCurHint: 'If different, all prices are converted at the current rate while importing (the original price is kept).',
      statusField: 'Payment status stamp', statusOn: 'Status stamp', statusOff: 'No stamp', statusFieldHint: 'For this invoice only. Without the stamp, «Paid / Unpaid / Partly paid» is not shown on the invoice.',
      statusDefault: 'Show the payment status stamp (Paid / Unpaid) on new invoices',
      vatField: 'VAT', vatOn: 'With VAT', vatOff: 'No VAT', vatFieldHint: 'For this invoice only. Without VAT, the VAT rate / amount columns and the VAT lines in the totals are not shown at all and no VAT is calculated.',
      vatDefault: 'New invoices include VAT (when off they start without VAT)',
      codeField: 'Codes', codeQr: 'QR code', codeBc: 'Barcode', codeFieldHint: 'For this invoice only; click to turn on or off. To turn them off on all invoices: Invoice settings → Invoice layout.',
      impAllOff: 'Deactivate all', impAllOn: 'Activate all', impActive: '{a} / {b} active', impOffHint: 'Inactive items are left out of the invoice and the product records; they are not deleted and can be activated again.'
    },
    ar: {
      fxTitle: 'سعر الصرف', fxRefresh: 'تحديث السعر من الإنترنت', fxBusy: 'جارٍ جلب السعر…', fxOnline: 'الإنترنت', fxStored: 'آخر سعر محفوظ', fxManual: 'أُدخل يدوياً',
      fxNone: 'لا يوجد سعر محفوظ', fxMissing: 'لا يوجد سعر لهذه العملة — أدخل السعر لتُحوَّل الأسعار فوراً.',
      fxHint: 'عند تغيير العملة تُحوَّل الأسعار من سعرها الأصلي بهذا السعر. أسعار المنتجات المحفوظة لا تتغير.',
      fxDone: 'تم تحويل {n} بند إلى {c}',
      fxFromLbl: 'إذا أُدخلت الأسعار بعملة:', fxConvertTo: 'تحويل الكل إلى {c}',
      impSrcCur: 'عملة الأسعار في ملف PDF', impDstCur: 'عملة الفاتورة', impCurHint: 'عند اختيار عملة مختلفة تُحوَّل جميع الأسعار بسعر الصرف الحالي أثناء الاستيراد (يُحفظ السعر الأصلي).',
      statusField: 'ختم حالة الدفع', statusOn: 'ختم الحالة', statusOff: 'بدون ختم', statusFieldHint: 'لهذه الفاتورة فقط. بدون الختم لا تظهر عبارة «مدفوعة / غير مدفوعة / مدفوعة جزئياً» على الفاتورة.',
      statusDefault: 'إظهار ختم حالة الدفع (مدفوعة / غير مدفوعة) في الفواتير الجديدة',
      vatField: 'ضريبة القيمة المضافة', vatOn: 'مع الضريبة', vatOff: 'بدون ضريبة', vatFieldHint: 'لهذه الفاتورة فقط. بدون الضريبة لا تظهر أعمدة نسبة الضريبة ومبلغها ولا أسطر الضريبة في الإجمالي، ولا تُحتسب الضريبة.',
      vatDefault: 'الفواتير الجديدة تتضمن ضريبة القيمة المضافة (عند الإيقاف تبدأ بدون ضريبة)',
      codeField: 'الرموز', codeQr: 'رمز QR', codeBc: 'الباركود', codeFieldHint: 'لهذه الفاتورة فقط؛ انقر للتشغيل أو الإيقاف. لإيقافها في جميع الفواتير: إعدادات الفاتورة ← تخطيط الفاتورة.',
      impAllOff: 'إلغاء تفعيل الكل', impAllOn: 'تفعيل الكل', impActive: '{a} / {b} مفعّل', impOffHint: 'البنود غير المفعّلة لا تدخل الفاتورة ولا سجلات المنتجات؛ لا تُحذف ويمكن تفعيلها مجدداً.'
    }
  };
  ['tr', 'en', 'ar'].forEach(function (l) { Object.keys(TX3[l]).forEach(function (k) { TX[l][k] = TX3[l][k]; }); });
  // v1.62: kâr ekleme (toplu / tekli)
  var TX4 = {
    tr: {
      mkTitle: 'Kâr ekle', mkRate: 'Kâr oranı (%)', mkAll: 'Tüm kalemlere uygula', mkClear: 'Kârı kaldır', mkClearAll: 'Tüm kârları kaldır',
      mkHint: 'Kâr her zaman kalemin ilk (kârsız) fiyatı üzerinden hesaplanır; tekrar uygulanınca üst üste binmez. Tek bir kalem için fiyatın yanındaki ％ düğmesini kullanın. Fiyatı elle değiştirirseniz o kalemin kârı sıfırlanır. Ürün kayıtlarındaki fiyatlar değişmez.',
      mkSum: '{n} kalemde kâr var · Eklenen kâr: {a}', mkNone: 'Henüz kâr eklenmedi', mkDone: '{n} kaleme %{r} kâr eklendi', mkRemoved: 'Kâr kaldırıldı, ilk fiyatlar geri geldi',
      mkLine: 'Bu kaleme kâr ekle', mkApply: 'Uygula', mkBase: 'Kârsız fiyat', mkTot: 'Dahil kâr', mkBad: 'Geçerli bir kâr oranı yazın (ör. 15)', mkEmpty: 'Fiyatı olan kalem yok'
    },
    en: {
      mkTitle: 'Add profit', mkRate: 'Profit rate (%)', mkAll: 'Apply to all lines', mkClear: 'Remove profit', mkClearAll: 'Remove all profit',
      mkHint: 'Profit is always calculated on the line\'s original (no-profit) price, so applying it again does not stack. For a single line use the ％ button next to its price. If you edit a price by hand, that line\'s profit is reset. Saved product prices are not changed.',
      mkSum: '{n} lines with profit · Profit added: {a}', mkNone: 'No profit added yet', mkDone: '{r}% profit added to {n} lines', mkRemoved: 'Profit removed, original prices restored',
      mkLine: 'Add profit to this line', mkApply: 'Apply', mkBase: 'Price without profit', mkTot: 'Profit included', mkBad: 'Enter a valid profit rate (e.g. 15)', mkEmpty: 'No lines with a price'
    },
    ar: {
      mkTitle: 'إضافة هامش ربح', mkRate: 'نسبة الربح (%)', mkAll: 'تطبيق على جميع البنود', mkClear: 'إزالة الربح', mkClearAll: 'إزالة كل الأرباح',
      mkHint: 'يُحسب الربح دائماً على السعر الأصلي للبند (دون ربح)، فلا يتراكم عند إعادة تطبيقه. لبند واحد استخدم زر ％ بجانب سعره. إذا عدّلت السعر يدوياً يُلغى ربح ذلك البند. أسعار المنتجات المحفوظة لا تتغير.',
      mkSum: '{n} بنود بها ربح · الربح المضاف: {a}', mkNone: 'لم يُضف أي ربح بعد', mkDone: 'أُضيف ربح بنسبة {r}% إلى {n} بنود', mkRemoved: 'أُزيل الربح وعادت الأسعار الأصلية',
      mkLine: 'إضافة ربح لهذا البند', mkApply: 'تطبيق', mkBase: 'السعر دون ربح', mkTot: 'الربح المتضمَّن', mkBad: 'أدخل نسبة ربح صحيحة (مثلاً 15)', mkEmpty: 'لا توجد بنود لها سعر'
    }
  };
  ['tr', 'en', 'ar'].forEach(function (l) { Object.keys(TX4[l]).forEach(function (k) { TX[l][k] = TX4[l][k]; }); });
  // v1.63: çıktı akışı (dil → önizle / düzelt → PDF) ve ürün adı çevirisi
  var TX5 = {
    tr: {
      pvStepLang: 'Çıktı dili', pvStepNames: 'Ürün adları', pvStepEdit: 'Önizle ve düzelt', pvNamesKeep: 'Olduğu gibi bırak', pvNamesTr: 'Seçilen dile çevir',
      pvNamesBusy: 'Ürün adları çevriliyor…', pvNamesAi: 'Yapay zekâ ile çevrildi', pvNamesOffline: 'İnternet / yapay zekâ yok: çevrimdışı teknik sözlükle çevrildi, gerekirse düzeltin',
      pvNamesSame: 'Ürün adları zaten Türkçe', pvEditOn: 'Düzelt', pvEditOff: 'Düzeltmeyi bitir',
      pvEditHint: 'Önizlemedeki herhangi bir yazıya tıklayıp düzeltebilirsiniz; düzeltmeler PDF\'e aynen girer. Dil ya da şablon değişirse düzeltmeler sıfırlanır.',
      pvEditLost: 'Dil / şablon değişti, önizlemedeki düzeltmeler sıfırlandı', pvPdf: 'PDF olarak kaydet'
    },
    en: {
      pvStepLang: 'Output language', pvStepNames: 'Product names', pvStepEdit: 'Preview and correct', pvNamesKeep: 'Keep as they are', pvNamesTr: 'Translate to the selected language',
      pvNamesBusy: 'Translating product names…', pvNamesAi: 'Translated with AI', pvNamesOffline: 'No internet / AI: translated with the offline technical glossary, correct if needed',
      pvNamesSame: 'Product names are already in Turkish', pvEditOn: 'Correct', pvEditOff: 'Finish correcting',
      pvEditHint: 'Click any text in the preview to correct it; corrections go into the PDF exactly as shown. Changing the language or template resets them.',
      pvEditLost: 'Language / template changed, corrections in the preview were reset', pvPdf: 'Save as PDF'
    },
    ar: {
      pvStepLang: 'لغة المستند', pvStepNames: 'أسماء المنتجات', pvStepEdit: 'المعاينة والتصحيح', pvNamesKeep: 'إبقاؤها كما هي', pvNamesTr: 'ترجمتها إلى اللغة المختارة',
      pvNamesBusy: 'جارٍ ترجمة أسماء المنتجات…', pvNamesAi: 'تُرجمت بالذكاء الاصطناعي', pvNamesOffline: 'لا يوجد إنترنت / ذكاء اصطناعي: تُرجمت بالمعجم التقني دون اتصال، صحّحها عند الحاجة',
      pvNamesSame: 'أسماء المنتجات باللغة التركية أصلاً', pvEditOn: 'تصحيح', pvEditOff: 'إنهاء التصحيح',
      pvEditHint: 'انقر على أي نص في المعاينة لتصحيحه؛ تدخل التصحيحات إلى ملف PDF كما هي. تغيير اللغة أو القالب يلغي التصحيحات.',
      pvEditLost: 'تغيّرت اللغة / القالب، فأُلغيت التصحيحات في المعاينة', pvPdf: 'حفظ بصيغة PDF'
    }
  };
  ['tr', 'en', 'ar'].forEach(function (l) { Object.keys(TX5[l]).forEach(function (k) { TX[l][k] = TX5[l][k]; }); });
  // Faturanın kendi dilindeki resmi metinler (PDF)
  var DOC = {
    tr: { title: 'FATURA', no: 'Fatura No', date: 'Fatura Tarihi', due: 'Vade Tarihi', billTo: 'Sayın', desc: 'Açıklama', qty: 'Miktar', unit: 'Birim',
      price: 'Birim Fiyat', amount: 'Tutar', subtotal: 'Ara Toplam', discount: 'İndirim', tax: 'Vergi', grand: 'Genel Toplam', paid: 'Ödenen',
      remaining: 'Kalan', sign: 'Yetkili İmza', stamp: 'Kaşe / Mühür', note: 'Not', bank: 'Ödeme Bilgisi', currency: 'Para Birimi',
      st_paid: 'ÖDENDİ', st_partial: 'KISMİ ÖDEME', st_pending: 'ÖDENMEDİ', st_cancelled: 'İPTAL', taxNo: 'Vergi No', taxOffice: 'Vergi Dairesi', mersis: 'MERSİS / Sicil No', seller: 'Satıcı', contactH: 'İletişim', legalH: 'Vergi ve Sicil', bankH: 'Banka Bilgileri', ff: { name: 'Ünvan', address: 'Adres', phone: 'Tel', fax: 'Faks', email: 'E-posta', web: 'Web', tax_office: 'Vergi Dairesi', tax: 'Vergi No', mersis: 'MERSİS No', trade_reg: 'Ticaret Sicil No', bank_name: 'Banka', iban: 'IBAN' }, tel: 'Tel', mail: 'E-posta', web: 'Web', thanks: 'Bizi tercih ettiğiniz için teşekkür ederiz.', page: 'Sayfa' },
    en: { title: 'INVOICE', no: 'Invoice No', date: 'Invoice Date', due: 'Due Date', billTo: 'Bill To', desc: 'Description', qty: 'Qty', unit: 'Unit',
      price: 'Unit Price', amount: 'Amount', subtotal: 'Subtotal', discount: 'Discount', tax: 'Tax', grand: 'Grand Total', paid: 'Paid',
      remaining: 'Balance Due', sign: 'Authorized Signature', stamp: 'Company Stamp', note: 'Note', bank: 'Payment Details', currency: 'Currency',
      st_paid: 'PAID', st_partial: 'PARTLY PAID', st_pending: 'UNPAID', st_cancelled: 'CANCELLED', taxNo: 'Tax No', taxOffice: 'Tax Office', mersis: 'Trade Reg. No', seller: 'Seller', contactH: 'Contact', legalH: 'Tax & Registry', bankH: 'Bank Details', ff: { name: 'Company', address: 'Address', phone: 'Tel', fax: 'Fax', email: 'E-mail', web: 'Web', tax_office: 'Tax Office', tax: 'Tax No', mersis: 'MERSIS No', trade_reg: 'Trade Reg. No', bank_name: 'Bank', iban: 'IBAN' }, tel: 'Tel', mail: 'E-mail', web: 'Web', thanks: 'Thank you for your business.', page: 'Page' },
    ar: { title: 'فاتورة', no: 'رقم الفاتورة', date: 'تاريخ الفاتورة', due: 'تاريخ الاستحقاق', billTo: 'فاتورة إلى', desc: 'البيان', qty: 'الكمية', unit: 'الوحدة',
      price: 'سعر الوحدة', amount: 'المبلغ', subtotal: 'المجموع الفرعي', discount: 'الخصم', tax: 'الضريبة', grand: 'الإجمالي', paid: 'المدفوع',
      remaining: 'المبلغ المستحق', sign: 'التوقيع المعتمد', stamp: 'الختم', note: 'ملاحظة', bank: 'بيانات الدفع', currency: 'العملة',
      st_paid: 'مدفوعة', st_partial: 'مدفوعة جزئياً', st_pending: 'غير مدفوعة', st_cancelled: 'ملغاة', taxNo: 'الرقم الضريبي', taxOffice: 'دائرة الضرائب', mersis: 'رقم السجل التجاري', seller: 'البائع', contactH: 'الاتصال', legalH: 'الضريبة والسجل', bankH: 'البيانات المصرفية', ff: { name: 'الاسم التجاري', address: 'العنوان', phone: 'هاتف', fax: 'فاكس', email: 'البريد الإلكتروني', web: 'الموقع', tax_office: 'دائرة الضرائب', tax: 'الرقم الضريبي', mersis: 'رقم MERSIS', trade_reg: 'رقم السجل التجاري', bank_name: 'البنك', iban: 'IBAN' }, tel: 'هاتف', mail: 'البريد الإلكتروني', web: 'الموقع', thanks: 'شكراً لتعاملكم معنا.', page: 'صفحة' }
  };
  DOC.tr.fxRate = 'Döviz Kuru'; DOC.en.fxRate = 'Exchange Rate'; DOC.ar.fxRate = 'سعر الصرف';
  var ERR = {
    tr: { ERR_INVOICE_ITEMS: 'En az bir kalem girin.', ERR_CUSTOMER_REQUIRED: 'Müşteri adını yazın.', ERR_INVOICE_OVERPAY: 'Tahsilat kalan tutardan büyük olamaz.',
      ERR_INVOICE_NUMBER_TAKEN: 'Bu fatura numarası zaten kullanılıyor.', ERR_INVOICE_HAS_PAYMENTS: 'Tahsilatı olan faturada bu yapılamaz — önce tahsilatları silin.',
      ERR_INVOICE_BELOW_PAID: 'Yeni toplam, tahsil edilen tutardan küçük olamaz.', ERR_INVOICE_CANCELLED: 'İptal edilmiş faturaya tahsilat girilemez.' },
    en: { ERR_INVOICE_ITEMS: 'Enter at least one line.', ERR_CUSTOMER_REQUIRED: 'Enter the customer name.', ERR_INVOICE_OVERPAY: 'The payment cannot exceed the balance.',
      ERR_INVOICE_NUMBER_TAKEN: 'This invoice number is already in use.', ERR_INVOICE_HAS_PAYMENTS: 'Not possible on an invoice with payments — delete the payments first.',
      ERR_INVOICE_BELOW_PAID: 'The new total cannot be lower than the amount collected.', ERR_INVOICE_CANCELLED: 'A cancelled invoice cannot take payments.' },
    ar: { ERR_INVOICE_ITEMS: 'أدخل بنداً واحداً على الأقل.', ERR_CUSTOMER_REQUIRED: 'اكتب اسم العميل.', ERR_INVOICE_OVERPAY: 'لا يمكن أن يتجاوز التحصيل المبلغ المتبقي.',
      ERR_INVOICE_NUMBER_TAKEN: 'رقم الفاتورة هذا مستخدم من قبل.', ERR_INVOICE_HAS_PAYMENTS: 'غير ممكن في فاتورة لها تحصيلات — احذف التحصيلات أولاً.',
      ERR_INVOICE_BELOW_PAID: 'لا يمكن أن يكون الإجمالي الجديد أقل من المبلغ المحصّل.', ERR_INVOICE_CANCELLED: 'لا يمكن تسجيل تحصيل لفاتورة ملغاة.' }
  };

  // ---------- v1.60: modüler fatura düzeni ----------
  // Kalem sütunları (cols), fatura bilgileri (meta), müşteri alanları (cust: fatura + müşteri kartı), ürün kartı alanları (prod).
  // Ayar `invoice_layout` = { cols: [{k, label, on, del, custom}], meta: […], cust: […], prod: […], qr, barcode }.
  // Standart alan: adı değiştirilebilir, kapatılabilir / çıkarılabilir (lock = zorunlu, yalnız adı değişir). Özel alan: eklenir, silinir.
  var LAY_STD = {
    cols: [['no', 1], ['depot', 1], ['code', 1], ['name', 1, 1], ['qty', 1, 1], ['unit', 0], ['price', 1, 1], ['amount', 1], ['vat', 1], ['vat_amount', 1]],
    meta: [['date', 1, 1], ['number', 1, 1], ['due_date', 1], ['customization', 1], ['scenario', 1], ['inv_type', 1], ['issue_time', 1], ['ettn', 1], ['order_no', 0], ['waybill_no', 0], ['campaign', 1], ['cargo', 1]],
    cust: [['tax_office', 1], ['tax_no', 1], ['address', 1], ['district', 1], ['city', 1], ['postal_code', 0], ['country', 0], ['phone', 1], ['email', 1], ['web', 0]],
    prod: [['code', 1], ['unit', 1], ['price', 1], ['vat', 1], ['depot', 1], ['description', 1]]
  };
  var LBL = {
    tr: {
      cols: { no: 'Sıra No', depot: 'Depo', code: 'Stok Kodu', name: 'Mal Hizmet', qty: 'Miktar', unit: 'Birim', price: 'Birim Fiyat', amount: 'Mal Hizmet Tutarı', vat: 'KDV Oranı', vat_amount: 'KDV Tutarı' },
      meta: { date: 'Tarih', number: 'Fatura No', due_date: 'Vade Tarihi', customization: 'Özelleştirme No', scenario: 'Senaryo', inv_type: 'Fatura Tipi', issue_time: 'Oluşma Zamanı', ettn: 'ETTN', order_no: 'Sipariş No', waybill_no: 'İrsaliye No', campaign: 'Kampanya Kodu', cargo: 'Kargo Firması' },
      cust: { tax_office: 'Vergi Dairesi', tax_no: 'VKN / TCKN', address: 'Adres', district: 'İlçe', city: 'İl', postal_code: 'Posta Kodu', country: 'Ülke', phone: 'Tel', email: 'e-Posta', web: 'Web Sitesi' },
      prod: { code: 'Stok Kodu', unit: 'Birim', price: 'Satış Fiyatı', vat: 'KDV Oranı (%)', depot: 'Depo', description: 'Açıklama' },
      gib: { subtotal: 'Mal Hizmet Toplam Tutarı', discount: 'Toplam İskonto', vat: 'Hesaplanan KDV', total: 'Vergiler Dahil Toplam Tutar', payable: 'Ödenecek Tutar', efatura: 'e-Fatura', earsiv: 'e-Arşiv Fatura' }
    },
    en: {
      cols: { no: 'No', depot: 'Warehouse', code: 'Stock Code', name: 'Goods / Services', qty: 'Quantity', unit: 'Unit', price: 'Unit Price', amount: 'Amount', vat: 'VAT Rate', vat_amount: 'VAT Amount' },
      meta: { date: 'Date', number: 'Invoice No', due_date: 'Due Date', customization: 'Customization ID', scenario: 'Scenario', inv_type: 'Invoice Type', issue_time: 'Issue Time', ettn: 'ETTN (UUID)', order_no: 'Order No', waybill_no: 'Waybill No', campaign: 'Campaign Code', cargo: 'Carrier' },
      cust: { tax_office: 'Tax Office', tax_no: 'Tax ID', address: 'Address', district: 'District', city: 'City', postal_code: 'Postal Code', country: 'Country', phone: 'Tel', email: 'E-mail', web: 'Website' },
      prod: { code: 'Stock Code', unit: 'Unit', price: 'Sale Price', vat: 'VAT Rate (%)', depot: 'Warehouse', description: 'Description' },
      gib: { subtotal: 'Goods / Services Total', discount: 'Total Discount', vat: 'Calculated VAT', total: 'Total Including Taxes', payable: 'Amount Payable', efatura: 'e-Invoice', earsiv: 'e-Archive Invoice' }
    },
    ar: {
      cols: { no: 'الرقم', depot: 'المستودع', code: 'رمز المخزون', name: 'السلع / الخدمات', qty: 'الكمية', unit: 'الوحدة', price: 'سعر الوحدة', amount: 'المبلغ', vat: 'نسبة الضريبة', vat_amount: 'قيمة الضريبة' },
      meta: { date: 'التاريخ', number: 'رقم الفاتورة', due_date: 'تاريخ الاستحقاق', customization: 'رقم التخصيص', scenario: 'السيناريو', inv_type: 'نوع الفاتورة', issue_time: 'وقت الإنشاء', ettn: 'الرقم الموحد (ETTN)', order_no: 'رقم الطلب', waybill_no: 'رقم إذن التسليم', campaign: 'رمز الحملة', cargo: 'شركة الشحن' },
      cust: { tax_office: 'دائرة الضرائب', tax_no: 'الرقم الضريبي', address: 'العنوان', district: 'المنطقة', city: 'المدينة', postal_code: 'الرمز البريدي', country: 'البلد', phone: 'الهاتف', email: 'البريد الإلكتروني', web: 'الموقع الإلكتروني' },
      prod: { code: 'رمز المخزون', unit: 'الوحدة', price: 'سعر البيع', vat: 'نسبة الضريبة (%)', depot: 'المستودع', description: 'الوصف' },
      gib: { subtotal: 'إجمالي السلع والخدمات', discount: 'إجمالي الخصم', vat: 'ضريبة القيمة المضافة المحتسبة', total: 'الإجمالي شاملاً الضرائب', payable: 'المبلغ المستحق الدفع', efatura: 'فاتورة إلكترونية', earsiv: 'فاتورة أرشيف إلكترونية' }
    }
  };
  function layStd(kind) { return LAY_STD[kind].map(function (x) { return { k: x[0], label: '', on: !!x[1], lock: !!x[2] }; }); }
  function layOf(cfg, kind) {
    var saved = cfg && cfg.layout && Array.isArray(cfg.layout[kind]) ? cfg.layout[kind] : null;
    if (!saved) return layStd(kind);
    var std = layStd(kind), out = [];
    saved.forEach(function (f) {
      if (!f || !f.k || out.some(function (x) { return x.k === f.k; })) return;
      var s = std.filter(function (x) { return x.k === f.k; })[0];
      if (s) out.push({ k: f.k, label: String(f.label || ''), on: s.lock ? true : f.on !== false, lock: s.lock, del: s.lock ? false : !!f.del });
      else if (f.custom) out.push({ k: f.k, label: String(f.label || ''), on: f.on !== false, custom: true });
    });
    std.forEach(function (s) { if (!out.some(function (x) { return x.k === s.k; })) out.push(s); }); // sonradan eklenen standart alanlar
    return out;
  }
  function layOn(cfg, kind) { return layOf(cfg, kind).filter(function (f) { return f.on && !f.del; }); }
  function layHas(cfg, kind, k) { return layOn(cfg, kind).some(function (f) { return f.k === k; }); }
  // Alanın adı: kullanıcı adı yazdıysa o, yoksa verilen dildeki standart ad
  function fLabel(kind, f, lg) { var L = LBL[lg] || LBL.tr; return String(f.label || '').trim() || (L[kind] && L[kind][f.k]) || (LBL.tr[kind] && LBL.tr[kind][f.k]) || f.k; }
  function perLineVat(cfg) { return layHas(cfg, 'cols', 'vat') || layHas(cfg, 'cols', 'vat_amount'); }
  function uuid() {
    var b = new Uint8Array(16);
    try { crypto.getRandomValues(b); } catch (e) { for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); }
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('').toUpperCase();
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function nowTime() { var d = new Date(); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2); }
  // Satır bazında KDV (e-Fatura gibi): her satırın vergisi ayrı yuvarlanır, indirim satırlara oranla dağılır (services.js ile aynı)
  function calcTotals(items, discount, taxRate, cur, perLine) {
    var sub = rnd(items.reduce(function (a, it) { return a + rnd(num(it.qty) * num(it.price), cur); }, 0), cur);
    var disc = Math.min(sub, rnd(num(discount), cur)), k = sub > 0 ? (sub - disc) / sub : 0, byRate = {}, tax = 0;
    if (perLine) {
      items.forEach(function (it) { var v = num(it.vat), lt = rnd(num(it.qty) * num(it.price) * k * v / 100, cur); tax += lt; var key = String(v); byRate[key] = byRate[key] || { rate: v, base: 0, tax: 0 }; byRate[key].base += rnd(num(it.qty) * num(it.price) * k, cur); byRate[key].tax += lt; });
      tax = rnd(tax, cur);
    } else {
      tax = rnd((sub - disc) * num(taxRate) / 100, cur);
      if (num(taxRate)) byRate[String(num(taxRate))] = { rate: num(taxRate), base: sub - disc, tax: tax };
    }
    return { subtotal: sub, discount: disc, tax: tax, total: rnd(sub - disc + tax, cur), byRate: byRate };
  }

  // ---------- QR kod ve barkod (PDF'e gömülür) ----------
  function qrSvg(text, color) {
    try {
      if (typeof window.qrcode !== 'function') return '';
      var q = window.qrcode(0, 'M'); q.addData(String(text)); q.make();
      var n = q.getModuleCount(), d = '';
      for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + c + ' ' + r + 'h1v1h-1z';
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ' + (n + 4) + ' ' + (n + 4) + '" shape-rendering="crispEdges"><rect x="-2" y="-2" width="' + (n + 4) + '" height="' + (n + 4) + '" fill="#fff"/><path d="' + d + '" fill="' + (color || '#000') + '"/></svg>';
    } catch (e) { return ''; }
  }
  // Code 128-B (desen tablosu: JsBarcode, MIT)
  var C128 = [11011001100, 11001101100, 11001100110, 10010011000, 10010001100, 10001001100, 10011001000, 10011000100, 10001100100, 11001001000, 11001000100, 11000100100, 10110011100, 10011011100, 10011001110, 10111001100, 10011101100, 10011100110, 11001110010, 11001011100, 11001001110, 11011100100, 11001110100, 11101101110, 11101001100, 11100101100, 11100100110, 11101100100, 11100110100, 11100110010, 11011011000, 11011000110, 11000110110, 10100011000, 10001011000, 10001000110, 10110001000, 10001101000, 10001100010, 11010001000, 11000101000, 11000100010, 10110111000, 10110001110, 10001101110, 10111011000, 10111000110, 10001110110, 11101110110, 11010001110, 11000101110, 11011101000, 11011100010, 11011101110, 11101011000, 11101000110, 11100010110, 11101101000, 11101100010, 11100011010, 11101111010, 11001000010, 11110001010, 10100110000, 10100001100, 10010110000, 10010000110, 10000101100, 10000100110, 10110010000, 10110000100, 10011010000, 10011000010, 10000110100, 10000110010, 11000010010, 11001010000, 11110111010, 11000010100, 10001111010, 10100111100, 10010111100, 10010011110, 10111100100, 10011110100, 10011110010, 11110100100, 11110010100, 11110010010, 11011011110, 11011110110, 11110110110, 10101111000, 10100011110, 10001011110, 10111101000, 10111100010, 11110101000, 11110100010, 10111011110, 10111101110, 11101011110, 11110101110, 11010000100, 11010010000, 11010011100, 1100011101011];
  function barcodeSvg(text, color) {
    var s = String(text || '').replace(/[^\x20-\x7e]/g, '');
    if (!s) return '';
    var codes = [104], sum = 104;
    for (var i = 0; i < s.length; i++) { var v = s.charCodeAt(i) - 32; codes.push(v); sum += v * (i + 1); }
    codes.push(sum % 103); codes.push(106);
    var bits = codes.map(function (c) { return String(C128[c]); }).join(''), d = '', x = 10;
    for (var j = 0; j < bits.length; j++) { if (bits[j] === '1') d += 'M' + (x + j) + ' 0h1v40h-1z'; }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (bits.length + 20) + ' 40" preserveAspectRatio="none" shape-rendering="crispEdges"><path d="' + d + '" fill="' + (color || '#000') + '"/></svg>';
  }
  // GİB karekodundaki gibi JSON: satıcı / alıcı VKN, senaryo, tip, tarih, no, ETTN, para birimi, toplamlar
  function qrPayload(inv, cfg, tt) {
    var m = jparse(inv.meta, {}) || {};
    var o = { vkntckn: (cfg.company || {}).tax || '', avkntckn: inv.customer_tax || '', senaryo: m.scenario || '', tip: m.inv_type || '', tarih: inv.date, no: inv.number, ettn: m.ettn || '',
      parabirimi: inv.currency_code === 'TRY' ? 'TRY' : inv.currency_code, malhizmettoplam: String(tt.subtotal) };
    Object.keys(tt.byRate).forEach(function (r) { o['kdvmatrah(' + r + ')'] = String(rnd(tt.byRate[r].base, inv.currency_code)); o['hesaplanankdv(' + r + ')'] = String(rnd(tt.byRate[r].tax, inv.currency_code)); });
    o.vergidahil = String(tt.total); o.odenecek = String(rnd(tt.total - (inv.paid || 0), inv.currency_code));
    return JSON.stringify(o);
  }

  function lang() { var l = (document.documentElement.lang || 'tr').slice(0, 2); return TX[l] ? l : 'tr'; }
  function t(k, v) { var s = (TX[lang()][k] || TX.tr[k] || k); if (v) for (var x in v) s = s.split('{' + x + '}').join(v[x]); return s; }
  function low(s) { return String(s == null ? '' : s).toLocaleLowerCase('tr'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function today() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); }
  function num(v) { var n = Number(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : 0; }
  function rnd(n, cur) { var p = Math.pow(10, DEC[cur] == null ? 2 : DEC[cur]); return Math.round(n * p) / p; }
  function fmt(n, cur, lg) {
    var d = DEC[cur] == null ? 2 : DEC[cur];
    var loc = (lg || lang()) === 'ar' ? 'ar-SY-u-nu-latn' : (lg || lang()) === 'en' ? 'en-US' : 'tr-TR';
    try { return new Intl.NumberFormat(loc, { minimumFractionDigits: d, maximumFractionDigits: d }).format(n || 0); } catch (e) { return (n || 0).toFixed(d); }
  }
  function money(n, cur, lg) { return fmt(n, cur, lg) + ' ' + (SYM[cur] || cur); }
  function dmy(s) { if (!s) return ''; var p = String(s).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : s; }

  // ---------- veri ----------
  var F = function () { return window.falcon; };
  function q(sql, p) { return F().db.all(sql, p || []); }
  function sget(k) { return F().settings.get(k).then(function (v) { return v == null ? '' : String(v); }).catch(function () { return ''; }); }
  function sset(k, v) { return F().settings.set(k, v == null ? '' : String(v)); }
  function jparse(s, d) { try { var o = JSON.parse(s); return o && typeof o === 'object' ? o : d; } catch (e) { return d; } }

  var CFG = null;
  function loadCfg() {
    return Promise.all(['invoice_company', 'invoice_defaults', 'invoice_prefix', 'invoice_signature', 'invoice_stamp', 'invoice_logo', 'invoice_layout', 'invoice_logo2'].map(sget)).then(function (r) {
      CFG = {
        company: jparse(r[0], {}), defaults: jparse(r[1], {}), prefix: r[2] || 'FAL',
        signature: r[3] || '', stamp: r[4] || '', logo: r[5] || 'falcon', layout: jparse(r[6], {}), logo2: r[7] || ''
      };
      if (!CFG.company.name) CFG.company.name = 'Falcon System';
      return CFG;
    });
  }

  // ---------- logolar / örnek imza ----------
  var EAGLE = 'M251.05 92.0967C250.533 92.7811 249.926 93.5547 249.222 94.3965C246.431 97.7327 242.143 102.152 236.17 106.463C224.232 115.079 205.538 123.285 178.526 121.544L178.253 122.835L178.255 122.836C178.256 122.836 178.257 122.836 178.259 122.837C178.263 122.838 178.268 122.84 178.275 122.843C178.29 122.848 178.311 122.856 178.339 122.866C178.394 122.886 178.475 122.914 178.581 122.951C178.794 123.025 179.107 123.132 179.513 123.264C180.324 123.527 181.504 123.891 182.987 124.296C185.953 125.106 190.136 126.08 195.007 126.742C203.996 127.964 215.395 128.127 225.827 124.163C225.383 124.646 224.854 125.198 224.236 125.799C221.988 127.986 218.587 130.829 213.987 133.44C204.798 138.657 190.796 142.965 171.579 139.221L171.251 140.511L171.452 139.875L171.252 140.511L171.253 140.512C171.254 140.512 171.255 140.512 171.257 140.513C171.26 140.514 171.266 140.516 171.272 140.518C171.286 140.522 171.305 140.527 171.33 140.535C171.381 140.551 171.456 140.574 171.555 140.604C171.751 140.663 172.041 140.749 172.413 140.855C173.158 141.069 174.238 141.366 175.577 141.702C178.255 142.374 181.977 143.205 186.155 143.834C193.377 144.921 202.077 145.426 209.094 143.395C208.962 143.501 208.826 143.614 208.682 143.727C206.789 145.202 203.826 147.129 199.574 148.898C191.076 152.435 177.398 155.355 156.789 152.734C139.171 150.492 124.902 150.202 115.363 154.311C110.561 156.379 106.94 159.568 104.709 164.174C102.811 168.092 101.942 172.991 102.152 179.02C97.4753 168.611 100.111 157.963 104.968 149.688C107.613 145.181 110.901 141.41 113.974 138.812C115.51 137.513 116.98 136.518 118.276 135.87C119.507 135.255 120.519 134.983 121.259 135.003L121.403 135.011C124.668 135.285 126.988 136.6 128.394 138.065C129.099 138.801 129.567 139.567 129.816 140.252C130.07 140.949 130.077 141.504 129.953 141.86L129.506 143.139L130.791 142.714C132.058 142.295 132.95 141.573 133.523 140.591C134.085 139.629 134.31 138.47 134.356 137.22C134.448 134.753 133.843 131.62 133.4 128.39C132.96 125.169 131.437 122.935 129.835 120.9C128.337 118.997 126.821 117.313 125.837 115.103C136.082 109.714 150.197 105.732 169.452 106.085C206.128 106.757 232.573 104.865 251.05 92.0967ZM7.28711 9.03809C14.1231 30.4343 33.9153 48.0768 63.3721 69.9375C86.1395 86.8358 94.3589 104.379 96.918 117.646C98.1991 124.287 98.0647 129.874 97.6123 133.795C97.4365 135.319 97.2112 136.59 97.0039 137.573C93.7672 127.848 85.2798 121.71 75.7891 117.602C65.5294 113.161 53.9201 111.016 46.0996 109.303C29.864 105.745 20.5195 96.4424 15.2236 88.0293C12.573 83.8183 10.9362 79.8286 9.96289 76.8936C9.8445 76.5365 9.73605 76.1952 9.63672 75.8711C13.9912 81.5036 20.9254 86.2062 27.0967 89.6357C30.7903 91.6884 34.2451 93.304 36.7764 94.4062C38.0422 94.9575 39.0782 95.381 39.7988 95.667C40.159 95.8099 40.4408 95.9191 40.6328 95.9922C40.7288 96.0287 40.8026 96.0565 40.8525 96.0752C40.8775 96.0845 40.8972 96.0909 40.9102 96.0957C40.9166 96.0981 40.9214 96.1003 40.9248 96.1016C40.9264 96.1021 40.9278 96.1022 40.9287 96.1025L40.9297 96.1035C40.93 96.1036 40.9308 96.1035 41.1602 95.4775L40.9307 96.1035L41.458 94.8818C23.9496 86.1147 15.4909 74.1545 11.3984 64.4121C9.34989 59.5353 8.39237 55.2062 7.94727 52.1016C7.82506 51.2491 7.74248 50.4892 7.68555 49.8359C13.5258 59.3455 22.6539 66.1762 30.5195 70.6963C34.7819 73.1457 38.6898 74.9273 41.5332 76.0967C42.9552 76.6815 44.112 77.1139 44.915 77.4004C45.3166 77.5437 45.6301 77.6503 45.8438 77.7217C45.9503 77.7572 46.0322 77.7837 46.0879 77.8018C46.1158 77.8108 46.1378 77.8176 46.1523 77.8223C46.1596 77.8246 46.1651 77.8269 46.1689 77.8281C46.1709 77.8287 46.1727 77.8288 46.1738 77.8291L46.1748 77.8301C46.1752 77.8301 46.1784 77.822 46.375 77.1943L46.1758 77.8301L46.7471 76.6406C24.2919 61.5272 14.4964 43.6136 10.3027 29.501C8.20439 22.4395 7.5065 16.3229 7.33301 11.9766C7.28923 10.8797 7.27824 9.89568 7.28711 9.03809Z';
  var WORD = '<g><path d="M43.96 194.048V197.852H30.375V207.343H41.5176V211.093H30.375V224.388H25.667V194.048H43.96Z"/><path d="M69.4429 194.048L80.4282 224.388H75.5337L73.186 217.037L73.0376 216.573H61.4692L61.3179 217.03L58.8823 224.388H53.9653L64.9507 194.048H69.4429ZM66.5981 200.432L62.9438 211.901L62.6665 212.77H71.8384L71.5581 211.899L67.8677 200.431L67.23 198.448L66.5981 200.432Z"/><path d="M98.374 194.048V220.584H111.325V224.388H93.666V194.048H98.374Z"/><path d="M137.627 193.469C141.221 193.469 144.238 194.337 146.715 196.04L144.989 199.655C142.956 198.39 140.606 197.761 137.952 197.761C135.834 197.761 133.926 198.228 132.238 199.166C130.55 200.105 129.225 201.408 128.26 203.067C127.297 204.729 126.83 206.625 126.83 208.739C126.83 211.103 127.321 213.198 128.324 215.012C129.337 216.825 130.757 218.231 132.568 219.218C134.396 220.2 136.526 220.674 138.93 220.674C140.081 220.674 141.207 220.562 142.302 220.335C143.219 220.139 144.248 219.83 145.387 219.417L146.213 223.224C145.462 223.565 144.866 223.815 144.42 223.975C144.024 224.123 143.581 224.256 143.086 224.376L142.573 224.493C141.821 224.655 141.036 224.778 140.218 224.862C139.392 224.955 138.53 225.003 137.627 225.003C135.223 225.003 133.147 224.689 131.387 224.081C129.738 223.511 128.232 222.645 126.873 221.484L126.604 221.249C125.116 219.902 123.92 218.248 123.022 216.275L122.847 215.876C121.941 213.717 121.489 211.454 121.489 209.083C121.489 206.863 121.89 204.783 122.688 202.841C123.485 200.89 124.632 199.175 126.136 197.693C127.678 196.185 129.337 195.11 131.109 194.459C132.885 193.806 135.05 193.469 137.627 193.469Z"/><path d="M174.183 193.469C177.418 193.469 180.235 194.137 182.656 195.451C185.079 196.766 186.952 198.604 188.292 200.964C189.637 203.311 190.321 206.06 190.321 209.227C190.321 212.32 189.622 215.041 188.241 217.411C186.863 219.781 184.978 221.637 182.577 222.99C180.181 224.328 177.388 225.003 174.183 225.003C170.987 225.003 168.188 224.328 165.768 222.988C163.349 221.635 161.456 219.779 160.07 217.41C158.699 215.041 158.009 212.32 158.009 209.227C158.009 206.06 158.692 203.311 160.037 200.966C161.386 198.606 163.271 196.767 165.708 195.451C168.14 194.136 170.958 193.469 174.183 193.469ZM174.183 197.363C172.087 197.363 170.183 197.882 168.48 198.927C166.792 199.97 165.475 201.393 164.531 203.181C163.578 204.968 163.116 206.99 163.116 209.227C163.116 211.456 163.579 213.479 164.532 215.274C165.477 217.054 166.793 218.468 168.479 219.508C170.183 220.554 172.087 221.073 174.183 221.073C176.288 221.073 178.189 220.554 179.872 219.506C181.539 218.466 182.849 217.053 183.797 215.275C184.746 213.479 185.214 211.457 185.214 209.227C185.214 207.128 184.803 205.22 183.97 203.518L183.798 203.18C182.85 201.394 181.541 199.971 179.873 198.929C178.189 197.882 176.288 197.363 174.183 197.363Z"/><path d="M210.865 194.048L223.493 213.8C223.816 214.311 224.079 214.775 224.287 215.192L224.477 215.593C224.712 216.126 224.925 216.641 225.115 217.136L226.404 216.897V194.048H230.769V224.677H225.462L212.09 204.502L211.056 202.611C210.967 202.442 210.9 202.301 210.825 202.151C210.787 202.063 210.74 201.913 210.686 201.678L209.37 201.828V224.388H204.951V194.048H210.865Z"/></g>';
  var WORD_CTI = '<g><path d="M118.062 234.271C119.078 234.271 119.932 234.485 120.646 234.89L120.418 235.37C119.742 235.037 118.991 234.873 118.172 234.873C117.367 234.873 116.623 235.055 115.962 235.429C115.317 235.79 114.8 236.296 114.428 236.944C114.058 237.595 113.887 238.327 113.887 239.122C113.887 240.009 114.069 240.82 114.459 241.524C114.848 242.216 115.395 242.757 116.096 243.142C116.821 243.524 117.633 243.695 118.515 243.695C118.941 243.695 119.36 243.654 119.767 243.573C119.976 243.532 120.197 243.475 120.43 243.404L120.534 243.887C120.432 243.93 120.345 243.968 120.272 243.996C120.11 244.056 119.921 244.113 119.702 244.165C119.43 244.208 119.169 244.251 118.902 244.285C118.643 244.317 118.363 244.333 118.062 244.333C117.26 244.333 116.591 244.232 116.039 244.044C115.484 243.849 114.983 243.552 114.533 243.151C114.093 242.749 113.733 242.262 113.455 241.684L113.341 241.431C113.05 240.731 112.905 240.004 112.905 239.248C112.905 238.524 113.035 237.856 113.289 237.241C113.543 236.627 113.909 236.078 114.388 235.599C114.815 235.179 115.27 234.874 115.746 234.673L115.952 234.594C116.52 234.385 117.216 234.271 118.062 234.271Z"/><path d="M134.605 234.47V234.909H131.294V244.116H130.547V234.909H127.238V234.47H134.605Z"/><path d="M142.847 234.47V244.116H142.083V234.47H142.847Z"/></g>';
  // Logo seçenekleri: 'falcon' = standart (CTI yazısız, v1.59.3'ten beri), 'falcon-cti' = eski (CTI yazılı), başka = kendi logom (data: URL)
  function falconLogo(color, withWord, cti) {
    var vb = !withWord ? '0 0 256 186' : cti ? '0 0 256 256' : '0 0 256 234';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '"><g fill="' + color + '" stroke="' + color + '" stroke-width="1.33"><path d="' + EAGLE + '"/>' + (withWord ? WORD + (cti ? WORD_CTI : '') : '') + '</g></svg>');
  }
  function builtinLogo(v) { return !v || v === 'falcon' || v === 'falcon-cti'; }
  function logoSrcOf(v, color) { return builtinLogo(v) ? falconLogo(color, true, v === 'falcon-cti') : v; }
  var SAMPLE_SIGN = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 120"><path d="M18 86c18-34 34-62 44-58 9 4-9 52-2 56 8 5 22-44 36-42 12 2-2 36 8 38 11 2 20-26 32-24 10 2 3 22 13 22 12 0 26-30 42-28 14 2 4 26 18 24 16-2 30-24 52-22" fill="none" stroke="#1d3d8f" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M40 98c60-6 150-8 230-14" fill="none" stroke="#1d3d8f" stroke-width="2" stroke-linecap="round"/>' +
    '<g transform="rotate(-10 150 60)"><rect x="62" y="40" width="176" height="34" rx="5" fill="none" stroke="#d22" stroke-opacity=".55" stroke-width="2.5"/>' +
    '<text x="150" y="64" text-anchor="middle" font-family="Arial, sans-serif" font-size="19" font-weight="700" fill="#d22" fill-opacity=".6" letter-spacing="2">ÖRNEK · SAMPLE</text></g></svg>');

  // ---------- resim yükleme (imza / kaşe / logo) ----------
  function fileUrl(rel) { var b = (F().fileBase) || 'falcon://files/'; return b + String(rel).split('/').map(encodeURIComponent).join('/'); }
  function readAsDataUrl(rel) {
    var lan = F().lan;
    var viaLan = lan && lan.readFile ? Promise.resolve(lan.readFile(rel)).then(function (b64) {
      if (!b64) throw new Error('empty');
      var ext = String(rel).split('.').pop().toLowerCase();
      var mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
      return 'data:' + mime + ';base64,' + b64;
    }) : Promise.reject(new Error('nolan'));
    return viaLan.catch(function () {
      return fetch(fileUrl(rel)).then(function (r) { return r.blob(); }).then(function (b) {
        return new Promise(function (ok, no) { var fr = new FileReader(); fr.onload = function () { ok(fr.result); }; fr.onerror = no; fr.readAsDataURL(b); });
      });
    });
  }
  // En çok 900 px; transparent = true ise beyaza yakın pikseller şeffaf olur (imza, kaşe)
  function shrink(dataUrl, transparent) {
    return new Promise(function (ok, no) {
      var im = new Image();
      im.onload = function () {
        var k = Math.min(1, 900 / Math.max(im.naturalWidth || 1, im.naturalHeight || 1));
        var w = Math.max(1, Math.round(im.naturalWidth * k)), h = Math.max(1, Math.round(im.naturalHeight * k));
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        var x = c.getContext('2d'); x.drawImage(im, 0, 0, w, h);
        if (transparent) {
          try {
            var d = x.getImageData(0, 0, w, h), p = d.data;
            for (var i = 0; i < p.length; i += 4) {
              var m = Math.min(p[i], p[i + 1], p[i + 2]);
              if (m > 235) p[i + 3] = 0; else if (m > 200) p[i + 3] = Math.round(p[i + 3] * (235 - m) / 35);
            }
            x.putImageData(d, 0, 0);
          } catch (e) { /* çapraz kaynak: olduğu gibi */ }
        }
        try { ok(c.toDataURL('image/png')); } catch (e) { no(e); }
      };
      im.onerror = no; im.src = dataUrl;
    });
  }
  function pickImage(transparent) {
    return Promise.resolve(F().files.import('image', false)).then(function (r) {
      var f = Array.isArray(r) ? r[0] : r;
      if (!f || !f.relPath) return null;
      return readAsDataUrl(f.relPath).then(function (du) { return shrink(du, transparent); });
    });
  }

  // ---------- alt bilgi alanları (modüler) ----------
  // company.footer_fields = [{ k: hazır anahtar | 'custom', label: '' (boş = standart ad), value: (yalnız custom), col: 1-4, on: true }]
  // hazır anahtarların değeri company[k]'dan gelir; company.footer_titles = ['', '', '', ''] ('' = standart, '-' = başlıksız)
  var FF_KEYS = ['name', 'address', 'phone', 'fax', 'email', 'web', 'tax_office', 'tax', 'mersis', 'trade_reg', 'bank_name', 'iban'];
  var FF_COL = { name: 1, address: 1, phone: 2, fax: 2, email: 2, web: 2, tax_office: 3, tax: 3, mersis: 3, trade_reg: 3, bank_name: 4, iban: 4 };
  var FF_LTR = { phone: 1, fax: 1, email: 1, web: 1, tax: 1, mersis: 1, trade_reg: 1, iban: 1 };
  function ffDefault() { return FF_KEYS.map(function (k) { return { k: k, label: '', col: FF_COL[k], on: true }; }); }
  function ffList(c) { var l = c && Array.isArray(c.footer_fields) ? c.footer_fields : null; return l ? l : ffDefault(); }

  // ---------- PDF / önizleme HTML ----------
  var PALETTE = {
    falcon: { ink: '#13213b', accent: '#c9a227', soft: '#eef2f8', line: '#d5dbe6' },
    classic: { ink: '#1f2937', accent: '#13213b', soft: '#f5f5f5', line: '#c9ced6' },
    minimal: { ink: '#111827', accent: '#2563eb', soft: '#f8fafc', line: '#e5e7eb' },
    efatura: { ink: '#1f2a37', accent: '#1f2a37', soft: '#f6f7f9', line: '#b9c0ca' }
  };
  // çok satırlı ürün adı: ilk satır kalın (ürün), alttakiler özellik satırları
  function itemNameHtml(n) {
    var ls = String(n || '').replace(/\r/g, '').trim().split('\n');
    return ls.length > 1 ? '<b>' + esc(ls[0]) + '</b><br>' + ls.slice(1).map(esc).join('<br>') : esc(ls[0]);
  }
  // Fatura başına imza: şablon alanında saklanır ('falcon' = imzalı, 'falcon|ns' = imzasız) — şema değişmez, eşitlemeyle birlikte gider
  function tplOf(v) { var x = String(v || '').split('|')[0]; return PALETTE[x] ? x : 'falcon'; }
  // şablon değeri: "<şablon>[|bayrak…]" — ns: imzasız, nd: durum damgası (Ödendi / Ödenmedi / Kısmi) yok (v1.61.1), nv: KDV'siz fatura (v1.61.2)
  function tplFlagList(v) { return String(v || '').split('|').slice(1).filter(Boolean); }
  function hasFlagOn(v, f) { return tplFlagList(v).indexOf(f) < 0; }
  function withFlag(v, f, on) { var fl = tplFlagList(v).filter(function (x) { return x !== f; }); if (!on) fl.push(f); fl.sort(); return [tplOf(v)].concat(fl).join('|'); }
  function hasSign(v) { return hasFlagOn(v, 'ns'); }
  function hasStatus(v) { return hasFlagOn(v, 'nd'); }
  function hasVat(v) { return hasFlagOn(v, 'nv'); }
  function withSign(v, on) { return withFlag(v, 'ns', on); }
  function withStatus(v, on) { return withFlag(v, 'nd', on); }
  function withVat(v, on) { return withFlag(v, 'nv', on); }
  // v1.61.2: fatura başına karekod (nq) / barkod (nb) kapatma
  function hasQr(v) { return hasFlagOn(v, 'nq'); }
  function hasBc(v) { return hasFlagOn(v, 'nb'); }
  // v1.63: PDF düzeni — yazıyla tutar (tr / en / ar), sayfa numarası, özet kartı
  var PX = {
    tr: { words: 'Yalnız', page: 'Sayfa', items: 'Kalem', qty: 'Toplam miktar', payable: 'Ödenecek tutar', due: 'Vade', summary: 'Fatura özeti' },
    en: { words: 'Amount in words', page: 'Page', items: 'Lines', qty: 'Total quantity', payable: 'Amount due', due: 'Due date', summary: 'Invoice summary' },
    ar: { words: 'المبلغ كتابةً', page: 'صفحة', items: 'البنود', qty: 'إجمالي الكمية', payable: 'المبلغ المستحق', due: 'تاريخ الاستحقاق', summary: 'ملخص الفاتورة' }
  };
  var CURW = {
    tr: { USD: ['ABD Doları', 'Sent'], TRY: ['Türk Lirası', 'Kuruş'], SYP: ['Suriye Lirası', 'Kuruş'] },
    en: { USD: ['US Dollars', 'Cents'], TRY: ['Turkish Lira', 'Kurus'], SYP: ['Syrian Pounds', 'Piastres'] },
    ar: { USD: ['دولار أمريكي', 'سنت'], TRY: ['ليرة تركية', 'قرش'], SYP: ['ليرة سورية', 'قرش'] }
  };
  function wordsTr(n) {
    var B = ['', 'Bir', 'İki', 'Üç', 'Dört', 'Beş', 'Altı', 'Yedi', 'Sekiz', 'Dokuz'], O = ['', 'On', 'Yirmi', 'Otuz', 'Kırk', 'Elli', 'Altmış', 'Yetmiş', 'Seksen', 'Doksan'];
    var u3 = function (x) { var h = Math.floor(x / 100), r = x % 100; return (h ? (h > 1 ? B[h] + ' ' : '') + 'Yüz ' : '') + (O[Math.floor(r / 10)] ? O[Math.floor(r / 10)] + ' ' : '') + (B[r % 10] ? B[r % 10] : ''); };
    if (!n) return 'Sıfır';
    var S = ['', 'Bin', 'Milyon', 'Milyar'], out = [], i = 0;
    while (n > 0) { var g = n % 1000; if (g) out.unshift(i === 1 && g === 1 ? 'Bin' : (u3(g).trim() + (S[i] ? ' ' + S[i] : ''))); n = Math.floor(n / 1000); i++; }
    return out.join(' ').replace(/\s+/g, ' ').trim();
  }
  function wordsEn(n) {
    var A = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    var T = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    var u2 = function (x) { return x < 20 ? A[x] : T[Math.floor(x / 10)] + (x % 10 ? '-' + A[x % 10] : ''); };
    var u3 = function (x) { var h = Math.floor(x / 100), r = x % 100; return (h ? A[h] + ' Hundred' + (r ? ' ' : '') : '') + (r ? u2(r) : ''); };
    if (!n) return 'Zero';
    var S = ['', 'Thousand', 'Million', 'Billion'], out = [], i = 0;
    while (n > 0) { var g = n % 1000; if (g) out.unshift(u3(g) + (S[i] ? ' ' + S[i] : '')); n = Math.floor(n / 1000); i++; }
    return out.join(' ');
  }
  function wordsAr(n) {
    var U = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
    var T = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
    var H = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
    var u3 = function (x) {
      var h = Math.floor(x / 100), r = x % 100, p = [];
      if (h) p.push(H[h]);
      if (r) p.push(r < 20 ? U[r] : (r % 10 ? U[r % 10] + ' و' + T[Math.floor(r / 10)] : T[Math.floor(r / 10)]));
      return p.join(' و');
    };
    if (!n) return 'صفر';
    var SC = [null, ['ألف', 'ألفان', 'آلاف'], ['مليون', 'مليونان', 'ملايين'], ['مليار', 'ملياران', 'مليارات']], out = [], i = 0;
    while (n > 0) {
      var g = n % 1000;
      if (g) {
        if (!SC[i]) out.unshift(u3(g));
        else if (g === 1) out.unshift(SC[i][0]);
        else if (g === 2) out.unshift(SC[i][1]);
        else if (g <= 10) out.unshift(u3(g) + ' ' + SC[i][2]);
        else out.unshift(u3(g) + ' ' + SC[i][0]);
      }
      n = Math.floor(n / 1000); i++;
    }
    return out.join(' و');
  }
  function amountWords(v, cur, lg) {
    var d = DEC[cur] == null ? 2 : DEC[cur], neg = v < 0; v = Math.abs(v);
    var whole = Math.floor(v + 1e-9), frac = d ? Math.round((v - whole) * Math.pow(10, d)) : 0;
    if (frac >= Math.pow(10, d) && d) { whole++; frac = 0; }
    var W = lg === 'ar' ? wordsAr : lg === 'en' ? wordsEn : wordsTr, C = (CURW[lg] || CURW.tr)[cur] || [cur, ''];
    var s = W(whole) + ' ' + C[0] + (frac ? (lg === 'ar' ? ' و' : lg === 'en' ? ' and ' : ' ') + W(frac) + ' ' + C[1] : '');
    if (lg === 'ar') return 'فقط ' + s + ' لا غير';
    return (neg ? '− ' : '') + s;
  }
  var CODEW = { SATIS: ['Sales', 'مبيعات'], IADE: ['Return', 'مرتجع'], TEVKIFAT: ['Withholding', 'استقطاع ضريبي'], ISTISNA: ['VAT Exemption', 'إعفاء ضريبي'], OZELMATRAH: ['Special Tax Base', 'وعاء ضريبي خاص'],
    IHRACKAYITLI: ['Export-Registered', 'مسجّلة للتصدير'], TEMELFATURA: ['Basic Invoice', 'فاتورة أساسية'], TICARIFATURA: ['Commercial Invoice', 'فاتورة تجارية'], EARSIVFATURA: ['e-Archive Invoice', 'فاتورة أرشيف إلكتروني'],
    IHRACAT: ['Export', 'تصدير'], KAMU: ['Public Sector', 'القطاع العام'], YOLCUBERABERFATURA: ['Passenger Invoice', 'فاتورة مسافر'] };
  function invoiceHtml(inv, cfg, forPdf) {
    var lg = DOC[inv.lang] ? inv.lang : lang();
    var D = DOC[lg], LB = LBL[lg] || LBL.tr, rtl = lg === 'ar', cur = inv.currency_code, tpl = tplOf(inv.template), P = PALETTE[tpl], gib = tpl === 'efatura';
    var items = jparse(inv.items, []); if (!Array.isArray(items)) items = [];
    var meta = jparse(inv.meta, {}) || {};
    var c = cfg.company || {};
    var logoSrc = logoSrcOf(cfg.logo, tpl === 'falcon' ? '#ffffff' : P.ink);
    var sign = hasSign(inv.template) ? (cfg.signature || SAMPLE_SIGN) : '';
    var other = ['tr', 'en', 'ar'].filter(function (x) { return x !== lg; }).map(function (x) { return DOC[x].title; }).join(' · ');
    var remaining = rnd((inv.total || 0) - (inv.paid || 0), cur);
    var st = inv.status || 'pending';
    var M = function (n) { return '<span dir="ltr" class="m">' + esc(money(n, cur, lg)) + '</span>'; };
    var L = function (x) { return '<span dir="ltr">' + esc(x) + '</span>'; };
    var pct = function (v) { var x = fmt(num(v), 'X', lg).replace(/[.,]00$/, ''); return lg === 'tr' ? '%' + x : x + '%'; };
    var pos = c.info_pos === 'top' || c.info_pos === 'bottom' ? c.info_pos : 'both';
    // satır KDV'si: kalemlerde vat varsa (ya da düzende KDV sütunu açıksa) her satırın KDV'si; yoksa fatura geneli oran
    var noVat = !hasVat(inv.template);
    var perLine = !noVat && items.some(function (it) { return it.vat != null && it.vat !== ''; });
    var tt = calcTotals(items, inv.discount, noVat ? 0 : inv.tax_rate, cur, perLine);
    var X = PX[lg] || PX.tr, lay0 = cfg.layout || {};
    var vset = {}; items.forEach(function (it) { vset[String(num(it.vat))] = 1; });
    var oneVat = perLine && Object.keys(vset).length === 1 && lay0.vat_cols !== 'always';
    var codeInline = lay0.code_inline === true;
    var cols = layOn(cfg, 'cols').filter(function (f) { return (perLine && !oneVat) || (f.k !== 'vat' && f.k !== 'vat_amount'); })
      .filter(function (f) { return !(codeInline && f.k === 'code'); });
    var hasCodeCol = layHas(cfg, 'cols', 'code');
    var unitCol = cols.some(function (f) { return f.k === 'unit'; });
    var taxLine = [c.tax_office ? esc(D.taxOffice) + ': ' + esc(c.tax_office) : '', c.tax ? esc(D.taxNo) + ': ' + L(c.tax) : ''].filter(Boolean).join(' · ');
    var contact = pos === 'bottom' ? [] : [c.address ? esc(c.address) : '', c.phone ? '☎ ' + L(c.phone) : '', c.email ? '✉ ' + L(c.email) : '', c.web ? L(c.web) : '', taxLine].filter(Boolean);
    var KV = function (k, v, ltr) { return v ? '<div><span class="k">' + esc(k) + ':</span> ' + (ltr ? L(v) : esc(v)) + '</div>' : ''; };
    var colHtml = ['', '', '', ''], fTitles = Array.isArray(c.footer_titles) ? c.footer_titles : [];
    ffList(c).forEach(function (f) {
      if (!f || f.on === false) return;
      var custom = f.k === 'custom' || FF_KEYS.indexOf(f.k) < 0;
      var v = String((custom ? f.value : c[f.k]) || '').trim(); if (!v) return;
      var lb = String(f.label || '').trim() || (custom ? '' : D.ff[f.k]);
      var ci2 = Math.min(4, Math.max(1, Number(f.col) || 1)) - 1, ltr = !custom && FF_LTR[f.k];
      var h;
      if (!custom && !String(f.label || '').trim() && f.k === 'name') h = '<div><b>' + esc(v) + '</b></div>';
      else if (!custom && !String(f.label || '').trim() && f.k === 'address') h = '<div class="ad">' + esc(v) + '</div>';
      else h = lb ? KV(lb, v, ltr) : '<div class="ad">' + esc(v) + '</div>';
      colHtml[ci2] += h;
    });
    var fDef = [D.seller, D.contactH, D.legalH, D.bankH];
    var fcols = colHtml.map(function (x, i) {
      if (!x) return '';
      var tt2 = String(fTitles[i] || '').trim(); tt2 = tt2 === '-' ? '' : (tt2 || fDef[i]);
      return '<div class="fc">' + (tt2 ? '<h5>' + esc(tt2) + '</h5>' : '') + x + '</div>';
    }).join('');
    // fatura bilgileri (düzendeki sırayla)
    var metaVal = function (k) {
      if (k === 'date') return dmy(inv.date); if (k === 'number') return inv.number; if (k === 'due_date') return inv.due_date ? dmy(inv.due_date) : '';
      if ((k === 'inv_type' || k === 'scenario') && lg !== 'tr' && CODEW[meta[k]]) return CODEW[meta[k]][lg === 'ar' ? 1 : 0];
      return meta[k] || '';
    };
    var LTR_META = { number: 1, ettn: 1, customization: 1, issue_time: 1, order_no: 1, waybill_no: 1, campaign: 1 };
    var metaRows = layOn(cfg, 'meta').filter(function (f) { return metaVal(f.k); }).map(function (f) { return { k: f.k, label: fLabel('meta', f, lg), v: metaVal(f.k), ltr: LTR_META[f.k] || f.custom }; });
    if (meta.fx_rate) metaRows.push({ k: 'fx_rate', label: D.fxRate, v: meta.fx_rate, ltr: true }); // v1.61: çeviride kullanılan kur
    // müşteri alanları
    var custVal = function (k) {
      if (k === 'tax_no') return inv.customer_tax || ''; if (k === 'address') return inv.customer_address || ''; if (k === 'phone') return inv.customer_phone || ''; if (k === 'email') return inv.customer_email || '';
      return meta['c.' + k] || '';
    };
    var LTR_CUST = { tax_no: 1, phone: 1, email: 1, web: 1, postal_code: 1 };
    var custF = layOn(cfg, 'cust');
    var ADDR = { address: 1, district: 1, city: 1, postal_code: 1, country: 1 };
    var UP = function (x) { return String(x || '').toLocaleUpperCase('tr'); };
    var custLines = function (withLabels) {
      var a0 = UP(custVal('address'));
      // il / ilçe adresin içinde yazıyorsa ikinci kez basılmaz
      var addr = custF.filter(function (f) { var v = custVal(f.k); return ADDR[f.k] && v && (f.k === 'address' || a0.indexOf(UP(v)) < 0); }).map(function (f) { return esc(custVal(f.k)); });
      var out = [], placed = false;
      custF.forEach(function (f) {
        if (ADDR[f.k]) { if (!placed && addr.length) { out.push('<span class="ad">' + addr.join(' ') + '</span>'); placed = true; } return; }
        var v = custVal(f.k); if (!v) return;
        var lb = fLabel('cust', f, lg);
        out.push((withLabels || (f.k !== 'phone' && f.k !== 'email') ? '<span class="k">' + esc(lb) + ':</span> ' : f.k === 'phone' ? '☎ ' : '✉ ') + (LTR_CUST[f.k] ? L(v) : esc(v)));
      });
      return out;
    };
    // kalemler
    var CW = { no: '7mm', depot: '15mm', unit: '13mm', vat: '13mm', qty: '17mm', price: '21mm', amount: '28mm', vat_amount: '20mm' };
    var NUMC = { qty: 1, price: 1, amount: 1, vat: 1, vat_amount: 1 };
    var thead = '<tr>' + cols.map(function (f) {
      var cls = NUMC[f.k] ? 'n' : f.k === 'no' || f.k === 'unit' ? 'c' : '';
      return '<th class="' + cls + '"' + (CW[f.k] ? ' style="width:' + CW[f.k] + '"' : '') + '>' + esc(f.k === 'no' && !f.label && !gib ? '#' : fLabel('cols', f, lg)) + '</th>';
    }).join('') + '</tr>';
    var k0 = tt.subtotal > 0 ? (tt.subtotal - tt.discount) / tt.subtotal : 0;
    var rows = items.map(function (it, i) {
      var line = rnd(num(it.qty) * num(it.price), cur), x = it.x || {};
      var qty = esc(fmt(num(it.qty), 'X', lg).replace(/[.,]00$/, '')) + (!unitCol && it.unit ? ' ' + esc(it.unit) : '');
      return '<tr>' + cols.map(function (f) {
        switch (f.k) {
          case 'no': return '<td class="c">' + (i + 1) + '</td>';
          case 'depot': return '<td class="cd">' + esc(it.depot || '') + '</td>';
          case 'code': return '<td class="cd" dir="ltr">' + esc(it.code || '') + '</td>';
          case 'name': return '<td class="nm">' + itemNameHtml(it.name) + (codeInline && hasCodeCol && it.code ? '<div class="sc" dir="ltr">' + esc(it.code) + '</div>' : '') + '</td>';
          case 'qty': return '<td class="n">' + qty + '</td>';
          case 'unit': return '<td class="c">' + esc(it.unit || '') + '</td>';
          case 'price': return '<td class="n">' + M(it.price) + '</td>';
          case 'amount': return '<td class="n">' + M(line) + '</td>';
          case 'vat': return '<td class="n">' + (it.vat != null && it.vat !== '' ? L(pct(it.vat)) : '') + '</td>';
          case 'vat_amount': return '<td class="n">' + M(rnd(num(it.qty) * num(it.price) * k0 * num(it.vat) / 100, cur)) + '</td>';
          default: return '<td>' + esc(x[f.k] || '') + '</td>';
        }
      }).join('') + '</tr>';
    }).join('');
    var units = {}; items.forEach(function (it) { units[String(it.unit || '')] = 1; });
    var uList = Object.keys(units), qSum = items.reduce(function (a, it) { return a + num(it.qty); }, 0);
    var qTxt = esc(fmt(qSum, 'X', lg).replace(/[.,]00$/, '')) + (uList.length === 1 && uList[0] ? ' ' + esc(uList[0]) : '');
    var cntRow = '<tr class="q"><td>' + esc(X.items) + ' · ' + esc(X.qty) + '</td><td class="n"><span dir="ltr">' + items.length + ' · ' + qTxt + '</span></td></tr>';
    var rates = Object.keys(tt.byRate).sort(function (a, b) { return Number(b) - Number(a); });
    var G = LB.gib;
    var vatRows = noVat ? '' : perLine ? rates.map(function (r) { return '<tr><td>' + esc(gib || lg === 'tr' ? G.vat : D.tax) + ' (' + pct(r) + ')</td><td class="n">' + M(tt.byRate[r].tax) + '</td></tr>'; }).join('')
      : (inv.tax_rate ? '<tr><td>' + D.tax + ' (' + pct(inv.tax_rate) + ')</td><td class="n">' + M(inv.tax) + '</td></tr>' : '');
    var totals = gib
      ? cntRow + '<tr><td>' + esc(G.subtotal) + '</td><td class="n">' + M(inv.subtotal) + '</td></tr><tr><td>' + esc(G.discount) + '</td><td class="n">' + M(inv.discount || 0) + '</td></tr>' + vatRows +
        (noVat ? '' : '<tr><td>' + esc(G.total) + '</td><td class="n">' + M(inv.total) + '</td></tr>') + (inv.paid > 0 ? '<tr><td>' + D.paid + '</td><td class="n">' + M(inv.paid) + '</td></tr>' : '') +
        '<tr class="g"><td>' + esc(G.payable) + '</td><td class="n">' + M(inv.paid > 0 ? remaining : inv.total) + '</td></tr>'
      : cntRow + '<tr><td>' + D.subtotal + '</td><td class="n">' + M(inv.subtotal) + '</td></tr>' +
        (inv.discount ? '<tr><td>' + D.discount + '</td><td class="n">− ' + M(inv.discount) + '</td></tr>' : '') + vatRows +
        '<tr class="g"><td>' + D.grand + '</td><td class="n">' + M(inv.total) + '</td></tr>' +
        (inv.paid > 0 ? '<tr><td>' + D.paid + '</td><td class="n">' + M(inv.paid) + '</td></tr><tr class="r"><td>' + D.remaining + '</td><td class="n">' + M(remaining) + '</td></tr>' : '');
    var lay = cfg.layout || {};
    var payable = inv.paid > 0 ? remaining : inv.total;
    var words = lay.words !== false ? '<div class="wd"><span class="k">' + esc(X.words) + ':</span> ' + esc(amountWords(num(payable), cur, lg)) + '</div>' : '';
    var qr = lay.qr !== false && hasQr(inv.template) ? qrSvg(qrPayload(inv, cfg, tt), '#000') : '';
    var bc = lay.barcode !== false && hasBc(inv.template) ? barcodeSvg(meta.ettn || inv.number, '#000') : '';
    var font = rtl ? "'Noto Sans Arabic','Segoe UI',Tahoma,Arial,sans-serif" : "'Segoe UI','Inter',Arial,'Noto Sans Arabic',sans-serif";
    var many = cols.length > 8;
    var css =
      '@page{size:210mm 297mm;margin:10mm 0 12mm}@page:first{margin-top:0}*{box-sizing:border-box}html,body{margin:0;padding:0}table{color:inherit;font-size:inherit;font-family:inherit}' +
      '.inv{width:210mm;min-height:285mm;padding:0 0 4mm;font-family:' + font + ';color:' + P.ink + ';font-size:10.5pt;background:#fff;position:relative;-webkit-print-color-adjust:exact;print-color-adjust:exact;display:flex;flex-direction:column}' +
      '.hd{display:flex;justify-content:space-between;align-items:center;gap:10mm;padding:9mm 14mm 7mm;' + (tpl === 'falcon' ? 'background:' + P.ink + ';color:#fff;border-bottom:3px solid ' + P.accent + ';' : tpl === 'classic' ? 'border-bottom:2px solid ' + P.ink + ';margin:0 14mm;padding:12mm 0 7mm;' : 'border-bottom:1px solid ' + P.line + ';margin:0 14mm;padding:12mm 0 7mm;') + '}' +
      '.brand{display:flex;align-items:center;gap:5mm}.brand img{height:' + (tpl === 'minimal' ? '20mm' : '25mm') + ';width:auto}' +
      '.co{font-size:9pt;line-height:1.55;opacity:.95}.co b{font-size:13pt;display:block;margin-bottom:1mm;letter-spacing:.02em}' +
      '.tt{text-align:' + (rtl ? 'left' : 'right') + '}.tt h1{margin:0;font-size:' + (rtl ? '26pt' : '24pt') + ';letter-spacing:' + (rtl ? '0' : '.14em') + ';font-weight:800;color:' + (tpl === 'falcon' ? '#fff' : P.accent) + '}' +
      '.tt .o{font-size:8.5pt;opacity:.75;margin-top:1mm}.meta{margin-top:3mm;font-size:9pt;line-height:1.55}.meta span{opacity:.75}.tt .l2{max-height:14mm;max-width:50mm;margin-bottom:2mm}' +
      '.body{padding:6mm 14mm 0;flex:1}' +
      '.parties{display:flex;justify-content:space-between;gap:8mm;margin-bottom:5mm}' +
      '.box{flex:1;background:' + P.soft + ';border-' + (rtl ? 'right' : 'left') + ':3px solid ' + P.accent + ';padding:4mm 5mm;border-radius:2mm;font-size:9.5pt;line-height:1.6}' +
      '.box h3{margin:0 0 1.5mm;font-size:8.5pt;text-transform:uppercase;letter-spacing:.08em;opacity:.7}.box b{font-size:11.5pt}.box .k,.gb .k{opacity:.7}' +
      '.stbox{display:flex;flex-direction:column;align-items:' + (rtl ? 'flex-start' : 'flex-end') + ';justify-content:center;gap:2.5mm;min-width:45mm}' +
      '.codes{display:flex;gap:3mm;align-items:center}.codes .qr svg{width:24mm;height:24mm;display:block}.bc svg{width:52mm;height:10mm;display:block}.bc .t{font-size:6.5pt;text-align:center;letter-spacing:.04em;margin-top:.6mm}' +
      '.st{display:inline-block;border:2px solid currentColor;border-radius:2mm;padding:1.5mm 4mm;font-weight:800;letter-spacing:.08em;font-size:11pt;transform:rotate(' + (rtl ? '4' : '-4') + 'deg)}' +
      '.st.paid{color:#15803d}.st.partial{color:#b45309}.st.pending{color:#b91c1c}.st.cancelled{color:#6b7280}' +
      'table.it{width:100%;border-collapse:collapse;font-size:' + (many ? '8.4pt' : '8.9pt') + '}' +
      'table.it th{background:' + (tpl === 'minimal' ? 'transparent' : gib ? '#e9ecf1' : P.ink) + ';color:' + (tpl === 'minimal' || gib ? P.ink : '#fff') + ';font-weight:700;padding:' + (many ? '2mm 1.6mm' : '2.6mm 2.5mm') + ';text-align:' + (rtl ? 'right' : 'left') + ';font-size:' + (many ? '7.8pt' : '9pt') + ';vertical-align:bottom;' + (tpl === 'minimal' ? 'border-bottom:2px solid ' + P.ink + ';' : '') + '}' +
      'table.it tr{break-inside:avoid}table.it td{line-height:1.25;padding:' + (many ? '1.3mm 1.6mm' : '1.5mm 2mm') + ';border-bottom:1px solid ' + P.line + ';vertical-align:' + (gib ? 'middle' : 'top') + '}' +
      (tpl === 'classic' || gib ? 'table.it td,table.it th{border:1px solid ' + P.line + '}' : '') +
      'table.it tr:nth-child(even) td{background:' + (tpl === 'minimal' ? '#fff' : P.soft) + '}table.it td.cd{white-space:nowrap;font-size:.84em;opacity:.85}table.it td.nm{min-width:60mm}table.it td.nm .sc{font-size:.82em;opacity:.6;margin-top:.4mm;letter-spacing:.02em}' +
      '.n,table.it th.n{text-align:' + (rtl ? 'left' : 'right') + ';white-space:nowrap}.c,table.it th.c{text-align:center}.m{unicode-bidi:isolate}' +
      '.end{break-inside:avoid;page-break-inside:avoid}.sum{display:flex;justify-content:space-between;gap:8mm;margin-top:4mm;align-items:flex-start}' +
      '.wd{margin-top:2mm;padding:2.2mm 3.5mm;background:' + P.soft + ';border-radius:1.5mm;font-size:9pt;font-weight:600}.wd .k{opacity:.65;font-weight:500}table.tot tr.q td{font-size:8.6pt;opacity:.7}' +
      '.sumc{min-width:62mm;border:1px solid ' + P.line + ';border-radius:2mm;padding:4mm 5mm;display:flex;flex-direction:column;gap:1.6mm;font-size:9pt;justify-content:center}' +
      '.sumc h3{margin:0;font-size:8.5pt;text-transform:uppercase;letter-spacing:.08em;opacity:.7}.sumc .big{font-size:17pt;font-weight:800;color:' + P.ink + ';line-height:1.2}.sumc .row{display:flex;justify-content:space-between;gap:4mm}.sumc .row span:first-child{opacity:.7}' +
      '.sumc .cd2{display:flex;gap:3mm;align-items:center;justify-content:center;margin-top:1mm}.sumc .cd2 svg{width:22mm;height:22mm}' +
      '.notes{flex:1;font-size:9pt;line-height:1.6}.notes h4{margin:0 0 1mm;font-size:8.5pt;text-transform:uppercase;letter-spacing:.06em;opacity:.7}.notes p{margin:0 0 3mm;white-space:pre-wrap}' +
      'table.tot{width:' + (gib ? '92mm' : '78mm') + ';border-collapse:collapse;font-size:10pt}table.tot td{padding:1.4mm 2.5mm}table.tot tr+tr td{border-top:1px solid ' + P.line + '}' +
      (gib ? 'table.tot td{border:1px solid ' + P.line + '}table.tot td:first-child{font-weight:700;background:#f3f5f8}' : '') +
      'table.tot tr.g td{background:' + P.ink + ';color:#fff;font-weight:800;font-size:11.5pt}table.tot tr.r td{font-weight:800;color:#b91c1c}' +
      '.sig{display:flex;justify-content:space-between;align-items:flex-end;gap:6mm;margin-top:4mm;page-break-inside:avoid}.notes{display:flex;flex-direction:column;align-self:stretch}.notes .sig{margin-top:auto}' +
      '.sg{flex:1;max-width:48mm;text-align:center;font-size:9pt}.sg .im{height:17mm;display:flex;align-items:flex-end;justify-content:center}.sg img{max-height:17mm;max-width:46mm}' +
      '.sg .ln{border-top:1px solid ' + P.ink + ';margin-top:1.5mm;padding-top:1.5mm;font-weight:700}' +
      '.ft{break-inside:avoid;margin:4mm 14mm 0;padding-top:3mm;border-top:1px solid ' + P.line + ';font-size:8pt;line-height:1.5;page-break-inside:avoid}' +
      (tpl === 'falcon' ? '.ft{border-top:2px solid ' + P.accent + '}' : '') +
      '.ft{display:flex;gap:6mm;align-items:flex-start}.ft .th{flex:0 0 46mm;font-style:italic;opacity:.85;font-size:8.3pt;padding-top:.3mm}.ft .cols{flex:1}' +
      '.ft .cols{display:flex;gap:6mm;justify-content:space-between}.ft .fc{flex:1;min-width:0}.ft .fc:first-child{flex:1.25}' +
      '.ft h5{margin:0 0 .8mm;font-size:7.5pt;text-transform:uppercase;letter-spacing:.07em;color:' + P.accent + ';' + (tpl === 'falcon' ? 'filter:brightness(.8);' : '') + '}' +
      '.ft .k{opacity:.65}.ft .ad,.ad{white-space:pre-wrap}.inv [dir=ltr]{unicode-bidi:isolate;direction:ltr}' +
      '.ft .bt{display:flex;justify-content:space-between;margin-top:2.5mm;padding-top:1.5mm;border-top:1px dashed ' + P.line + ';font-size:7.5pt;opacity:.7}' +
      '.wm{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;font-size:90pt;font-weight:900;color:rgba(185,28,28,.08);transform:rotate(-24deg)}' +
      '.wmlogo{position:absolute;left:50%;top:52%;width:120mm;transform:translate(-50%,-50%);opacity:.035;pointer-events:none}' +
      // e-Fatura düzeni (GİB): üstte satıcı | e-Fatura | karekod; altında SAYIN | fatura bilgileri tablosu
      '.g-top{display:grid;grid-template-columns:1fr 46mm 46mm;gap:6mm;padding:11mm 14mm 0;align-items:start}' +
      '.g-sel{font-size:8.8pt;line-height:1.5}.g-sel img{max-height:20mm;max-width:70mm;margin-bottom:3mm;display:block}.g-sel b{font-size:10.5pt}' +
      '.g-mid{text-align:center;padding-top:4mm}.g-badge{display:inline-block;border:2px solid ' + P.ink + ';border-radius:50%;width:26mm;height:26mm;line-height:1.1;font-weight:800;font-size:10pt;display:flex;align-items:center;justify-content:center;margin:0 auto 2mm}' +
      '.g-mid .t{font-weight:700;font-size:11pt}.g-qr svg{width:40mm;height:40mm;display:block;margin-' + (rtl ? 'right' : 'left') + ':auto}' +
      '.g-row{display:grid;grid-template-columns:1fr 92mm;gap:8mm;padding:6mm 14mm 0;align-items:start}' +
      '.gb{font-size:9pt;line-height:1.55}.gb h3{margin:0 0 2mm;font-size:10pt;letter-spacing:.06em}.gb b{font-size:10pt}' +
      '.gl2{text-align:center;margin-bottom:2mm}.gl2 img{max-height:15mm;max-width:88mm}' +
      'table.gm{width:100%;border-collapse:collapse;font-size:9pt}table.gm td{border:1px solid ' + P.line + ';padding:1.4mm 2.2mm}table.gm td:first-child{font-weight:700;width:38mm;background:#f3f5f8}' +
      '.g-bc{margin-top:3mm}.g-bc svg{width:100%;height:14mm;display:block}.g-bc .t{font-size:7pt;text-align:center;letter-spacing:.05em}' +
      '.g-ettn{padding:3mm 14mm 0;font-size:9pt}.g-st{margin-top:2mm}';
    var stamp = hasStatus(inv.template) ? '<span class="st ' + st + '">' + esc(D['st_' + st] || '') + '</span>' : '';
    var custBlock = '<b>' + esc(inv.customer_name) + '</b>' + custLines(gib).map(function (x) { return '<br>' + x; }).join('');
    var body;
    if (gib) {
      var earsiv = /ar[sş]iv/i.test(meta.scenario || '');
      var sel = [c.address ? esc(c.address) : '', c.phone ? esc(D.tel) + ': ' + L(c.phone) : '', c.web ? esc(D.web) + ': ' + L(c.web) : '', c.email ? esc(D.mail) + ': ' + L(c.email) : '',
        c.tax_office ? esc(D.taxOffice) + ': ' + esc(c.tax_office) : '', c.tax ? esc(lg === 'tr' ? 'VKN' : D.taxNo) + ': ' + L(c.tax) : '', c.mersis ? esc(D.ff.mersis) + ': ' + L(c.mersis) : '', c.trade_reg ? esc(D.ff.trade_reg) + ': ' + L(c.trade_reg) : ''].filter(Boolean);
      var ettnRow = metaRows.filter(function (r) { return r.k === 'ettn'; });
      body = '<div class="inv" dir="' + (rtl ? 'rtl' : 'ltr') + '" lang="' + lg + '">' +
        (st === 'cancelled' ? '<div class="wm">' + esc(D.st_cancelled) + '</div>' : '') +
        '<div class="g-top"><div class="g-sel"><img src="' + logoSrcOf(cfg.logo, P.ink) + '" alt=""><b>' + esc(c.name || '') + '</b><br>' + sel.join('<br>') + '</div>' +
        '<div class="g-mid"><div class="g-badge">' + esc(earsiv ? G.earsiv : G.efatura) + '</div><div class="t">' + esc(D.title) + '</div><div class="g-st">' + stamp + '</div></div>' +
        '<div class="g-qr">' + qr + '</div></div>' +
        '<div class="g-row"><div class="gb"><h3>' + esc(D.billTo).toLocaleUpperCase(lg) + '</h3>' + custBlock + '</div>' +
        '<div>' + (cfg.logo2 ? '<div class="gl2"><img src="' + cfg.logo2 + '" alt=""></div>' : '') + '<table class="gm">' + metaRows.filter(function (r) { return ettnRow.indexOf(r) < 0; }).map(function (r) { return '<tr><td>' + esc(r.label) + ':</td><td>' + (r.ltr ? L(r.v) : esc(r.v)) + '</td></tr>'; }).join('') + '</table>' +
        (bc ? '<div class="g-bc">' + bc + '</div>' : '') + '</div></div>' +
        (ettnRow.length ? '<div class="g-ettn"><b>' + esc(ettnRow[0].label) + ':</b> ' + L(ettnRow[0].v) + '</div>' : '') +
        '<div class="body">' +
        '<table class="it"><thead>' + thead + '</thead><tbody>' + rows + '</tbody></table>' +
        '<div class="end"><div class="sum"><div class="notes">' + (inv.note ? '<h4>' + D.note + '</h4><p>' + esc(inv.note) + '</p>' : '') + (c.bank ? '<h4>' + D.bank + '</h4><p>' + esc(c.bank) + '</p>' : '') + '<div class="sig"><div class="sg"><div class="im">' + (cfg.stamp ? '<img src="' + cfg.stamp + '" alt="">' : '') + '</div><div class="ln">' + D.stamp + '</div></div>' +
        '<div class="sg"><div class="im">' + (sign ? '<img src="' + sign + '" alt="">' : '') + '</div><div class="ln">' + D.sign + '</div></div></div>' +
        '</div><table class="tot">' + totals + '</table></div>' + words + '</div></div>' +
        '<div class="ft"><div class="th">' + esc(c.footer || D.thanks) + '</div>' + (fcols && pos !== 'top' ? '<div class="cols">' + fcols + '</div>' : '') +
        '</div></div>';
    } else {
      body =
        '<div class="inv" dir="' + (rtl ? 'rtl' : 'ltr') + '" lang="' + lg + '">' +
        (tpl !== 'minimal' ? '<img class="wmlogo" src="' + falconLogo(P.ink, false) + '" alt="">' : '') +
        (st === 'cancelled' ? '<div class="wm">' + esc(D.st_cancelled) + '</div>' : '') +
        '<div class="hd"><div class="brand"><img src="' + logoSrc + '" alt=""><div class="co"><b>' + esc(c.name || '') + '</b>' + contact.join('<br>') + '</div></div>' +
        '<div class="tt">' + (cfg.logo2 ? '<img class="l2" src="' + cfg.logo2 + '" alt="">' : '') + '<h1>' + esc(D.title) + '</h1><div class="o">' + esc(other) + '</div><div class="meta">' +
        metaRows.filter(function (r) { return r.k !== 'ettn'; }).map(function (r) { return '<span>' + esc(r.label) + ':</span> ' + (r.ltr ? '<b dir="ltr">' + esc(r.v) + '</b>' : esc(r.v)); }).join('<br>') +
        '<br><span>' + D.currency + ':</span> ' + esc(cur) + '</div></div></div>' +
        '<div class="body"><div class="parties"><div class="box"><h3>' + D.billTo + '</h3>' + custBlock + '</div>' +
        '<div class="sumc"><h3>' + esc(X.summary) + '</h3><div>' + esc(X.payable) + '</div><div class="big">' + M(payable) + '</div>' +
        (inv.due_date ? '<div class="row"><span>' + esc(X.due) + '</span><b dir="ltr">' + esc(dmy(inv.due_date)) + '</b></div>' : '') +
        '<div class="row"><span>' + esc(X.items) + '</span><b dir="ltr">' + items.length + ' · ' + qTxt + '</b></div>' +
        (stamp ? '<div>' + stamp + '</div>' : '') + ((qr || bc) ? '<div class="cd2">' + (qr ? '<div class="qr">' + qr + '</div>' : '') + '</div>' : '') + (bc ? '<div class="bc">' + bc + '<div class="t" dir="ltr">' + esc(meta.ettn || inv.number) + '</div></div>' : '') + '</div></div>' +
        metaRows.filter(function (r) { return r.k === 'ettn'; }).map(function (r) { return '<div style="font-size:8.5pt;margin:-4mm 0 4mm"><span style="opacity:.7">' + esc(r.label) + ':</span> ' + L(r.v) + '</div>'; }).join('') +
        '<table class="it"><thead>' + thead + '</thead><tbody>' + rows + '</tbody></table>' +
        '<div class="end"><div class="sum"><div class="notes">' + (inv.note ? '<h4>' + D.note + '</h4><p>' + esc(inv.note) + '</p>' : '') + (c.bank ? '<h4>' + D.bank + '</h4><p>' + esc(c.bank) + '</p>' : '') + '<div class="sig"><div class="sg"><div class="im">' + (cfg.stamp ? '<img src="' + cfg.stamp + '" alt="">' : '') + '</div><div class="ln">' + D.stamp + '</div></div>' +
        '<div class="sg"><div class="im">' + (sign ? '<img src="' + sign + '" alt="">' : '') + '</div><div class="ln">' + D.sign + '</div></div></div>' +
        '</div><table class="tot">' + totals + '</table></div>' + words + '</div></div>' +
        '<div class="ft"><div class="th">' + esc(c.footer || D.thanks) + '</div>' + (fcols && pos !== 'top' ? '<div class="cols">' + fcols + '</div>' : '') +
        '</div></div>';
    }
    if (!forPdf) return { css: css, body: body };
    var pf = '<div dir="' + (rtl ? 'rtl' : 'ltr') + '" style="width:100%;font-size:7.5pt;font-family:' + font.replace(/'/g, '') + ';color:#64748b;padding:0 14mm;display:flex;justify-content:space-between">' +
      '<span>' + esc(c.name || '') + ' · <span dir="ltr">' + esc(inv.number) + '</span></span><span>' + esc(X.page) + ' <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>';
    return '<!doctype html><html lang="' + lg + '" dir="' + (rtl ? 'rtl' : 'ltr') + '"><head><meta charset="utf-8"><title>' + esc(inv.number) + '</title><meta name="falcon-pdf-footer" content="' + esc(pf) + '"><style>' + css + '</style></head><body>' + body + '</body></html>';
  }
  function pdfName(inv) { return (DOC[inv.lang] || DOC.tr).title.replace(/\s/g, '') + '-' + String(inv.number).replace(/[^\w.-]+/g, '_') + '.pdf'; }
  function savePdfHtml(inv, html) { return Promise.resolve(F().report.savePdf(html, pdfName(inv))); }
  function pvNamesPref(v) {
    try { if (v) { localStorage.setItem('fat.pvNames', v); return v; } return localStorage.getItem('fat.pvNames') === 'tr' ? 'tr' : 'keep'; } catch (e) { return v || 'keep'; }
  }
  // ---------- v1.63: ürün adı çevirisi (önce yapay zekâ, yoksa çevrimdışı teknik sözlük) ----------
  var UNITS = { adet: ['pcs', 'قطعة'], kg: ['kg', 'كغ'], gr: ['g', 'غ'], metre: ['m', 'متر'], m: ['m', 'متر'], saat: ['hour', 'ساعة'], gün: ['day', 'يوم'], ay: ['month', 'شهر'],
    paket: ['pack', 'عبوة'], kutu: ['box', 'علبة'], takım: ['set', 'طقم'], set: ['set', 'طقم'], litre: ['L', 'لتر'], lt: ['L', 'لتر'], rulo: ['roll', 'لفة'], çift: ['pair', 'زوج'], ton: ['t', 'طن'], m2: ['m²', 'م²'], m3: ['m³', 'م³'] };
  function unitTr(u, lg) { if (lg === 'tr') return u; var k = String(u || '').trim().toLocaleLowerCase('tr'), x = UNITS[k]; return x ? x[lg === 'ar' ? 1 : 0] : u; }
  // Teknik terimler (elektrik / otomotiv / havacılık / genel). En uzun ifade önce eşleşir; model ve kodlar olduğu gibi kalır.
  var TERMS = [
    ['mike konnektör', 'Aviation Connector', 'موصل طيران'], ['havacılık konnektörü', 'Aviation Connector', 'موصل طيران'],
    ['su geçirmez', 'Waterproof', 'مقاوم للماء'], ['toz geçirmez', 'Dustproof', 'مقاوم للغبار'],
    ['konnektör takımı', 'Connector Set', 'طقم موصلات'], ['konnektör seti', 'Connector Set', 'طقم موصلات'], ['konnektörü', 'Connector', 'موصل'], ['konnektör', 'Connector', 'موصل'], ['konektör', 'Connector', 'موصل'],
    ['panel tipi', 'Panel Mount', 'للتركيب على اللوحة'], ['ray tipi', 'DIN Rail Mount', 'للتركيب على سكة DIN'],
    ['erkek', 'Male', 'ذكر'], ['dişi', 'Female', 'أنثى'],
    ['mandal buton', 'Latching Push Button', 'زر ضغط مزلاجي'], ['acil stop butonu', 'Emergency Stop Button', 'زر إيقاف طوارئ'], ['buton', 'Push Button', 'زر ضغط'], ['anahtarlı', 'Key-Operated', 'بمفتاح'],
    ['endüktif mesafe sensörü', 'Inductive Proximity Sensor', 'حساس تقارب حثي'], ['kapasitif mesafe sensörü', 'Capacitive Proximity Sensor', 'حساس تقارب سعوي'], ['mesafe sensörü', 'Proximity Sensor', 'حساس تقارب'],
    ['sıcaklık sensörü', 'Temperature Sensor', 'حساس حرارة'], ['basınç sensörü', 'Pressure Sensor', 'حساس ضغط'], ['sensörü', 'Sensor', 'حساس'], ['sensör', 'Sensor', 'حساس'],
    ['endüktif', 'Inductive', 'حثي'], ['kapasitif', 'Capacitive', 'سعوي'],
    ['bıçak sigorta kutusu', 'Blade Fuse Box', 'علبة فيوزات شفرية'], ['röle ve sigorta kutusu', 'Relay and Fuse Box', 'علبة مرحلات وفيوزات'], ['sigorta kutusu', 'Fuse Box', 'علبة فيوزات'],
    ['bıçak sigorta', 'Blade Fuse', 'فيوز شفري'], ['sigorta', 'Fuse', 'فيوز'], ['sigortası', 'Fuse', 'فيوز'],
    ['marş rölesi', 'Starter Relay', 'مرحّل بادئ التشغيل'], ['rölesi', 'Relay', 'مرحّل'], ['röle', 'Relay', 'مرحّل'],
    ['yüksek akım', 'High Current', 'تيار عالٍ'], ['otomotiv', 'Automotive', 'للسيارات'], ['oto', 'Automotive', 'للسيارات'],
    ['kanal', 'Channel', 'قنوات'], ['yollu', 'Way', 'اتجاهات'], ['parça', 'Piece', 'قطعة'], ['dahil', 'Included', 'مشمولة'],
    ['kutusu', 'Box', 'علبة'], ['kutu', 'Box', 'علبة'], ['takımı', 'Set', 'طقم'], ['seti', 'Set', 'طقم'], ['takım', 'Set', 'طقم'],
    ['kablo demeti', 'Wiring Harness', 'حزمة أسلاك'], ['kablosu', 'Cable', 'كابل'], ['kablo', 'Cable', 'كابل'], ['soket', 'Socket', 'مقبس'], ['fiş', 'Plug', 'قابس'], ['priz', 'Power Outlet', 'مقبس كهربائي'],
    ['güç kaynağı', 'Power Supply', 'مزود طاقة'], ['adaptör', 'Adapter', 'محوّل'], ['şalter', 'Circuit Breaker', 'قاطع دارة'], ['anahtar', 'Switch', 'مفتاح'],
    ['motor', 'Motor', 'محرك'], ['pompa', 'Pump', 'مضخة'], ['vida', 'Screw', 'برغي'], ['somun', 'Nut', 'صامولة'], ['pul', 'Washer', 'حلقة'], ['conta', 'Gasket', 'حشية'], ['rulman', 'Bearing', 'محمل'],
    ['lamba', 'Lamp', 'مصباح'], ['ampul', 'Bulb', 'لمبة'], ['akü', 'Battery', 'بطارية'], ['pil', 'Battery', 'بطارية'], ['şarj', 'Charging', 'شحن'],
    ['danışmanlık hizmeti', 'Consulting Service', 'خدمة استشارية'], ['danışmanlık', 'Consulting', 'استشارات'], ['hizmeti', 'Service', 'خدمة'], ['hizmet', 'Service', 'خدمة'],
    ['eğitim', 'Training', 'تدريب'], ['bakım', 'Maintenance', 'صيانة'], ['onarım', 'Repair', 'إصلاح'], ['montaj', 'Installation', 'تركيب'], ['nakliye', 'Shipping', 'شحن'],
    ['yedek parça', 'Spare Part', 'قطعة غيار'], ['uçak', 'Aircraft', 'طائرة'], ['iniş takımı', 'Landing Gear', 'جهاز الهبوط'],
    ['yüksek', 'High', 'عالي'], ['düşük', 'Low', 'منخفض'], ['akım', 'Current', 'تيار'], ['gerilim', 'Voltage', 'جهد'],
    ['ve', 'and', 'و'], ['ile', 'with', 'مع'], ['için', 'for', 'لـ']
  ].sort(function (a, b) { return b[0].length - a[0].length; });
  function offlineName(s, lg) {
    var src = String(s || ''), low = src.toLocaleLowerCase('tr');
    if (low.length !== src.length) low = src.toLowerCase();
    var isL = function (ch) { return !!ch && /[a-zçğıöşüâîû0-9]/i.test(ch); };
    var out = '', i = 0, hit = 0;
    while (i < src.length) {
      var m = null;
      if (!isL(low[i - 1])) for (var k = 0; k < TERMS.length; k++) { var w = TERMS[k][0]; if (low.substr(i, w.length) === w && !isL(low[i + w.length])) { m = TERMS[k]; break; } }
      if (m) { out += m[lg === 'ar' ? 2 : 1]; i += m[0].length; hit++; } else { out += src[i]; i++; }
    }
    return { text: out.replace(/\s+/g, ' ').trim(), hit: hit };
  }
  function nameCache(v) {
    if (v) return F().settings.set('invoice_name_tr', JSON.stringify(v)).catch(function () {});
    return Promise.resolve(F().settings.get('invoice_name_tr')).then(function (x) { var o = jparse(x, {}); return o && typeof o === 'object' ? o : {}; }, function () { return {}; });
  }
  function translateNames(list, lg) {
    var uniq = list.filter(function (x, i) { return list.indexOf(x) === i; });
    if (lg === 'tr') { var id = {}; uniq.forEach(function (x) { id[x] = x; }); return Promise.resolve({ map: id, src: 'same' }); }
    return nameCache().then(function (cache) {
      var c = cache[lg] || {}, miss = uniq.filter(function (x) { return c[x] == null; });
      var done = function (src) { var map = {}; uniq.forEach(function (x) { map[x] = c[x] != null ? c[x] : x; }); return { map: map, src: src }; };
      if (!miss.length) return done('ai');
      var ai = window.FalconFaturaPdf && window.FalconFaturaPdf.translate;
      return (ai ? ai(miss, lg) : Promise.reject(new Error('no-ai'))).then(function (arr) {
        miss.forEach(function (x, i) { var v = String(arr[i] == null ? '' : arr[i]).trim(); if (v) c[x] = v; });
        cache[lg] = c; nameCache(cache); return done('ai');
      }, function () {
        // çevrimdışı: önbelleğe yazılmaz (internet gelince yapay zekâ ile yeniden çevrilir)
        var map = {}; uniq.forEach(function (x) { map[x] = c[x] != null ? c[x] : offlineName(x, lg).text; });
        return { map: map, src: 'offline' };
      });
    });
  }
  function savePdf(inv) {
    return (CFG ? Promise.resolve(CFG) : loadCfg()).then(function (cfg) {
      var name = (DOC[inv.lang] || DOC.tr).title.replace(/\s/g, '') + '-' + String(inv.number).replace(/[^\w.-]+/g, '_') + '.pdf';
      return F().report.savePdf(invoiceHtml(inv, cfg, true), name);
    });
  }

  // ---------- küçük DOM yardımcıları ----------
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else if (k === 'value') e.value = v; else e.setAttribute(k, v === true ? '' : v);
    }
    (kids || []).forEach(function (c) { if (c != null && c !== false) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function field(label, input, opts) {
    opts = opts || {};
    return el(opts.group ? 'div' : 'label', { class: 'field span-' + (opts.span || 1) }, [el('span', { class: 'field-label', text: label }), input, opts.hint ? el('span', { class: 'field-hint', text: opts.hint }) : null]);
  }
  function modal(title, bodyKids, footerKids, size) {
    var bd = el('div', { class: 'modal-backdrop fat-modal' });
    var close = function () { if (bd.parentNode) bd.parentNode.removeChild(bd); document.removeEventListener('keydown', onKey); };
    var onKey = function (e) { if (e.key !== 'Escape') return; var all = document.querySelectorAll('.modal-backdrop'); if (all[all.length - 1] === bd) { e.stopPropagation(); close(); } };
    var box = el('div', { class: 'modal ' + (size || 'wide'), dir: document.documentElement.dir || 'ltr' }, [
      el('div', { class: 'modal-header' }, [el('h2', { text: title }), el('button', { type: 'button', class: 'icon-btn', 'aria-label': t('close'), text: '✕', onclick: function () { close(); } })]),
      el('div', { class: 'modal-body' }, bodyKids),
      footerKids && footerKids.length ? el('div', { class: 'modal-footer' }, footerKids) : null
    ]);
    box.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    bd.addEventListener('mousedown', function () { close(); });
    bd.appendChild(box); document.body.appendChild(bd); document.addEventListener('keydown', onKey);
    return { close: close, box: box };
  }
  function opt(v, label, sel) { return el('option', { value: v, text: label, selected: sel ? 'selected' : null }); }

  // ---------- stil ----------
  function style() {
    if (document.getElementById('fatura-falcon-css')) return;
    var s = document.createElement('style'); s.id = 'fatura-falcon-css';
    s.textContent =
      '.fat-sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}' +
      '.fat-sum .card{padding:14px 16px}.fat-sum .cur{font-weight:700;margin-bottom:8px;display:flex;justify-content:space-between;opacity:.9}' +
      '.fat-sum .ln{display:flex;justify-content:space-between;gap:8px;margin:4px 0;font-size:13.5px;line-height:1.35;align-items:baseline}.fat-sum .ln b{font-variant-numeric:tabular-nums}' +
      '.fat-sum .ok{color:#22a06b}.fat-sum .wait{color:#e2a400}' +
      '.fat-st{display:inline-block;border-radius:999px;padding:3px 10px;font-size:11.5px;font-weight:700;white-space:nowrap}' +
      '.fat-st.paid{background:#22a06b26;color:#22a06b}.fat-st.partial{background:#e2a40026;color:#d69500}.fat-st.pending{background:#e5484d22;color:#e5484d}.fat-st.cancelled{background:#94a3b833;color:#94a3b8;text-decoration:line-through}' +
      '.fat-acts{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;max-width:340px;margin-inline-start:auto}.fat-acts .btn{padding:5px 10px;font-size:12.5px}' +
      '.fat-num{font-variant-numeric:tabular-nums;white-space:nowrap}.fat-no{font-weight:700;white-space:nowrap}' +
      '.fat-seg{display:flex;gap:4px;padding:4px;border:1px solid var(--border,#3a4458);border-radius:10px}.fat-seg button{flex:1;border:0;background:none;color:inherit;padding:8px 10px;border-radius:7px;cursor:pointer;font:inherit;opacity:.75}.fat-seg button.on{background:#0ea5e926;color:#38bdf8;font-weight:700;opacity:1}.fat-pv-sg{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}.fat-items{width:100%;border-collapse:collapse}.fat-items th{font-size:12px;text-align:start;opacity:.75;padding:4px 4px;font-weight:600}' +
      '.fat-items td{padding:3px 4px;vertical-align:top}.fat-items td.l{padding-top:12px}.fat-items td:last-child{padding-top:6px}.fat-items .nmc{position:relative}.fat-items textarea.nm{width:100%;min-width:0;display:block;resize:none;overflow:hidden;line-height:1.4;min-height:38px;padding-inline-end:26px;white-space:pre-wrap;font:inherit}.fat-sug-b{position:absolute;inset-inline-end:10px;top:11px;border:0;background:none;color:inherit;opacity:.6;cursor:pointer;font-size:12px;padding:2px}.fat-sug-b:hover{opacity:1}.fat-sug{position:absolute;z-index:30;inset-inline:4px;top:calc(100% - 2px);max-height:240px;overflow:auto;background:var(--surface,var(--card,#1b2333));border:1px solid var(--border,#3a4458);border-radius:8px;box-shadow:0 8px 24px #0006;padding:4px}.fat-sug[hidden]{display:none}.fat-sug .o{padding:6px 10px;border-radius:6px;cursor:pointer;white-space:pre-line;font-size:13.5px}.fat-sug .o:hover{background:#ffffff14}.fat-items input{width:100%;min-width:0}.fat-items .q{width:76px}.fat-items .u{width:80px}.fat-items .p{width:120px}.fat-items .l{width:120px;text-align:end;font-variant-numeric:tabular-nums;white-space:nowrap}' +
      '.fat-tot{display:flex;flex-direction:column;align-items:flex-end;gap:4px;font-size:14px}.fat-tot div{display:flex;gap:18px;justify-content:space-between;min-width:260px}.fat-tot .g{font-weight:800;font-size:16px;border-top:1px solid var(--border,#334);padding-top:6px}' +
      '.fat-cash{border:1px solid var(--border,#334);border-radius:12px;padding:12px 14px}.fat-cash .segmented{margin:6px 0 8px;flex-wrap:wrap}.fat-cash .segmented button{flex:1;min-width:140px}' +
      '.fat-pv{background:#7d8595;border-radius:10px;padding:14px;overflow:auto;max-height:70vh}.fat-pv-host{transform-origin:top left;margin:0 auto}' +
      '.fat-pv-steps{display:flex;flex-direction:column;gap:8px;margin-bottom:10px;padding:10px 12px;border:1px solid var(--border,#ffffff1f);border-radius:12px}.fat-pv-st{display:flex;align-items:center;gap:10px;flex-wrap:wrap}' +
      '.fat-pv-st .n{width:22px;height:22px;border-radius:50%;background:#0ea5e9;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;flex:none}.fat-pv-st>b{min-width:120px}' +
      '.fat-pv-st .fat-seg{flex:0 1 auto}.fat-pv-st .fat-seg button{padding:6px 14px;white-space:nowrap}.fat-pv-st .field-hint{flex:1;min-width:220px;margin:0}.fat-pv-nm{font-size:12.5px;opacity:.85}.fat-pv-nm.busy{color:#38bdf8}' +
      '.fat-pv-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px}.fat-pv-bar select{width:auto;min-width:150px}.fat-pv-bar .sp{flex:1}' +
      '.fat-pv-tag{display:inline-block;border-radius:999px;padding:3px 10px;font-size:11.5px;font-weight:700;background:#e2a40026;color:#d69500}' +
      '.fat-img{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.fat-img .pv{width:170px;height:80px;border-radius:8px;background:#fff;display:flex;align-items:center;justify-content:center;border:1px solid var(--border,#334)}.fat-img .pv img{max-width:160px;max-height:72px}' +
      '.fat-img .pv.dark{background:#13213b}' +
      '.fat-ff{display:flex;flex-direction:column;gap:6px}.fat-ff .r{display:grid;grid-template-columns:28px minmax(110px,1fr) minmax(140px,2fr) 70px auto;gap:6px;align-items:center}' +
      '.fat-ff .r.off input:not([type=checkbox]){opacity:.5}.fat-ff .r .bt{display:flex;gap:2px}.fat-ff .hd{font-size:12px;opacity:.7;font-weight:600}.fat-ff select{width:auto}' +
      '.fat-ff-t{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}' +
      '@media (max-width:720px){.fat-ff .r{grid-template-columns:26px 1fr 1fr;}.fat-ff .r select,.fat-ff .r .bt{grid-column:auto}.fat-ff-t{grid-template-columns:1fr 1fr}}' +
      '.fat-pays{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}.fat-pays .row{display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid var(--border,#334);border-radius:10px;padding:8px 10px}' +
      '.fat-overdue{color:#e5484d;font-size:11.5px;display:block}' +
      '.pm-pick{display:flex;flex-direction:column;gap:6px}.pm-seg{flex-wrap:wrap}.pm-seg button{flex:1;min-width:92px}' +
      '.pm-pill{display:inline-block;margin-inline-start:6px;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:700;background:#38bdf826;color:#0ea5e9}' +
      '.pm-pill.pm-other{background:#94a3b833;color:#94a3b8}' +
      '.pm-totals{padding:10px 14px;display:flex;flex-direction:column;gap:6px}.pm-totals-h{font-size:12px;font-weight:700;opacity:.75;text-transform:uppercase;letter-spacing:.05em}' +
      '.pm-row{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;font-size:13px}.pm-chip{border:1px solid var(--border,#334);border-radius:999px;padding:3px 10px;font-variant-numeric:tabular-nums}' +
      '.pm-chip.pm-shamcash{border-color:#22a06b88}.pm-chip.pm-bank{border-color:#0ea5e988}' +
      // v1.60
      '.fat-tabs{display:flex;gap:4px;padding:4px;border:1px solid var(--border,#3a4458);border-radius:12px;width:max-content;max-width:100%;overflow-x:auto}.fat-tabs button{border:0;background:none;color:inherit;padding:8px 16px;border-radius:9px;cursor:pointer;font:inherit;font-weight:600;opacity:.72;white-space:nowrap}.fat-tabs button.on{background:#0ea5e926;color:#38bdf8;opacity:1}' +
      '.fat-sec{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.fat-sec .section-title{margin:0}.fat-sec .sp{flex:1}.fat-pdfbtn{border-color:#0ea5e988}' +
      '.fat-cust-tag{font-size:12px;border-radius:999px;padding:2px 10px;background:#e2a40022;color:#d69500}.fat-cust-tag:empty{display:none}.fat-cust-tag.ok{background:#22a06b22;color:#22a06b}' +
      '.fat-acw{position:relative}.fat-acw input{width:100%;padding-inline-end:28px}.fat-acw .fat-sug-b{top:10px}.fat-acw .fat-sug{inset-inline:0;top:100%}.fat-sug .o b{display:block}.fat-sug .o .small{display:block}' +
      '.fat-inrow{display:flex;gap:6px;align-items:center}.fat-inrow input{flex:1;min-width:0}.fat-inrow select{width:auto}' +
      '.fat-items-wrap{overflow-x:auto;max-width:100%}.fat-items .dp{width:76px}.fat-items .cd{width:130px}.fat-items .v{width:64px}.fat-items .cx{width:110px}.fat-items td.no{padding-top:12px;opacity:.7;text-align:center;width:28px}' +
      '.fat-items td.nmc{min-width:220px}.fat-items .p{width:104px}.fat-qu{display:flex;gap:4px}.fat-qu .q{width:70px}.fat-qu .u{width:64px}.fat-items th{white-space:nowrap}' +
      '.fat-busy{display:flex;align-items:center;gap:12px;font-weight:600;padding:8px 2px}.fat-busy .spin{width:20px;height:20px;border:3px solid #38bdf855;border-top-color:#38bdf8;border-radius:50%;animation:fatspin .8s linear infinite}@keyframes fatspin{to{transform:rotate(360deg)}}' +
      '.fat-imp-src{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:6px}.fat-imp-st{border-radius:10px;padding:8px 12px;margin:6px 0 10px;font-weight:600}.fat-imp-st.ok{background:#22a06b1f;color:#22a06b}.fat-imp-st.new{background:#0ea5e91f;color:#38bdf8}.fat-imp-st.warn{background:#e2a4001f;color:#d69500}' +
      '.fat-imp-v{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center}.fat-imp-v .btn.link{padding:0 4px;min-height:0;background:none;border:0;color:inherit;text-decoration:underline;cursor:pointer;font-weight:600}' +
      '.fat-imp-dl{flex-basis:100%;margin:4px 0 0;padding-inline-start:18px;font-weight:500;font-size:12.5px;line-height:1.55}.fat-imp-t tr.fat-imp-diff td{background:#e2a40018}.fat-imp-t tr.fat-imp-diff td:first-child{box-shadow:inset 3px 0 #d69500}' +
      '.fat-imp-ms{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:6px 14px}.fat-imp-m{display:flex;gap:6px;align-items:center;font-size:13px}.fat-imp-m b{overflow-wrap:anywhere}' +
      '.fat-fx{border:1px solid var(--border,#ffffff1f);border-radius:12px;padding:10px 12px}.fat-fx-h{display:flex;align-items:center;gap:8px;margin-bottom:6px}.fat-fx-h .sp{flex:1}' +
      '.fat-fx-r{display:flex;flex-wrap:wrap;gap:10px 18px}.fat-fx-i{display:flex;align-items:center;gap:6px;font-weight:600;white-space:nowrap}.fat-fx-i input{width:130px}.fat-fx-i input.bad{border-color:#e5484d}' +
      '.fat-fx-cv{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px}.fat-fx-cv select{width:auto;min-width:120px}' +
      '.fat-mk{border:1px solid var(--border,#ffffff1f);border-radius:12px;padding:10px 12px;margin-top:8px}.fat-mk-r{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:6px 0}.fat-mk-r input{width:96px}' +
      '.fat-mk-c{padding:3px 10px;border-radius:999px;border:1px solid var(--border,#ffffff2a);background:none;color:inherit;cursor:pointer;font-weight:600}.fat-mk-c.on{background:#22a06b2a;border-color:#22a06b;color:#22a06b}' +
      '.fat-mk-s{font-weight:600;color:#22a06b}.fat-mk-s.z{color:inherit;opacity:.65;font-weight:500}' +
      '.fat-pw{display:flex;gap:4px;align-items:center;position:relative}.fat-mk-b{min-width:30px;height:30px;padding:0 6px;border-radius:8px;border:1px solid var(--border,#ffffff2a);background:none;color:inherit;cursor:pointer;font-size:12px;font-weight:700;white-space:nowrap}' +
      '.fat-mk-b.on{background:#22a06b2a;border-color:#22a06b;color:#22a06b}.fat-mk-p{position:fixed;z-index:100000;background:var(--surface,#0f1a2b);border:1px solid var(--border,#ffffff2a);border-radius:10px;padding:8px;box-shadow:0 8px 24px #0006;display:flex;flex-direction:column;gap:6px;min-width:210px}' +
      '.fat-mk-p .fat-mk-r{margin:0}.fat-mk-p input{width:80px}.fat-mk-p .b{font-size:12px;opacity:.75}.fat-tot .mk span,.fat-tot .mk b{color:#22a06b;font-weight:600}' +
      '.fat-imp-bulk{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:4px 0 8px}.fat-imp-bulk .sp{flex:1}.fat-imp-t tr.off td{opacity:.45}.fat-imp-t tr.off td:first-child{opacity:1}' +
      '.fat-imp-t .nm2{min-width:240px}.fat-imp-t .cd{width:140px}.fat-imp-t .q{width:70px}.fat-imp-t .u{width:64px}.fat-imp-t .p{width:100px}.fat-imp-t .v{width:56px}.fat-imp-sel{max-width:260px}' +
      '.fat-click{cursor:pointer}.fat-hist{margin-top:14px}.fat-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}.fat-chks{display:flex;gap:18px;flex-wrap:wrap}' +
      '.fat-lay .r{grid-template-columns:28px minmax(160px,1fr) 44px 96px}.fat-lay .r .bt{justify-content:flex-end}' +
      '@media (max-width:720px){.fat-items .u{display:none}.fat-items th.uh{display:none}.fat-items .p,.fat-items .l{width:92px}.fat-tbl .hide-m{display:none}.fat-acts{flex-wrap:wrap}.fat-acts .btn{padding:4px 8px}}' +
      '@media (max-width:720px){.fat-items .fat-qu .u{display:block}.fat-tabs button{padding:8px 10px}}';
    document.head.appendChild(s);
  }

  // ---------- sayfa ----------
  function mount(root, app) {
    style();
    var alive = true, flt = { q: '', st: '', cur: '', from: '', to: '' };
    var ctx = app || {};
    var toast = function (m, ty) { try { if (ctx.toast) return ctx.toast(m, ty); } catch (e) {} };
    var errText = function (e) { var c = e && (e.code || e.message); return (ERR[lang()] || ERR.tr)[c] || (ERR.tr[c]) || null; };
    var run = function (name, payload, okMsg) {
      if (ctx.run) {
        // app.run bilinen hataları kendisi gösterir; faturaya özgü kodları biz çeviririz
        // app.run hatayı kendisi gösterir (fatura hata metinleri pakete eklendi)
        return ctx.run(name, payload, { silent: true }).then(function (r) { if (okMsg) toast(okMsg); return r; });
      }
      return F().call(name, payload).then(function (r) { if (!r.ok) { var e = new Error(r.error); e.code = r.error; toast(errText(e) || r.error, 'error'); throw e; } if (okMsg) toast(okMsg); return r.data; });
    };
    var confirmBox = function (m) { return ctx.confirm ? ctx.confirm(m) : Promise.resolve(window.confirm(m)); };

    var head = el('div', { class: 'toolbar' });
    var sumBox = el('div', { class: 'fat-sum' });
    var listBox = el('div', { class: 'card table-card' });
    // v1.60: Faturalar | Müşteriler | Ürünler
    var tab = 'inv';
    var tabsBar = el('div', { class: 'fat-tabs', role: 'tablist' });
    var invBox = el('div', { class: 'stack' }, [head, sumBox, listBox]);
    var custBox = el('div', { class: 'stack', style: 'display:none' });
    var prodBox = el('div', { class: 'stack', style: 'display:none' });
    var wrap = el('div', { class: 'stack fatura-page' }, [tabsBar, invBox, custBox, prodBox]);
    root.innerHTML = ''; root.appendChild(wrap);
    function drawTabs() {
      tabsBar.innerHTML = '';
      [['inv', '🧾 ' + t('tabInv')], ['cust', '👥 ' + t('tabCust')], ['prod', '📦 ' + t('tabProd')]].forEach(function (x) {
        tabsBar.appendChild(el('button', { type: 'button', role: 'tab', class: tab === x[0] ? 'on' : '', 'aria-selected': tab === x[0] ? 'true' : 'false', text: x[1], onclick: function () { showTab(x[0]); } }));
      });
    }
    function showTab(k) {
      tab = k; drawTabs();
      invBox.style.display = k === 'inv' ? '' : 'none'; custBox.style.display = k === 'cust' ? '' : 'none'; prodBox.style.display = k === 'prod' ? '' : 'none';
      if (k === 'inv') load(); else if (k === 'cust') loadCust(); else loadProd();
    }
    function reload() { if (tab === 'cust') return loadCust(); if (tab === 'prod') return loadProd(); return load(); }

    function drawHead() {
      head.innerHTML = '';
      var qIn = el('input', { type: 'search', placeholder: t('search'), value: flt.q, oninput: function (e) { flt.q = e.target.value; load(); } });
      var stSel = el('select', { onchange: function (e) { flt.st = e.target.value; load(); } }, [opt('', t('all'), !flt.st)].concat(['pending', 'partial', 'paid', 'cancelled'].map(function (s) { return opt(s, t('st_' + s), flt.st === s); })));
      var cuSel = el('select', { onchange: function (e) { flt.cur = e.target.value; load(); } }, [opt('', t('allCur'), !flt.cur)].concat(CUR.map(function (c) { return opt(c, c + ' · ' + SYM[c], flt.cur === c); })));
      var fr = el('input', { type: 'date', value: flt.from, title: t('from'), onchange: function (e) { flt.from = e.target.value; load(); } });
      var to = el('input', { type: 'date', value: flt.to, title: t('to'), onchange: function (e) { flt.to = e.target.value; load(); } });
      head.appendChild(el('div', { class: 'filters' }, [el('div', { class: 'search' }, [qIn]), stSel, cuSel, fr, to]));
      head.appendChild(el('div', { class: 'actions' }, [
        el('button', { type: 'button', class: 'btn', text: '⚙ ' + t('settings'), onclick: function () { openSettings(); } }),
        el('button', { type: 'button', class: 'btn', title: t('fromPdfHint'), text: '📄 ' + t('fromPdf'), onclick: function () { pickPdf(function (data) { openEditor(null, data); }); } }),
        el('button', { type: 'button', class: 'btn primary', text: '+ ' + t('newInv'), onclick: function () { openEditor(null); } })
      ]));
    }

    var seq = 0;
    function load() {
      var my = ++seq;
      var w = [], p = [];
      if (flt.st) { w.push('status = ?'); p.push(flt.st); }
      if (flt.cur) { w.push('currency_code = ?'); p.push(flt.cur); }
      if (flt.from) { w.push('date >= ?'); p.push(flt.from); }
      if (flt.to) { w.push('date <= ?'); p.push(flt.to); }
      if (flt.q.trim()) { w.push("lower(number || ' ' || customer_name || ' ' || COALESCE(customer_phone,'') || ' ' || COALESCE(note,'') || ' ' || items) LIKE '%' || lower(?) || '%'"); p.push(flt.q.trim()); }
      return Promise.all([
        q('SELECT * FROM invoices' + (w.length ? ' WHERE ' + w.join(' AND ') : '') + ' ORDER BY date DESC, id DESC LIMIT 1000', p),
        q('SELECT COUNT(*) AS n FROM invoices')
      ]).then(function (r) { if (!alive || my !== seq) return; drawSum(r[0]); drawList(r[0], r[1][0] ? r[1][0].n : 0); })
        .catch(function (e) { listBox.textContent = String(e && e.message || e); });
    }
    function drawSum(rows) {
      sumBox.innerHTML = '';
      var by = {};
      rows.forEach(function (r) { if (r.status === 'cancelled') return; var b = by[r.currency_code] || (by[r.currency_code] = { n: 0, total: 0, paid: 0 }); b.n++; b.total += r.total; b.paid += r.paid; });
      Object.keys(by).sort(function (a, b) { return CUR.indexOf(a) - CUR.indexOf(b); }).forEach(function (c) {
        var b = by[c];
        sumBox.appendChild(el('div', { class: 'card' }, [
          el('div', { class: 'cur' }, [el('span', { text: c + ' · ' + SYM[c] }), el('span', { class: 'muted', text: b.n + ' ' + t('count') })]),
          el('div', { class: 'ln' }, [el('span', { text: t('sumTotal') }), el('b', { dir: 'ltr', text: money(b.total, c) })]),
          el('div', { class: 'ln ok' }, [el('span', { text: t('sumPaid') }), el('b', { dir: 'ltr', text: money(b.paid, c) })]),
          el('div', { class: 'ln wait' }, [el('span', { text: t('sumOpen') }), el('b', { dir: 'ltr', text: money(rnd(b.total - b.paid, c), c) })])
        ]));
      });
    }
    function drawList(rows, all) {
      listBox.innerHTML = '';
      if (!rows.length) { listBox.appendChild(el('div', { class: 'empty-state', style: 'padding:28px;text-align:center', text: all ? t('noMatch') : t('empty') })); return; }
      var td = today();
      var tb = el('tbody', null, rows.map(function (r) {
        var rem = rnd(r.total - r.paid, r.currency_code);
        var over = r.due_date && r.due_date < td && (r.status === 'pending' || r.status === 'partial');
        var acts = [
          el('button', { type: 'button', class: 'btn', title: t('preview'), text: '👁', onclick: function () { openPreview(r); } }),
          el('button', { type: 'button', class: 'btn', text: '⬇ ' + t('pdf'), onclick: function () { openPreview(r); } }),
          r.status !== 'cancelled' ? el('button', { type: 'button', class: 'btn ' + (rem > 0 ? 'success' : ''), text: rem > 0 ? '₊ ' + t('pay') : t('payments'), onclick: function () { openPay(r); } }) : null,
          el('button', { type: 'button', class: 'btn', text: '✎', title: t('edit'), onclick: function () { openEditor(r); } }),
          el('button', { type: 'button', class: 'btn', title: r.status === 'cancelled' ? t('uncancel') : t('cancel'), text: r.status === 'cancelled' ? '↺' : '⊘', onclick: function () { toggleCancel(r); } }),
          el('button', { type: 'button', class: 'btn danger-soft', title: t('del'), text: '🗑', onclick: function () { del(r); } })
        ];
        return el('tr', null, [
          el('td', { class: 'fat-no', dir: 'ltr', text: r.number }),
          el('td', { class: 'nowrap', text: dmy(r.date) }, [over ? el('span', { class: 'fat-overdue', text: '⚠ ' + t('overdue') + ' · ' + dmy(r.due_date) }) : null]),
          el('td', { text: r.customer_name }),
          el('td', { class: 'num fat-num', dir: 'ltr', text: money(r.total, r.currency_code) }),
          el('td', { class: 'num fat-num hide-m', dir: 'ltr', text: money(r.paid, r.currency_code) }),
          el('td', { class: 'num fat-num', dir: 'ltr', text: r.status === 'cancelled' ? '—' : money(rem, r.currency_code) }),
          el('td', null, [el('span', { class: 'fat-st ' + r.status, text: t('st_' + r.status) })]),
          el('td', null, [el('div', { class: 'fat-acts' }, acts)])
        ]);
      }));
      listBox.appendChild(el('table', { class: 'table fat-tbl' }, [
        el('thead', null, [el('tr', null, [t('no'), t('date'), t('customer'), t('total'), t('paid'), t('remaining'), t('status'), ''].map(function (h, i) { return el('th', { class: (i >= 3 && i <= 5 ? 'num' : '') + (i === 4 ? ' hide-m' : ''), text: h }); }))]),
        tb
      ]));
    }

    function del(r) {
      confirmBox(t('confirmDel')).then(function (ok) { if (ok) run('deleteInvoice', { id: r.id }, t('deleted')).then(load, function () {}); });
    }
    function toggleCancel(r) {
      var c = r.status !== 'cancelled';
      (c ? confirmBox(t('confirmCancel')) : Promise.resolve(true)).then(function (ok) { if (ok) run('setInvoiceCancelled', { id: r.id, cancelled: c }, t('saved')).then(load, function () {}); });
    }

    // ----- önizleme -----
    // opts: { tag: rozet metni, onChange(template, lang): düzenleyiciye geri yazar, extra: ek alt düğmeler (function(m) → [düğme]), cfg: ayarlar yerine kullanılacak }
    // v1.63: çıktı akışı — 1) dil  2) önizle ve düzelt (ürün adları olduğu gibi / çevrilmiş)  3) PDF
    function openPreview(inv, opts) {
      opts = opts || {};
      (opts.cfg ? Promise.resolve(opts.cfg) : CFG ? Promise.resolve(CFG) : loadCfg()).then(function (cfg) {
        var cur = Object.assign({}, inv);
        if (!DOC[cur.lang]) cur.lang = lang();
        var host = el('div', { class: 'fat-pv-host', style: 'width:210mm' });
        var sr = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
        var pv = el('div', { class: 'fat-pv' }, [host]);
        var zoom = 'fit', editing = false, edited = false;
        var names = pvNamesPref(), tr = { lg: '', map: null, src: '', busy: false };
        var view = function () {
          if (names !== 'tr' || !tr.map || tr.lg !== cur.lang) return cur;
          var its = jparse(cur.items, []); if (!Array.isArray(its)) its = [];
          return Object.assign({}, cur, { items: JSON.stringify(its.map(function (it) {
            var o = Object.assign({}, it);
            if (tr.map[String(it.name || '')] != null) o.name = tr.map[String(it.name || '')];
            if (it.unit) o.unit = unitTr(it.unit, cur.lang);
            return o;
          })) });
        };
        var render = function () {
          var h = invoiceHtml(view(), cfg, false);
          sr.innerHTML = '<style>' + h.css.replace(/@page[^{]*\{[^}]*\}/g, '') + '.inv{box-shadow:0 6px 30px rgba(0,0,0,.35)}.inv[contenteditable] *:hover{outline:1px dashed #38bdf8aa}.inv[contenteditable]:focus{outline:none}</style>' + h.body;
          if (edited) toast(t('pvEditLost'));
          edited = false; setEdit(editing);
          setTimeout(fit, 0);
        };
        var fit = function () {
          var full = host.offsetWidth || 794, hh = Math.max(1123, (sr.firstElementChild && sr.querySelector('.inv') ? sr.querySelector('.inv').offsetHeight : 1123));
          var k = zoom === 'fit' ? Math.min(1, (pv.clientWidth - 28) / full) : 1;
          host.style.transform = 'scale(' + k + ')'; host.style.height = (hh * k) + 'px'; host.style.marginBottom = '0';
        };
        var changed = function () { if (opts.onChange) opts.onChange(cur.template, cur.lang); };
        // 1) dil
        var lgBox = el('div', { class: 'fat-seg fat-pv-lg' });
        var drawLg = function () {
          lgBox.innerHTML = '';
          [['tr', 'Türkçe'], ['en', 'English'], ['ar', 'العربية']].forEach(function (x) {
            lgBox.appendChild(el('button', { type: 'button', class: cur.lang === x[0] ? 'on' : '', dir: x[0] === 'ar' ? 'rtl' : 'ltr', text: x[1], onclick: function () {
              if (cur.lang === x[0]) return; cur.lang = x[0]; drawLg(); changed(); ensureNames().then(render); render();
            } }));
          });
        };
        // ürün adları
        var nmBox = el('div', { class: 'fat-seg' });
        var nmInfo = el('span', { class: 'fat-pv-nm' });
        var drawNm = function () {
          nmBox.innerHTML = '';
          [['keep', t('pvNamesKeep')], ['tr', t('pvNamesTr')]].forEach(function (x) {
            nmBox.appendChild(el('button', { type: 'button', class: names === x[0] ? 'on' : '', text: x[1], onclick: function () {
              if (names === x[0]) return; names = x[0]; pvNamesPref(names); drawNm(); ensureNames().then(render); render();
            } }));
          });
          nmInfo.className = 'fat-pv-nm' + (tr.busy ? ' busy' : '');
          nmInfo.textContent = names !== 'tr' ? '' : tr.busy ? '⏳ ' + t('pvNamesBusy') : tr.lg === cur.lang && tr.src ? (tr.src === 'ai' ? '✓ ' + t('pvNamesAi') : tr.src === 'same' ? t('pvNamesSame') : '⚠ ' + t('pvNamesOffline')) : '';
        };
        var ensureNames = function () {
          if (names !== 'tr' || (tr.lg === cur.lang && tr.map)) { drawNm(); return Promise.resolve(); }
          var its = jparse(cur.items, []); if (!Array.isArray(its)) its = [];
          var list = its.map(function (it) { return String(it.name || ''); }).filter(Boolean);
          var lg = cur.lang;
          tr.busy = true; drawNm();
          return translateNames(list, lg).then(function (r) {
            if (cur.lang !== lg) return;
            tr = { lg: lg, map: r.map, src: r.src, busy: false }; drawNm();
          }, function () { tr.busy = false; drawNm(); });
        };
        // 2) düzelt
        var edBtn = el('button', { type: 'button', class: 'btn small' });
        var setEdit = function (on) {
          editing = on;
          var x = sr.querySelector && sr.querySelector('.inv');
          if (x) { if (on) { x.setAttribute('contenteditable', 'true'); x.setAttribute('spellcheck', 'false'); } else x.removeAttribute('contenteditable'); }
          edBtn.className = 'btn small' + (on ? ' primary' : '');
          edBtn.textContent = on ? '✓ ' + t('pvEditOff') : '✎ ' + t('pvEditOn');
        };
        edBtn.onclick = function () { setEdit(!editing); if (editing) { var x = sr.querySelector('.inv'); if (x) try { x.focus(); } catch (e) {} } };
        sr.addEventListener && sr.addEventListener('input', function () { edited = true; });
        var tplSel = el('select', { onchange: function (e) { cur.template = [e.target.value].concat(tplFlagList(cur.template)).join('|'); render(); changed(); } },
          TEMPLATES.map(function (x) { return opt(x, t('tpl' + x.charAt(0).toUpperCase() + x.slice(1)), tplOf(cur.template) === x); }));
        var sgCb = el('input', { type: 'checkbox', onchange: function (e) { cur.template = withSign(cur.template, e.target.checked); render(); changed(); } });
        sgCb.checked = hasSign(cur.template);
        var sdCb = el('input', { type: 'checkbox', onchange: function (e) { cur.template = withStatus(cur.template, e.target.checked); render(); changed(); } });
        sdCb.checked = hasStatus(cur.template);
        var pvFlag = function (f) { var x = el('input', { type: 'checkbox', onchange: function (e) { cur.template = withFlag(cur.template, f, e.target.checked); render(); changed(); } }); x.checked = hasFlagOn(cur.template, f); return x; };
        var pvLay = cfg.layout || {};
        var zb = el('button', { type: 'button', class: 'btn small', text: t('zoomFull'), onclick: function () { zoom = zoom === 'fit' ? 'full' : 'fit'; zb.textContent = zoom === 'fit' ? t('zoomFull') : t('zoomFit'); fit(); } });
        var steps = el('div', { class: 'fat-pv-steps' }, [
          el('div', { class: 'fat-pv-st' }, [el('span', { class: 'n', text: '1' }), el('b', { text: t('pvStepLang') }), lgBox]),
          el('div', { class: 'fat-pv-st' }, [el('span', { class: 'n', text: '2' }), el('b', { text: t('pvStepNames') }), nmBox, nmInfo]),
          el('div', { class: 'fat-pv-st' }, [el('span', { class: 'n', text: '3' }), el('b', { text: t('pvStepEdit') }), edBtn, el('span', { class: 'field-hint', text: t('pvEditHint') })])
        ]);
        var bar = el('div', { class: 'fat-pv-bar' }, [
          el('span', { class: 'field-label', text: t('template') }), tplSel,
          el('label', { class: 'check fat-pv-sg' }, [sgCb, el('span', { text: t('signOn') })]),
          el('label', { class: 'check fat-pv-sg' }, [sdCb, el('span', { text: t('statusOn') })]),
          pvLay.qr !== false ? el('label', { class: 'check fat-pv-sg' }, [pvFlag('nq'), el('span', { text: t('codeQr') })]) : null,
          pvLay.barcode !== false ? el('label', { class: 'check fat-pv-sg' }, [pvFlag('nb'), el('span', { text: t('codeBc') })]) : null,
          el('span', { class: 'sp' }), opts.tag ? el('span', { class: 'fat-pv-tag', text: opts.tag }) : null, zb
        ]);
        // 3) PDF: düzeltilmiş önizleme aynen PDF'e girer
        var pdfHtml = function () {
          var full = invoiceHtml(view(), cfg, true);
          var x = sr.querySelector && sr.querySelector('.inv');
          if (!edited || !x) return full;
          var c2 = x.cloneNode(true); c2.removeAttribute('contenteditable'); c2.removeAttribute('spellcheck');
          return full.replace(/<body>[\s\S]*<\/body>/, function () { return '<body>' + c2.outerHTML + '</body>'; });
        };
        var foot = [el('button', { type: 'button', class: 'btn', text: t('close'), onclick: function () { m.close(); } })];
        var m;
        if (opts.extra) foot = foot.concat(opts.extra(function () { return m; }, cur));
        else foot.push(el('button', { type: 'button', class: 'btn primary', text: '⬇ ' + t('pvPdf'), onclick: function (e) {
          var b = e.target; b.disabled = true;
          savePdfHtml(cur, pdfHtml()).then(function (x) { b.disabled = false; if (x !== null && x !== undefined) toast(t('pdfSaved')); }, function (er) { b.disabled = false; toast(String(er && er.message || er), 'error'); });
        } }));
        m = modal(t('previewTitle') + (cur.number ? ' · ' + cur.number : ''), [steps, bar, pv], foot, 'xwide');
        var onRs = function () { if (!pv.isConnected) { window.removeEventListener('resize', onRs); return; } fit(); };
        window.addEventListener('resize', onRs);
        drawLg(); drawNm(); render();
        ensureNames().then(function () { if (names === 'tr') render(); });
      });
    }
    // Ayarlardaki şirket bilgileriyle örnek fatura
    function sampleInv(cfg, d) {
      var c = CUR.indexOf(d.currency) >= 0 ? d.currency : 'USD', pl = perLineVat(cfg), tr = num(d.tax_rate);
      var items = [{ name: t('previewSampleItem1'), code: 'HZM.001', depot: 'D1', qty: 1, unit: t('unitPcs'), price: c === 'SYP' ? 1500000 : c === 'TRY' ? 25000 : 750 },
        { name: t('previewSampleItem2'), code: 'EGT.002', depot: 'D1', qty: 4, unit: t('unitHour'), price: c === 'SYP' ? 200000 : c === 'TRY' ? 3000 : 90 }];
      if (pl) items.forEach(function (it) { it.vat = tr; });
      var tt = calcTotals(items, 0, tr, c, pl);
      return { number: (cfg.prefix || 'FAL') + '-' + today().slice(0, 4) + '-0001', date: today(), due_date: '', customer_name: t('previewSampleCust'),
        customer_phone: '+90 555 000 00 00', customer_address: 'Örnek Mah. 1. Cad. No: 5', customer_tax: '1234567890', currency_code: c, items: JSON.stringify(items), subtotal: tt.subtotal, discount: 0, tax_rate: pl ? 0 : tr, tax: tt.tax,
        total: tt.total, paid: 0, status: 'pending', template: d.template || 'falcon', lang: d.lang || lang(), note: '',
        meta: JSON.stringify({ ettn: uuid(), scenario: d.scenario || 'TEMELFATURA', inv_type: d.inv_type || 'SATIS', customization: d.customization || 'TR1.2', issue_time: nowTime(), 'c.tax_office': 'Örnek V.D.', 'c.city': 'İSTANBUL' }) };
    }

    // ----- tahsilat -----
    function accountsFor(cur) { return q('SELECT id, name FROM cash_accounts WHERE currency_code = ? AND COALESCE(hidden,0) = 0 ORDER BY id', [cur]); }
    function openPay(inv) {
      Promise.all([accountsFor(inv.currency_code), q('SELECT p.*, a.name AS account_name FROM invoice_payments p LEFT JOIN cash_accounts a ON a.id = p.account_id WHERE p.invoice_id = ? ORDER BY p.date, p.id', [inv.id]),
        q('SELECT * FROM invoices WHERE id = ?', [inv.id])]).then(function (r) {
        var accs = r[0], pays = r[1], cur = r[2][0] || inv;
        var rem = rnd(cur.total - cur.paid, cur.currency_code);
        var list = el('div', { class: 'fat-pays' }, pays.length ? pays.map(function (p) {
          return el('div', { class: 'row' }, [
            el('div', null, [el('b', { dir: 'ltr', text: money(p.amount, cur.currency_code) }), el('div', { class: 'muted small', text: dmy(p.date) + (p.account_name ? ' · ' + p.account_name : '') + (p.note ? ' · ' + p.note : '') })]),
            el('button', { type: 'button', class: 'btn danger-soft', text: '🗑 ' + t('payDel'), onclick: function () {
              confirmBox(t('confirmPayDel')).then(function (ok) { if (ok) run('deleteInvoicePayment', { id: p.id }, t('deleted')).then(function () { m.close(); load(); openPay(inv); }, function () {}); });
            } })
          ]);
        }) : [el('div', { class: 'muted', text: t('payNone') })]);
        var kids = [list];
        var foot = [el('button', { type: 'button', class: 'btn', text: t('close'), onclick: function () { m.close(); } })];
        if (rem <= 0) kids.push(el('div', { class: 'notice', text: '✓ ' + t('payDone') }));
        else if (!accs.length) kids.push(el('div', { class: 'notice error', text: t('noAccount') }));
        else {
          var amt = el('input', { type: 'number', step: 'any', min: '0', value: String(rem), dir: 'ltr' });
          var dt = el('input', { type: 'date', value: today() });
          var ac = el('select', null, accs.map(function (a) { return opt(a.id, a.name, false); }));
          var nt = el('input', { value: '' });
          kids.push(el('div', { class: 'form' }, [
            field(t('payAmount') + ' (' + t('remaining') + ': ' + money(rem, cur.currency_code) + ')', amt, { hint: t('payAmountHint') }), field(t('payDate'), dt),
            field(t('account'), ac), field(t('payNote'), nt)
          ]));
          foot.push(el('button', { type: 'button', class: 'btn primary', text: t('pay'), onclick: function (e) {
            e.target.disabled = true;
            run('addInvoicePayment', { invoice_id: inv.id, amount: num(amt.value), date: dt.value, account_id: Number(ac.value), note: nt.value }, t('saved'))
              .then(function () { m.close(); load(); }, function () { e.target.disabled = false; });
          } }));
        }
        var m = modal(t('payTitle') + ' · ' + cur.number, kids, foot, '');
      });
    }

    // ----- fatura düzeneyici -----
    // pre: PDF'den / müşteri kartından gelen taslak (st alanlarının üzerine yazılır)
    function openEditor(inv, pre) {
      Promise.all([CFG ? Promise.resolve(CFG) : loadCfg(),
        q('SELECT id, name, code, unit, sale_price, cost_currency, vat_rate, depot FROM products ORDER BY name COLLATE NOCASE').catch(function () { return []; }),
        q('SELECT * FROM customers ORDER BY name COLLATE NOCASE').catch(function () { return []; }),
        q('SELECT customer_name, customer_phone, customer_email, customer_address, customer_tax FROM invoices ORDER BY id DESC LIMIT 400')]).then(function (r) {
        var cfg = r[0], products = r[1], customers = r[2], past = r[3];
        var dft = cfg.defaults || {};
        var isNew = !inv;
        var M0 = inv ? jparse(inv.meta, {}) || {} : {};
        var perLine = perLineVat(cfg);
        var dVat = dft.tax_rate != null && dft.tax_rate !== '' ? num(dft.tax_rate) : 0;
        var newItem = function () { var o = { name: '', qty: 1, unit: '', price: '' }; if (perLine) o.vat = dVat; return o; };
        var st = {
          number: inv ? inv.number : '', date: inv ? inv.date : today(), due_date: inv ? inv.due_date || '' : '',
          customer: inv ? inv.customer_name : '', customer_id: inv ? inv.customer_id || null : null, phone: inv ? inv.customer_phone || '' : '', email: inv ? inv.customer_email || '' : '',
          address: inv ? inv.customer_address || '' : '', tax_no: inv ? inv.customer_tax || '' : '',
          currency: inv ? inv.currency_code : (CUR.indexOf(dft.currency) >= 0 ? dft.currency : 'USD'),
          template: inv ? inv.template || 'falcon' : withVat(withStatus(dft.template || 'falcon', dft.status_stamp !== false), dft.vat_on !== false), lang: inv ? inv.lang || lang() : (dft.lang || lang()),
          items: inv ? jparse(inv.items, []) : [newItem()],
          discount: inv ? inv.discount || '' : '', tax_rate: inv ? inv.tax_rate || '' : (dft.tax_rate != null && dft.tax_rate !== '' ? dft.tax_rate : 0),
          note: inv ? inv.note || '' : '', cash: false, account_id: '', pay_amount: '',
          meta: {}, cx: {}
        };
        // başlık bilgileri ve müşterinin ek alanları (meta: 'c.<alan>')
        Object.keys(M0).forEach(function (k) { if (k.slice(0, 2) === 'c.') st.cx[k.slice(2)] = M0[k]; else st.meta[k] = M0[k]; });
        if (isNew) {
          if (layHas(cfg, 'meta', 'ettn')) st.meta.ettn = uuid();
          if (layHas(cfg, 'meta', 'issue_time')) st.meta.issue_time = nowTime();
          ['scenario', 'inv_type', 'customization'].forEach(function (k) { if (dft[k] && layHas(cfg, 'meta', k)) st.meta[k] = dft[k]; });
        }
        if (pre) {
          Object.keys(pre).forEach(function (k) { if (k !== 'meta' && k !== 'cx' && pre[k] !== undefined) st[k] = pre[k]; });
          if (pre.meta) Object.keys(pre.meta).forEach(function (k) { if (pre.meta[k]) st.meta[k] = pre.meta[k]; });
          if (pre.cx) Object.keys(pre.cx).forEach(function (k) { if (pre.cx[k]) st.cx[k] = pre.cx[k]; });
        }
        if (!Array.isArray(st.items) || !st.items.length) st.items = [newItem()];
        // satır KDV'si: eski (fatura geneli oranlı) faturada KDV sütunu açıksa kalemlere eski oran yazılır
        if (perLine) st.items.forEach(function (it) { if (it.vat == null || it.vat === '') it.vat = inv && !inv.meta && num(inv.tax_rate) ? num(inv.tax_rate) : dVat; });
        else if (st.items.some(function (it) { return it.vat != null && it.vat !== ''; })) perLine = true;
        var perLine0 = perLine, vatOn = hasVat(st.template);
        if (!vatOn) perLine = false;
        var calcCols = function () { return layOn(cfg, 'cols').filter(function (f) { return perLine || (f.k !== 'vat' && f.k !== 'vat_amount'); }); };
        var cols = calcCols();
        var unitCol = cols.some(function (f) { return f.k === 'unit'; });

        // ---- müşteri ----
        var custF = layOn(cfg, 'cust');
        var CMAP = { tax_no: 'tax_no', address: 'address', phone: 'phone', email: 'email' }; // faturanın kendi sütunları; diğerleri st.cx
        var cget = function (k) { return CMAP[k] ? st[CMAP[k]] : st.cx[k] || ''; };
        var cset = function (k, v) { if (CMAP[k]) st[CMAP[k]] = v; else st.cx[k] = v; };
        var cIn = {};
        var custLbl = el('span', { class: 'fat-cust-tag' });
        var showCustTag = function () {
          var c = st.customer_id ? customers.filter(function (x) { return x.id === st.customer_id; })[0] : null;
          custLbl.textContent = c ? '✓ ' + t('custLinked') : String(st.customer || '').trim() ? '＋ ' + t('custNew') : '';
          custLbl.className = 'fat-cust-tag' + (c ? ' ok' : '');
        };
        var fillCustomer = function (c) {
          st.customer = c.name; st.customer_id = c.id; custIn.value = c.name;
          var ex = jparse(c.extra, {}) || {};
          custF.forEach(function (f) {
            var v = f.custom ? ex[f.k] || '' : c[f.k] || '';
            cset(f.k, v); if (cIn[f.k]) cIn[f.k].value = v;
          });
          showCustTag();
        };
        var cSug = el('div', { class: 'fat-sug', hidden: true });
        var showCSug = function (all) {
          cSug.innerHTML = '';
          var qq = low(st.customer).trim();
          var list = customers.filter(function (c) { return all || !qq || low(c.name).indexOf(qq) >= 0 || String(c.tax_no || '').indexOf(qq) >= 0; }).slice(0, 12);
          // kayıtlı müşteri yoksa eski faturalardaki adlar önerilir
          var olds = [];
          if (qq) { var seen = {}; past.forEach(function (p) { var n = p.customer_name; if (!seen[n] && low(n).indexOf(qq) >= 0 && !customers.some(function (c) { return c.name === n; })) { seen[n] = 1; olds.push(p); } }); }
          if (!list.length && !olds.length) { cSug.hidden = true; return; }
          list.forEach(function (c) {
            cSug.appendChild(el('div', { class: 'o', onmousedown: function (e) { e.preventDefault(); cSug.hidden = true; fillCustomer(c); } }, [
              el('b', { text: c.name }), el('span', { class: 'muted small', text: [c.tax_no ? 'VKN ' + c.tax_no : '', c.city || '', c.phone || ''].filter(Boolean).join(' · ') })
            ]));
          });
          olds.slice(0, 6).forEach(function (p) {
            cSug.appendChild(el('div', { class: 'o', onmousedown: function (e) {
              e.preventDefault(); cSug.hidden = true; st.customer = p.customer_name; custIn.value = p.customer_name; st.customer_id = null;
              [['phone', 'customer_phone'], ['email', 'customer_email'], ['address', 'customer_address'], ['tax_no', 'customer_tax']].forEach(function (x) { if (p[x[1]]) { cset(x[0], p[x[1]]); if (cIn[x[0]]) cIn[x[0]].value = p[x[1]]; } });
              showCustTag();
            } }, [el('span', { text: p.customer_name }), el('span', { class: 'muted small', text: t('custFromOld') })]));
          });
          cSug.hidden = false;
        };
        var custIn = el('input', { value: st.customer, autocomplete: 'off', required: true,
          oninput: function (e) { st.customer = e.target.value; st.customer_id = null; showCustTag(); showCSug(false); },
          onfocus: function () { if (!st.customer) showCSug(true); },
          onkeydown: function (e) { if (e.key === 'Escape' && !cSug.hidden) { e.stopPropagation(); cSug.hidden = true; } },
          onblur: function () { setTimeout(function () { cSug.hidden = true; }, 150); } });
        var custWrap = el('div', { class: 'fat-acw' }, [custIn, customers.length ? el('button', { type: 'button', class: 'fat-sug-b', tabindex: '-1', title: t('custPick'), text: '▾', onmousedown: function (e) { e.preventDefault(); if (cSug.hidden) { custIn.focus(); showCSug(true); } else cSug.hidden = true; } }) : null, cSug]);
        var custFields = custF.map(function (f) {
          var ltr = { tax_no: 1, phone: 1, email: 1, web: 1, postal_code: 1 }[f.k];
          var x = el(f.k === 'address' ? 'textarea' : 'input', { rows: f.k === 'address' ? '2' : null, dir: ltr ? 'ltr' : null, value: cget(f.k), inputmode: f.k === 'phone' ? 'tel' : null,
            oninput: function (e) { cset(f.k, e.target.value); } });
          if (f.k === 'address') x.value = cget(f.k);
          cIn[f.k] = x;
          return field(fLabel('cust', f, lang()), x, { span: f.k === 'address' ? 2 : 1 });
        });
        showCustTag();

        // ---- fatura bilgileri ----
        var metaF = layOn(cfg, 'meta');
        var DL = { scenario: ['TEMELFATURA', 'TICARIFATURA', 'EARSIVFATURA', 'IHRACAT', 'KAMU', 'YOLCUBERABERFATURA'], inv_type: ['SATIS', 'IADE', 'TEVKIFAT', 'ISTISNA', 'OZELMATRAH', 'IHRACKAYITLI'], customization: ['TR1.2', 'TR1.2.1'] };
        var dlId = 'fat-dl-' + Date.now();
        var dls = [];
        var metaFields = metaF.map(function (f) {
          var x;
          if (f.k === 'date' || f.k === 'due_date') x = el('input', { type: 'date', value: st[f.k] || '', oninput: function (e) { st[f.k] = e.target.value; } });
          else if (f.k === 'number') x = el('input', { dir: 'ltr', value: st.number, placeholder: (cfg.prefix || 'FAL') + '-…', oninput: function (e) { st.number = e.target.value; } });
          else {
            var list = DL[f.k] ? dlId + f.k : null;
            if (list) dls.push(el('datalist', { id: list }, DL[f.k].map(function (v) { return el('option', { value: v }); })));
            x = el('input', { value: st.meta[f.k] || '', list: list, dir: { ettn: 1, issue_time: 1, customization: 1, campaign: 1, order_no: 1, waybill_no: 1 }[f.k] ? 'ltr' : null, oninput: function (e) { st.meta[f.k] = e.target.value; } });
            if (f.k === 'ettn') {
              var w = el('div', { class: 'fat-inrow' }, [x, el('button', { type: 'button', class: 'btn small', title: t('ettnNew'), text: '↻', onclick: function () { st.meta.ettn = uuid(); x.value = st.meta.ettn; } })]);
              return field(fLabel('meta', f, lang()), w, { span: 2, group: true });
            }
          }
          return field(fLabel('meta', f, lang()), x, f.k === 'number' ? { hint: t('invNoHint') } : null);
        });
        var curSel = el('select', { onchange: function (e) { var old = st.currency; st.currency = e.target.value; switchCurrency(old, st.currency); drawFx(); drawCash(); } }, CUR.map(function (c) { return opt(c, c + ' · ' + SYM[c], st.currency === c); }));
        var tplSel = el('select', { onchange: function (e) { st.template = [e.target.value].concat(tplFlagList(st.template)).join('|'); } }, TEMPLATES.map(function (x) { return opt(x, t('tpl' + x.charAt(0).toUpperCase() + x.slice(1)), tplOf(st.template) === x); }));
        var sgBox = el('div', { class: 'fat-seg' });
        var drawSg = function () {
          var on = hasSign(st.template);
          sgBox.innerHTML = '';
          [[true, '✍ ' + t('signOn')], [false, '⊘ ' + t('signOff')]].forEach(function (x) {
            sgBox.appendChild(el('button', { type: 'button', class: x[0] === on ? 'on' : '', text: x[1], onclick: function () { st.template = withSign(st.template, x[0]); drawSg(); } }));
          });
        };
        drawSg();
        var sdBox = el('div', { class: 'fat-seg' });
        var drawSd = function () {
          var on = hasStatus(st.template);
          sdBox.innerHTML = '';
          [[true, '▣ ' + t('statusOn')], [false, '⊘ ' + t('statusOff')]].forEach(function (x) {
            sdBox.appendChild(el('button', { type: 'button', class: x[0] === on ? 'on' : '', text: x[1], onclick: function () { st.template = withStatus(st.template, x[0]); drawSd(); } }));
          });
        };
        drawSd();
        var cdBox = el('div', { class: 'fat-seg' });
        var drawCd = function () {
          cdBox.innerHTML = '';
          [['nq', '▦ ' + t('codeQr'), (cfg.layout || {}).qr !== false], ['nb', '▮▯▮ ' + t('codeBc'), (cfg.layout || {}).barcode !== false]].forEach(function (x) {
            if (!x[2]) return;
            var on = hasFlagOn(st.template, x[0]);
            cdBox.appendChild(el('button', { type: 'button', class: on ? 'on' : '', text: (on ? '✓ ' : '⊘ ') + x[1], onclick: function () { st.template = withFlag(st.template, x[0], !on); drawCd(); } }));
          });
        };
        drawCd();
        var lgSel = el('select', { onchange: function (e) { st.lang = e.target.value; } }, [['tr', 'langTr'], ['en', 'langEn'], ['ar', 'langAr']].map(function (x) { return opt(x[0], t(x[1]), st.lang === x[0]); }));

        // ---- v1.61: döviz çevirisi ----
        // Kur: exchange_rates (1 USD = rate birim). Kalem ilk çevrildiğinde orijinal fiyatı it.fx = {p, c} olarak saklanır; her çeviri
        // orijinalden yapılır (gidip gelince yuvarlama birikmez), orijinal para birimine dönülünce fiyat aynen geri gelir.
        // Fiyat elle değiştirilirse it.fx silinir (yeni fiyat esas olur). Ürün kayıtlarının fiyatı değişmez (services.js v1.61 fx).
        var FX = { r: { USD: 1 }, man: {}, at: '', online: false, busy: false, fetched: false };
        var fxBox = el('div', { class: 'field span-2 fat-fx' });
        var fxRate = function (c) { return c === 'USD' ? 1 : num(FX.man[c]) > 0 ? num(FX.man[c]) : num(FX.r[c]) > 0 ? num(FX.r[c]) : 0; };
        var fxConv = function (a, from, to) { if (from === to) return a; var rf = fxRate(from), rt = fxRate(to); return rf > 0 && rt > 0 ? a / rf * rt : null; };
        var fxPrice = function (n, c) { var p = Math.pow(10, DEC[c] === 0 ? 0 : 4); return Math.round(n * p) / p; };
        // v1.62 kâr: kalemin kârsız fiyatı ve oranı it.mk = {b, r}; fiyat = b × (1 + r/100). Kâr hep b'den hesaplanır (üst üste binmez).
        var mkBase = function (it) { return it.mk ? num(it.mk.b) : num(it.price); };
        var setBase = function (it, b) { if (it.mk) { it.mk.b = b; it.price = fxPrice(b * (1 + num(it.mk.r) / 100), st.currency); } else it.price = b; };
        var mkSet = function (it, r) {
          r = num(r);
          if (!r) { if (it.mk) { it.price = num(it.mk.b); delete it.mk; } return; }
          var b = mkBase(it); it.mk = { b: b, r: r }; it.price = fxPrice(b * (1 + r / 100), st.currency);
        };
        var hasPrice = function (it) { return String(it.name || '').trim() && (it.mk ? num(it.mk.b) > 0 : num(it.price) > 0); };
        var fxUsed = function () {
          var u = {}; st.items.forEach(function (it) { if (it.fx && it.fx.c !== st.currency) u[it.fx.c] = 1; });
          if (st.discFx && st.discFx.c !== st.currency) u[st.discFx.c] = 1;
          return Object.keys(u);
        };
        var fxText = function () {
          var used = fxUsed(); if (!used.length) return '';
          var cs = {}; used.concat([st.currency]).forEach(function (c) { if (c !== 'USD') cs[c] = 1; });
          return Object.keys(cs).filter(function (c) { return fxRate(c) > 0; }).map(function (c) { return '1 USD = ' + fmt(fxRate(c), c === 'SYP' ? 'SYP' : 'X', st.lang) + ' ' + c; }).join(' · ');
        };
        var loadFx = function () {
          return q('SELECT currency_code AS c, rate, created_at AS at FROM exchange_rates r WHERE id = (SELECT MAX(id) FROM exchange_rates WHERE currency_code = r.currency_code)').then(function (rows) {
            var m = { USD: 1 }, at = '';
            rows.forEach(function (x) { if (CUR.indexOf(x.c) >= 0 && x.c !== 'USD' && x.rate > 0) { m[x.c] = x.rate; if (String(x.at || '') > at) at = String(x.at || ''); } });
            var ch = CUR.some(function (c) { return num(m[c]) !== num(FX.r[c]); });
            FX.r = m; FX.at = at; return ch;
          }).catch(function () { return false; });
        };
        var fetchFx = function () {
          var api = F().rates && F().rates.fetchOnline;
          FX.fetched = true;
          if (!api) return loadFx();
          FX.busy = true; drawFx();
          return Promise.race([Promise.resolve().then(api), new Promise(function (res) { setTimeout(function () { res(null); }, 9000); })])
            .then(function (r) { FX.online = !!(r && r.ok); if (FX.online) FX.at = new Date().toISOString(); }, function () { FX.online = false; })
            .then(function () { var keep = FX.online ? FX.at : ''; return loadFx().then(function (ch) { if (keep) FX.at = keep; return ch; }); })
            .then(function (ch) { FX.busy = false; drawFx(); return ch; });
        };
        // çevrilmiş tüm kalemleri (ve indirimi) güncel kurla yeniden hesaplar
        function fxApply(quiet) {
          var n = 0, miss = false, c = st.currency;
          st.items.forEach(function (it) {
            if (!it.fx) return;
            if (it.fx.c === c) { setBase(it, it.fx.p); delete it.fx; n++; return; }
            var v = fxConv(it.fx.p, it.fx.c, c); if (v == null) { miss = true; return; }
            setBase(it, fxPrice(v, c)); n++;
          });
          if (st.discFx) {
            if (st.discFx.c === c) { st.discount = st.discFx.p; st.discFx = null; }
            else { var dv = fxConv(st.discFx.p, st.discFx.c, c); if (dv == null) miss = true; else st.discount = rnd(dv, c); }
            if (discIn) discIn.value = st.discount === '' || st.discount == null ? '' : String(st.discount);
          }
          st.fxTxt = fxText();
          drawItems(); drawFx(miss);
          if (n && !quiet && !miss) toast(t('fxDone', { n: n, c: c }));
          return miss;
        }
        function switchCurrency(from, to) {
          if (from === to) return;
          st.items.forEach(function (it) { if (!it.fx && it.price !== '' && it.price != null && num(it.price) !== 0) it.fx = { p: mkBase(it), c: from }; });
          if (!st.discFx && num(st.discount) > 0) st.discFx = { p: num(st.discount), c: from };
          fxApply(false);
          // internetten güncel kur (oturumda bir kez); kur değiştiyse fiyatlar orijinalden yeniden çevrilir
          if (!FX.fetched) fetchFx().then(function (ch) { if (ch) fxApply(true); });
        }
        // v1.61.4: fiyatlar başka para birimindeyse (ör. PDF'ten TL geldi, fatura USD) tek tuşla çevrilir
        var fxFrom = st.currency === 'TRY' ? 'USD' : 'TRY';
        function convertFrom(src) {
          if (!src || src === st.currency) return;
          st.items.forEach(function (it) { if (!it.fx && it.price !== '' && it.price != null && num(it.price) !== 0) it.fx = { p: mkBase(it), c: src }; });
          if (!st.discFx && num(st.discount) > 0) st.discFx = { p: num(st.discount), c: src };
          fxApply(false);
          if (!FX.fetched) fetchFx().then(function (ch) { if (ch) fxApply(true); });
        }
        function drawFx(miss) {
          fxBox.innerHTML = '';
          var head = el('div', { class: 'fat-fx-h' }, [el('span', { class: 'field-label', text: t('fxTitle') }), el('span', { class: 'sp' }),
            el('button', { type: 'button', class: 'btn small', disabled: FX.busy || null, title: t('fxRefresh'), text: FX.busy ? '⏳ ' + t('fxBusy') : '↻ ' + t('fxRefresh'),
              onclick: function () { fetchFx().then(function (ch) { if (ch) fxApply(true); }); } })]);
          fxBox.appendChild(head);
          var row = el('div', { class: 'fat-fx-r', dir: 'ltr' });
          CUR.filter(function (c) { return c !== 'USD'; }).forEach(function (c) {
            var x = el('input', { type: 'number', step: 'any', min: '0', dir: 'ltr', value: fxRate(c) > 0 ? String(fxRate(c)) : '', class: miss && !(fxRate(c) > 0) ? 'bad' : null,
              onchange: function (e) { var v = num(e.target.value); if (v > 0 && v !== num(FX.r[c])) FX.man[c] = v; else delete FX.man[c]; fxApply(true); } });
            row.appendChild(el('label', { class: 'fat-fx-i' }, [el('span', { text: '1 USD =' }), x, el('span', { text: c }), el('span', { dir: 'rtl', text: SYM[c] })]));
          });
          fxBox.appendChild(row);
          var srcSel = el('select', { onchange: function (e) { fxFrom = e.target.value; } }, CUR.filter(function (c) { return c !== st.currency; }).map(function (c) { return opt(c, c + ' · ' + SYM[c], fxFrom === c); }));
          if (fxFrom === st.currency) fxFrom = srcSel.value;
          fxBox.appendChild(el('div', { class: 'fat-fx-cv' }, [el('span', { text: t('fxFromLbl') }), srcSel,
            el('button', { type: 'button', class: 'btn small primary', text: '⇄ ' + t('fxConvertTo', { c: st.currency }), onclick: function () { convertFrom(srcSel.value); } })]));
          var hasMan = Object.keys(FX.man).length > 0;
          var srcTxt = hasMan ? t('fxManual') : !FX.at ? t('fxNone') : (FX.online ? t('fxOnline') : t('fxStored')) + ' · ' + dmy(FX.at) + (FX.at.length > 10 ? ' ' + (FX.online ? new Date(FX.at).toTimeString().slice(0, 5) : FX.at.slice(11, 16)) : '');
          fxBox.appendChild(el('div', { class: 'field-hint' }, [el('b', { text: srcTxt }), el('span', { text: ' — ' + t('fxHint') })]));
          if (miss) fxBox.appendChild(el('div', { class: 'notice error small', text: t('fxMissing') }));
        }
        var discIn = null;
        var pdfFrom = st._fxFrom; delete st._fxFrom;
        loadFx().then(function () { drawFx(); if (pdfFrom && pdfFrom !== st.currency) convertFrom(pdfFrom); });
        drawFx();

        // ---- kalemler ----
        var tbody = el('tbody');
        var totBox = el('div', { class: 'fat-tot' });
        function recalc() {
          var c = st.currency, tt = calcTotals(st.items, st.discount, vatOn ? st.tax_rate : 0, c, perLine);
          var k = tt.subtotal > 0 ? (tt.subtotal - tt.discount) / tt.subtotal : 0;
          st.items.forEach(function (it, i) {
            var l = rnd(num(it.qty) * num(it.price), c);
            var cell = tbody.querySelector('[data-l="' + i + '"]'); if (cell) cell.textContent = fmt(l, c);
            var vc = tbody.querySelector('[data-v="' + i + '"]'); if (vc) vc.textContent = fmt(rnd(l * k * num(it.vat) / 100, c), c);
          });
          totBox.innerHTML = '';
          totBox.appendChild(el('div', null, [el('span', { text: t('subtotal') }), el('b', { dir: 'ltr', text: money(tt.subtotal, c) })]));
          if (tt.discount) totBox.appendChild(el('div', null, [el('span', { text: t('discount') }), el('b', { dir: 'ltr', text: '− ' + money(tt.discount, c) })]));
          Object.keys(tt.byRate).sort(function (a, b) { return b - a; }).forEach(function (rt) {
            if (!tt.byRate[rt].tax && !num(rt)) return;
            totBox.appendChild(el('div', null, [el('span', { text: (perLine ? t('vatCalc') : t('tax')) + ' (%' + num(rt) + ')' }), el('b', { dir: 'ltr', text: money(tt.byRate[rt].tax, c) })]));
          });
          totBox.appendChild(el('div', { class: 'g' }, [el('span', { text: t('grand') }), el('b', { dir: 'ltr', text: money(tt.total, c) })]));
          var mp = mkProfit(); if (mp.n) totBox.appendChild(el('div', { class: 'mk' }, [el('span', { text: t('mkTot') + ' (' + mp.n + ')' }), el('b', { dir: 'ltr', text: '+ ' + money(mp.a, c) })]));
          drawMkSum();
          st._total = tt.total;
          if (payIn && !payTouched) payIn.value = tt.total ? String(tt.total) : '';
        }
        var prodLabel = function (p) { return (p.code ? p.code + ' · ' : '') + p.name + (p.sale_price != null ? ' · ' + money(p.sale_price, p.cost_currency || st.currency) : ''); };
        function applyProduct(it, p, refs, force) {
          it.product_id = p.id;
          if ((force || !it.code) && p.code) { it.code = p.code; if (refs.code) refs.code.value = p.code; }
          if ((force || !it.unit) && p.unit && p.unit !== 'pcs') { it.unit = p.unit; if (refs.unit) refs.unit.value = p.unit; }
          if ((force || !it.depot) && p.depot) { it.depot = p.depot; if (refs.depot) refs.depot.value = p.depot; }
          if (perLine && p.vat_rate != null && (force || it.vat == null || it.vat === '' || num(it.vat) === dVat)) { it.vat = p.vat_rate; if (refs.vat) refs.vat.value = p.vat_rate; }
          if ((force || it.price === '' || it.price == null || num(it.price) === 0) && p.sale_price != null) {
            if (!p.cost_currency || p.cost_currency === st.currency) { setBase(it, num(p.sale_price)); delete it.fx; if (refs.price) refs.price.value = it.price; }
            else { var pv = fxConv(num(p.sale_price), p.cost_currency, st.currency); if (pv != null) { it.fx = { p: num(p.sale_price), c: p.cost_currency }; setBase(it, fxPrice(pv, st.currency)); st.fxTxt = fxText(); if (refs.price) refs.price.value = it.price; } }
            if (refs.mk) refs.mk();
          }
          recalc();
        }
        // v1.62: satır başına kâr (fiyatın yanındaki ％ düğmesi)
        var mkPop = null;
        var mkClose = function () { if (mkPop) { mkPop.remove(); mkPop = null; document.removeEventListener('mousedown', mkOut, true); document.removeEventListener('keydown', mkKey, true); window.removeEventListener('scroll', mkClose, true); } };
        var mkKey = function (e) { if (e.key === 'Escape' && mkPop) { e.stopPropagation(); e.preventDefault(); mkClose(); } };
        var mkOut = function (e) { if (mkPop && !mkPop.contains(e.target) && !(mkPop._b && mkPop._b.contains(e.target))) mkClose(); };
        var pctTxt = function (r) { return String(Math.round(num(r) * 100) / 100).replace('.', lang() === 'tr' ? ',' : '.'); };
        function mkCell(it, refs, pIn) {
          var btn = el('button', { type: 'button', class: 'fat-mk-b', tabindex: '-1' });
          var wrap = el('div', { class: 'fat-pw' }, [pIn, btn]);
          refs.mk = function () {
            btn.className = 'fat-mk-b' + (it.mk ? ' on' : '');
            btn.textContent = it.mk ? '+%' + pctTxt(it.mk.r) : '％';
            btn.title = it.mk ? t('mkBase') + ': ' + money(num(it.mk.b), st.currency) + ' · +%' + pctTxt(it.mk.r) : t('mkLine');
          };
          refs.mk();
          var done = function (r) {
            mkSet(it, r); pIn.value = it.price === '' || it.price == null ? '' : String(it.price); refs.mk(); mkClose(); recalc();
          };
          btn.onclick = function () {
            if (mkPop && mkPop._b === btn) { mkClose(); return; }
            mkClose();
            var x = el('input', { type: 'number', step: 'any', dir: 'ltr', value: it.mk ? String(it.mk.r) : (st._mkR || ''), placeholder: '15',
              onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); ok(); } else if (e.key === 'Escape') { e.stopPropagation(); mkClose(); } } });
            var ok = function () { var r = num(x.value); if (!(r > -100) || !String(x.value).trim()) { toast(t('mkBad'), 'error'); x.focus(); return; } done(r); };
            mkPop = el('div', { class: 'fat-mk-p' }, [
              el('b', { text: t('mkLine') }),
              el('div', { class: 'fat-mk-r' }, [el('span', { text: '%' }), x, el('button', { type: 'button', class: 'btn small primary', text: t('mkApply'), onclick: ok })]),
              el('div', { class: 'fat-mk-r' }, [5, 10, 15, 20, 25].map(function (v) { return el('button', { type: 'button', class: 'fat-mk-c', text: '%' + v, onclick: function () { done(v); } }); })),
              it.mk ? el('div', { class: 'b', text: t('mkBase') + ': ' + money(num(it.mk.b), st.currency) }) : null,
              it.mk ? el('button', { type: 'button', class: 'btn small', text: '⊘ ' + t('mkClear'), onclick: function () { done(0); } }) : null
            ]);
            mkPop._b = btn;
            document.body.appendChild(mkPop);
            var rc = btn.getBoundingClientRect(), pw = mkPop.offsetWidth, ph = mkPop.offsetHeight, rtl = getComputedStyle(btn).direction === 'rtl';
            var lx = rtl ? rc.left : rc.right - pw; lx = Math.max(8, Math.min(lx, window.innerWidth - pw - 8));
            var ty = rc.bottom + 4; if (ty + ph > window.innerHeight - 8) ty = Math.max(8, rc.top - ph - 4);
            mkPop.style.left = lx + 'px'; mkPop.style.top = ty + 'px';
            if (document.documentElement.dir === 'rtl' || lang() === 'ar') mkPop.dir = 'rtl';
            window.addEventListener('scroll', mkClose, true);
            document.addEventListener('keydown', mkKey, true);
            document.addEventListener('mousedown', mkOut, true);
            setTimeout(function () { try { x.focus(); x.select(); } catch (e) {} }, 0);
          };
          return wrap;
        }
        // v1.62: toplu kâr paneli
        var mkBox = el('div', { class: 'fat-mk' });
        var mkSum = el('span', { class: 'fat-mk-s' });
        var mkProfit = function () {
          var n = 0, a = 0;
          st.items.forEach(function (it) { if (it.mk && String(it.name || '').trim()) { n++; a += num(it.qty) * (num(it.price) - num(it.mk.b)); } });
          return { n: n, a: rnd(a, st.currency) };
        };
        function drawMkSum() {
          var p = mkProfit();
          mkSum.className = 'fat-mk-s' + (p.n ? '' : ' z');
          mkSum.textContent = p.n ? t('mkSum', { n: p.n, a: money(p.a, st.currency) }) : t('mkNone');
        }
        function drawMk() {
          mkBox.innerHTML = '';
          var rIn = el('input', { type: 'number', step: 'any', dir: 'ltr', placeholder: '15', value: st._mkR || '', oninput: function (e) { st._mkR = e.target.value; chips(); } });
          var chipBox = el('span', { class: 'fat-mk-r', style: 'margin:0' });
          var chips = function () {
            chipBox.innerHTML = '';
            [5, 10, 15, 20, 25, 30].forEach(function (v) {
              chipBox.appendChild(el('button', { type: 'button', class: 'fat-mk-c' + (num(st._mkR) === v ? ' on' : ''), text: '%' + v, onclick: function () { st._mkR = String(v); rIn.value = st._mkR; chips(); } }));
            });
          };
          chips();
          var applyAll = function () {
            var r = num(rIn.value);
            if (!String(rIn.value).trim() || !(r > -100) || !r) { toast(t('mkBad'), 'error'); rIn.focus(); return; }
            var n = 0;
            st.items.forEach(function (it) { if (hasPrice(it)) { mkSet(it, r); n++; } });
            if (!n) { toast(t('mkEmpty'), 'error'); return; }
            mkClose(); drawItems(); toast(t('mkDone', { n: n, r: pctTxt(r) }));
          };
          var clearAll = function () {
            var n = 0; st.items.forEach(function (it) { if (it.mk) { mkSet(it, 0); n++; } });
            mkClose(); drawItems(); if (n) toast(t('mkRemoved'));
          };
          mkBox.appendChild(el('span', { class: 'field-label', text: '📈 ' + t('mkTitle') }));
          mkBox.appendChild(el('div', { class: 'fat-mk-r' }, [el('span', { text: t('mkRate') }), rIn, chipBox]));
          mkBox.appendChild(el('div', { class: 'fat-mk-r' }, [
            el('button', { type: 'button', class: 'btn small primary', text: '＋ ' + t('mkAll'), onclick: applyAll }),
            el('button', { type: 'button', class: 'btn small', text: '⊘ ' + t('mkClearAll'), onclick: clearAll }),
            mkSum
          ]));
          mkBox.appendChild(el('div', { class: 'field-hint', text: t('mkHint') }));
          drawMkSum();
        }
        drawMk();
        function drawItems() {
          mkClose();
          tbody.innerHTML = '';
          st.items.forEach(function (it, i) {
            var refs = {};
            var sug = el('div', { class: 'fat-sug', hidden: true });
            var fit = function () { nm.style.height = 'auto'; nm.style.height = (nm.scrollHeight + 2) + 'px'; };
            var first = function () { return String(it.name || '').split('\n')[0].trim(); };
            var matchProduct = function () {
              var p = null, n = low(first());
              for (var j = 0; j < products.length; j++) if (low(products[j].name) === n) { p = products[j]; break; }
              if (p) applyProduct(it, p, refs, false); else it.product_id = null;
            };
            var showSug = function (all) {
              sug.innerHTML = '';
              var qq = low(first());
              if (!all && !qq) { sug.hidden = true; return; }
              var list = products.filter(function (p) { var n = low(p.name); return n && (all || n.indexOf(qq) >= 0 || low(p.code).indexOf(qq) >= 0) && p.name !== it.name; }).slice(0, 12);
              if (!list.length) { sug.hidden = true; return; }
              list.forEach(function (p) {
                sug.appendChild(el('div', { class: 'o', text: prodLabel(p), onmousedown: function (e) {
                  e.preventDefault(); it.name = p.name; nm.value = p.name; sug.hidden = true; fit(); applyProduct(it, p, refs, true);
                } }));
              });
              sug.hidden = false;
            };
            var nm = el('textarea', { class: 'nm', rows: '1', value: it.name || '', autocomplete: 'off', placeholder: t('itemName'), title: t('itemNameHint'),
              oninput: function (e) { it.name = e.target.value; fit(); matchProduct(); showSug(false); },
              onkeydown: function (e) {
                if (e.key === 'Escape' && !sug.hidden) { e.stopPropagation(); sug.hidden = true; return; }
                if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.isComposing) { e.preventDefault(); sug.hidden = true; refs.qty.focus(); try { refs.qty.select(); } catch (x) {} }
              },
              onblur: function () { setTimeout(function () { sug.hidden = true; }, 150); } });
            var sugBtn = products.length ? el('button', { type: 'button', class: 'fat-sug-b', tabindex: '-1', title: t('itemPick'), text: '▾', onmousedown: function (e) {
              e.preventDefault(); if (sug.hidden) { nm.focus(); showSug(true); } else sug.hidden = true;
            } }) : null;
            requestAnimationFrame(fit);
            var numIn = function (key, cls) { var x = el('input', { class: cls, type: 'number', step: 'any', min: '0', dir: 'ltr', value: it[key] == null ? '' : String(it[key]), oninput: function (e) { it[key] = e.target.value; if (key === 'price') { delete it.fx; if (it.mk) { delete it.mk; if (refs.mk) refs.mk(); } } recalc(); } }); refs[key] = x; return x; };
            var txtIn = function (key, cls, ltr) {
              var x = el('input', { class: cls, dir: ltr ? 'ltr' : null, value: it[key] || '', oninput: function (e) {
                it[key] = e.target.value;
                // stok kodu yazılınca kayıtlı ürün bulunursa bilgileri gelir
                if (key === 'code') { var v = String(e.target.value).trim(); var p = v && products.filter(function (x2) { return x2.code === v; })[0]; if (p) { if (!String(it.name || '').trim()) { it.name = p.name; nm.value = p.name; fit(); } applyProduct(it, p, refs, false); } }
              } });
              refs[key] = x; return x;
            };
            var cells = cols.map(function (f) {
              switch (f.k) {
                case 'no': return el('td', { class: 'no', text: String(i + 1) });
                case 'depot': return el('td', null, [txtIn('depot', 'dp')]);
                case 'code': return el('td', null, [txtIn('code', 'cd', true)]);
                case 'name': return el('td', { class: 'nmc' }, [nm, sugBtn, sug]);
                case 'qty': return el('td', null, unitCol ? [numIn('qty', 'q')] : [el('div', { class: 'fat-qu' }, [numIn('qty', 'q'), txtIn('unit', 'u')])]);
                case 'unit': return el('td', null, [txtIn('unit', 'u')]);
                case 'price': return el('td', null, [mkCell(it, refs, numIn('price', 'p'))]);
                case 'amount': return el('td', { class: 'l', 'data-l': String(i), dir: 'ltr' });
                case 'vat': return el('td', null, [numIn('vat', 'v')]);
                case 'vat_amount': return el('td', { class: 'l', 'data-v': String(i), dir: 'ltr' });
                default: it.x = it.x || {}; return el('td', null, [el('input', { class: 'cx', value: it.x[f.k] || '', oninput: function (e) { it.x = it.x || {}; it.x[f.k] = e.target.value; } })]);
              }
            });
            cells.push(el('td', null, [el('button', { type: 'button', class: 'icon-btn tiny danger', title: t('removeItem'), text: '✕', onclick: function () { st.items.splice(i, 1); if (!st.items.length) st.items.push(newItem()); drawItems(); } })]));
            tbody.appendChild(el('tr', null, cells));
          });
          recalc();
        }
        var headTr = function () { return el('tr', null, cols.map(function (f) {
          return el('th', { class: 'h-' + f.k, style: f.k === 'amount' || f.k === 'vat_amount' ? 'text-align:end' : null, text: fLabel('cols', f, lang()) + (f.k === 'qty' && !unitCol ? ' / ' + fLabel('cols', { k: 'unit' }, lang()) : '') });
        }).concat([el('th')])); };
        var itemsHead = el('thead', null, [headTr()]);
        var itemsTable = el('table', { class: 'fat-items' }, [itemsHead, tbody]);
        // v1.61.2: KDV'li / KDV'siz (yalnız bu fatura; KDV sütunları ve toplamdaki KDV satırları kalkar)
        var taxField = null;
        var vtBox = el('div', { class: 'fat-seg' });
        function setVat(on) {
          vatOn = on; st.template = withVat(st.template, on); perLine = on && perLine0;
          if (perLine) st.items.forEach(function (it) { if (it.vat == null || it.vat === '') it.vat = dVat; });
          cols = calcCols(); itemsHead.innerHTML = ''; itemsHead.appendChild(headTr());
          if (taxField) taxField.style.display = perLine || !vatOn ? 'none' : '';
          drawVt(); drawItems();
        }
        function drawVt() {
          vtBox.innerHTML = '';
          [[true, '％ ' + t('vatOn')], [false, '⊘ ' + t('vatOff')]].forEach(function (x) {
            vtBox.appendChild(el('button', { type: 'button', class: x[0] === vatOn ? 'on' : '', text: x[1], onclick: function () { if (x[0] !== vatOn) setVat(x[0]); } }));
          });
        }
        drawVt();

        // gelir kaydı (yalnız yeni faturada; sonra "Kasaya işle")
        var cashBox = el('div', { class: 'fat-cash span-2' });
        var payIn = null, payTouched = false;
        function drawCash() {
          cashBox.innerHTML = '';
          if (!isNew) return;
          accountsFor(st.currency).then(function (accs) {
            cashBox.innerHTML = '';
            cashBox.appendChild(el('div', { class: 'field-label', text: t('cashTitle') }));
            var seg = el('div', { class: 'segmented' }, [
              el('button', { type: 'button', class: st.cash ? 'active' : '', text: '✓ ' + t('cashYes'), onclick: function () { st.cash = true; drawCash(); } }),
              el('button', { type: 'button', class: st.cash ? '' : 'active', text: '⏳ ' + t('cashNo'), onclick: function () { st.cash = false; drawCash(); } })
            ]);
            cashBox.appendChild(seg);
            cashBox.appendChild(el('div', { class: 'field-hint', text: st.cash ? t('cashYesHint') : t('cashNoHint') }));
            if (st.cash) {
              if (!accs.length) { cashBox.appendChild(el('div', { class: 'notice error', text: t('noAccount') })); return; }
              if (!st.account_id || !accs.some(function (a) { return String(a.id) === String(st.account_id); })) st.account_id = accs[0].id;
              payIn = el('input', { type: 'number', step: 'any', min: '0', dir: 'ltr', value: payTouched ? st.pay_amount : (st._total ? String(st._total) : ''), oninput: function (e) { payTouched = true; st.pay_amount = e.target.value; } });
              cashBox.appendChild(el('div', { class: 'form', style: 'margin-top:8px' }, [
                field(t('account'), el('select', { onchange: function (e) { st.account_id = e.target.value; } }, accs.map(function (a) { return opt(a.id, a.name, String(a.id) === String(st.account_id)); }))),
                field(t('payAmount'), payIn, { hint: t('payAmountHint') })
              ]));
            } else payIn = null;
          });
        }
        var inpS = function (k, attrs) {
          var a = Object.assign({ value: st[k] == null ? '' : String(st[k]), oninput: function (e) { st[k] = e.target.value; if (attrs && attrs.after) attrs.after(); } }, attrs || {});
          delete a.after; var tag = a.tag || 'input'; delete a.tag; var x = el(tag, a); if (tag === 'textarea') x.value = st[k] || ''; return x;
        };
        var pdfBtn = el('button', { type: 'button', class: 'btn fat-pdfbtn', text: '📄 ' + t('fromPdf'), title: t('fromPdfHint'), onclick: function () {
          pickPdf(function (data) { m.close(); openEditor(inv, Object.assign({}, st, data, { meta: Object.assign({}, st.meta, data.meta || {}), cx: Object.assign({}, st.cx, data.cx || {}) })); });
        } });
        var form = el('div', { class: 'form' }, [
          el('div', { class: 'span-2 fat-sec' }, [el('h3', { class: 'section-title', text: t('secCustomer') }), custLbl, el('span', { class: 'sp' }), pdfBtn]),
          field(t('cName'), custWrap, { span: 2, group: true })
        ].concat(custFields).concat([
          el('h3', { class: 'section-title span-2', text: t('secInfo') })
        ]).concat(metaFields).concat([
          field(t('currency'), curSel), field(t('template'), tplSel), field(t('lang'), lgSel), fxBox,
          field(t('signField'), sgBox, { span: 2, group: true, hint: t('signFieldHint') }),
          field(t('statusField'), sdBox, { span: 2, group: true, hint: t('statusFieldHint') }),
          field(t('vatField'), vtBox, { span: 2, group: true, hint: t('vatFieldHint') }),
          (cfg.layout || {}).qr !== false || (cfg.layout || {}).barcode !== false ? field(t('codeField'), cdBox, { span: 2, group: true, hint: t('codeFieldHint') }) : null,
          el('div', { class: 'field span-2' }, [el('span', { class: 'field-label', text: t('items') }), el('div', { class: 'fat-items-wrap' }, [itemsTable]),
            el('div', null, [el('button', { type: 'button', class: 'btn small', text: t('addItem'), onclick: function () { st.items.push(newItem()); drawItems(); var ins = tbody.querySelectorAll('tr:last-child textarea'); if (ins[0]) ins[0].focus(); } })]), mkBox]),
          field(t('discount'), (discIn = inpS('discount', { type: 'number', step: 'any', min: '0', dir: 'ltr', after: function () { st.discFx = null; recalc(); } }))),
          (taxField = field(t('taxRate'), inpS('tax_rate', { type: 'number', step: 'any', min: '0', max: '100', dir: 'ltr', after: recalc }))),
          el('div', { class: 'span-2' }, [totBox]),
          field(t('note'), inpS('note', { tag: 'textarea', rows: 2 }), { span: 2 }),
          cashBox
        ]).concat(dls));
        var itemsOut = function () {
          return st.items.filter(function (it) { return String(it.name || '').trim(); }).map(function (it) {
            var o = { name: it.name, qty: num(it.qty), unit: it.unit || '', price: num(it.price), product_id: it.product_id || null };
            if (it.code) o.code = it.code; if (it.depot) o.depot = it.depot;
            if (perLine) o.vat = num(it.vat);
            if (it.fx && it.fx.c !== st.currency) o.fx = { p: num(it.fx.p), c: it.fx.c };
            if (it.mk && num(it.mk.r)) o.mk = { b: num(it.mk.b), r: num(it.mk.r) };
            if (it.x) { var x = {}; Object.keys(it.x).forEach(function (k) { if (String(it.x[k] || '').trim()) x[k] = it.x[k]; }); if (Object.keys(x).length) o.x = x; }
            return o;
          });
        };
        var metaOut = function () {
          var o = {};
          Object.keys(st.meta).forEach(function (k) { if (k !== 'fx_rate' && String(st.meta[k] || '').trim()) o[k] = String(st.meta[k]).trim(); });
          if (fxUsed().length) { var fxs = st.fxTxt || st.meta.fx_rate || fxText(); if (fxs) o.fx_rate = fxs; }
          Object.keys(st.cx).forEach(function (k) { if (String(st.cx[k] || '').trim()) o['c.' + k] = String(st.cx[k]).trim(); });
          return o;
        };
        var custExtra = function () {
          var o = { extra: {} };
          custF.forEach(function (f) { if (CMAP[f.k]) return; var v = String(st.cx[f.k] || '').trim(); if (f.custom) { if (v) o.extra[f.k] = v; } else if (v) o[f.k] = v; });
          if (!Object.keys(o.extra).length) delete o.extra;
          return o;
        };
        var submit = function (withPdf, btn) {
          if (!String(st.customer).trim()) { toast(t('errCustomer'), 'error'); custIn.focus(); return; }
          var items = itemsOut();
          if (!items.length) { toast(t('errItems'), 'error'); return; }
          btn.disabled = true;
          var payload = {
            id: inv ? inv.id : undefined, number: st.number, date: st.date, due_date: st.due_date, customer: { name: String(st.customer).trim() }, customer_id: st.customer_id || null,
            customer_phone: st.phone, customer_email: st.email, customer_address: st.address, customer_tax: st.tax_no, customer_extra: custExtra(), currency: st.currency, items: items,
            discount: num(st.discount), tax_rate: perLine || !vatOn ? 0 : num(st.tax_rate), note: st.note, template: st.template, lang: st.lang, meta: metaOut(),
            record_cash: isNew && st.cash, account_id: st.account_id ? Number(st.account_id) : null, pay_amount: payTouched ? num(st.pay_amount) : ''
          };
          run('saveInvoice', payload, t('saved')).then(function (res) {
            m.close(); load();
            if (withPdf && res && res.id) q('SELECT * FROM invoices WHERE id = ?', [res.id]).then(function (x) { if (x[0]) openPreview(x[0]); });
          }, function () { btn.disabled = false; });
        };
        // kaydetmeden önizleme: düzenleyicideki bilgilerden taslak fatura
        var nextNo = function () {
          if (String(st.number).trim()) return Promise.resolve(String(st.number).trim());
          if (!isNew) return Promise.resolve(inv.number);
          var pfx = (cfg.prefix || 'FAL') + '-' + String(st.date || today()).slice(0, 4) + '-';
          return q('SELECT number FROM invoices WHERE number LIKE ?', [pfx + '%']).then(function (rs) {
            var mx = 0; rs.forEach(function (x) { var n = parseInt(String(x.number).slice(pfx.length), 10); if (n > mx) mx = n; });
            return pfx + String(mx + 1).padStart(4, '0');
          }).catch(function () { return pfx + '0001'; });
        };
        var draftInv = function (no) {
          var c = st.currency, items = itemsOut();
          var tt = calcTotals(items, st.discount, vatOn ? st.tax_rate : 0, c, perLine);
          var paid = inv ? inv.paid || 0 : (st.cash ? Math.min(tt.total, payTouched ? rnd(num(st.pay_amount), c) : tt.total) : 0);
          var status = inv && inv.status === 'cancelled' ? 'cancelled' : paid >= tt.total && tt.total > 0 ? 'paid' : paid > 0 ? 'partial' : 'pending';
          return { number: no, date: st.date, due_date: st.due_date, customer_name: String(st.customer).trim() || '—', customer_phone: st.phone, customer_email: st.email,
            customer_address: st.address, customer_tax: st.tax_no, currency_code: c, items: JSON.stringify(items), subtotal: tt.subtotal, discount: tt.discount, tax_rate: perLine || !vatOn ? 0 : num(st.tax_rate),
            tax: tt.tax, total: tt.total, paid: paid, status: status, template: st.template, lang: st.lang, note: st.note, meta: JSON.stringify(metaOut()) };
        };
        var showPreview = function () {
          nextNo().then(function (no) {
            openPreview(draftInv(no), {
              tag: '✎ ' + t('previewDraft'),
              onChange: function (tp, lg) { st.template = tp; st.lang = lg; tplSel.value = tplOf(tp); lgSel.value = lg; drawSg(); drawSd(); drawCd(); },
              extra: function (getM) {
                return [
                  el('button', { type: 'button', class: 'btn', text: t('save'), onclick: function () { getM().close(); submit(false, b1); } }),
                  el('button', { type: 'button', class: 'btn primary', text: '⬇ ' + t('saveAndPdf'), onclick: function () { getM().close(); submit(true, b2); } })
                ];
              }
            });
          });
        };
        var b0 = el('button', { type: 'button', class: 'btn', text: '👁 ' + t('preview'), onclick: function () { showPreview(); } });
        var b1 = el('button', { type: 'button', class: 'btn', text: t('save'), onclick: function (e) { submit(false, e.target); } });
        var b2 = el('button', { type: 'button', class: 'btn primary', text: '⬇ ' + t('saveAndPdf'), onclick: function (e) { submit(true, e.target); } });
        var m = modal(isNew ? t('newInv') : t('editInv') + ' · ' + inv.number, [form], [el('button', { type: 'button', class: 'btn', text: t('close'), onclick: function () { m.close(); } }), b0, b1, b2], 'xwide');
        drawItems(); drawCash();
        if (pre && pre._fromPdf) toast(t('pdfApplied'));
        setTimeout(function () { try { if (!st.customer) custIn.focus(); } catch (e) {} }, 30);
      });
    }

    // ----- PDF'den doldur -----
    // Dosya seçilir → önce çevrimiçi yapay zeka, olmazsa çevrimdışı okuma → önizleme (düzeltilebilir) → onay → done(taslak)
    function pickPdf(done) {
      var inp = el('input', { type: 'file', accept: 'application/pdf,.pdf', style: 'display:none' });
      document.body.appendChild(inp);
      var fin = false, end = function () { if (fin) return; fin = true; if (inp.parentNode) inp.parentNode.removeChild(inp); };
      inp.addEventListener('change', function () { var f = inp.files && inp.files[0]; end(); if (f) readPdf(f, done); });
      inp.addEventListener('cancel', end);
      inp.click();
    }
    // v1.61.2: yapay zeka okurken çevrimdışı okuma da yapılır ve sonucu teyit eder; beklemek istemeyen "Beklemeden çevrimdışı oku"ya basar
    function readPdf(file, done) {
      if (!window.FalconFaturaPdf) { toast(t('pdfNoReader'), 'error'); return; }
      var msg = el('div', { class: 'fat-busy' }, [el('span', { class: 'spin' }), el('span', { text: t('pdfReading') })]);
      var sub = el('div', { class: 'muted small', style: 'margin-top:6px' });
      var clock = el('span', { class: 'muted small', dir: 'ltr', style: 'margin-inline-start:auto' });
      var ctl = {}, t0 = Date.now(), aiOn = false;
      var skipB = el('button', { type: 'button', class: 'btn', style: 'display:none', text: '⌁ ' + t('pdfSkipAi'), onclick: function () { if (ctl.skipAi) ctl.skipAi(); skipB.disabled = true; } });
      var bm = modal('📄 ' + t('fromPdf'), [msg, sub], [clock, skipB], '');
      var tick = setInterval(function () { var s = Math.round((Date.now() - t0) / 1000); clock.textContent = s >= 3 ? t('pdfSec', { s: s }) : ''; if (aiOn && s >= 8) skipB.style.display = ''; }, 1000);
      var stop = function () { clearInterval(tick); bm.close(); };
      window.FalconFaturaPdf.read(file, { ctl: ctl, onStep: function (step, model) {
        aiOn = step === 'ai';
        msg.lastChild.textContent = step === 'ai' ? t('pdfAi') : step === 'verify' ? t('pdfVerify') : t('pdfOffline');
        sub.textContent = step === 'ai' && model ? '✦ ' + model : file.name || '';
        if (!aiOn) skipB.style.display = 'none';
      } }).then(function (r) {
        stop();
        r._file = file;
        if (!r.items.length && !r.buyer.name && !r.seller.name) { toast(r.warnings.indexOf('scanned') >= 0 ? t('pdfScanned') : t('pdfNothing'), 'error'); return; }
        return Promise.all([q('SELECT * FROM customers').catch(function () { return []; }), q('SELECT id, name, code, unit, sale_price, cost_currency, vat_rate, depot FROM products').catch(function () { return []; })])
          .then(function (x) { importPreview(r, x[0], x[1], done); });
      }, function (e) { stop(); toast(t('pdfFail') + ' ' + String(e && e.message || e), 'error'); });
    }
    // Ad benzerliği (0–1): harf ikilileri (Dice)
    function simil(a, b) {
      var n = function (s) { return low(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); };
      a = n(a); b = n(b);
      if (!a || !b) return 0; if (a === b) return 1;
      var bg = function (s) { var o = {}; for (var i = 0; i < s.length - 1; i++) { var g = s.substr(i, 2); o[g] = (o[g] || 0) + 1; } return o; };
      var A = bg(a), B = bg(b), inter = 0, na = 0, nb = 0;
      Object.keys(A).forEach(function (g) { na += A[g]; if (B[g]) inter += Math.min(A[g], B[g]); });
      Object.keys(B).forEach(function (g) { nb += B[g]; });
      return (2 * inter) / (na + nb || 1);
    }
    function importPreview(r, customers, products, done) {
      var cfg = CFG || {};
      var side = 'buyer';
      var P = { buyer: Object.assign({}, r.buyer), seller: Object.assign({}, r.seller) };
      var CK = ['name', 'tax_no', 'tax_office', 'address', 'district', 'city', 'postal_code', 'phone', 'email', 'web'];
      var cBox = el('div', { class: 'fat-imp-c' });
      var matchCust = function (p) {
        var tn = String(p.tax_no || '').replace(/\s/g, '');
        if (tn) { var c = customers.filter(function (x) { return String(x.tax_no || '').replace(/\s/g, '') === tn; })[0]; if (c) return c; }
        var nn = low(p.name).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
        return nn ? customers.filter(function (x) { return low(x.name).replace(/[^\p{L}\p{N}]+/gu, ' ').trim() === nn && (!tn || !x.tax_no); })[0] || null : null;
      };
      var drawC = function () {
        cBox.innerHTML = '';
        var p = P[side], mc = matchCust(p);
        cBox.appendChild(el('div', { class: 'fat-seg', style: 'margin-bottom:8px' }, [
          el('button', { type: 'button', class: side === 'buyer' ? 'on' : '', text: t('impSideBuyer'), onclick: function () { side = 'buyer'; drawC(); } }),
          el('button', { type: 'button', class: side === 'seller' ? 'on' : '', text: t('impSideSeller'), onclick: function () { side = 'seller'; drawC(); } })
        ]));
        cBox.appendChild(el('div', { class: 'fat-imp-st ' + (mc ? 'ok' : 'new'), text: mc ? '✓ ' + t('impCustFound', { n: mc.name }) : '＋ ' + t('impCustNew') }));
        var g = el('div', { class: 'form' });
        CK.forEach(function (k) {
          var lb = k === 'name' ? t('cName') : fLabel('cust', { k: k }, lang());
          var x = el(k === 'address' ? 'textarea' : 'input', { rows: k === 'address' ? '2' : null, value: p[k] || '', dir: { tax_no: 1, phone: 1, email: 1, web: 1, postal_code: 1 }[k] ? 'ltr' : null, oninput: function (e) { p[k] = e.target.value; } });
          if (k === 'address') x.value = p[k] || '';
          g.appendChild(field(lb, x, { span: k === 'address' || k === 'name' ? 2 : 1 }));
        });
        cBox.appendChild(g);
      };
      // fatura bilgileri: Fatura No ve ETTN bizde üretilir; senaryo / tip / özelleştirme varsayılan olarak alınır
      var MK = ['date', 'number', 'ettn', 'scenario', 'inv_type', 'customization', 'issue_time', 'campaign', 'cargo', 'order_no', 'waybill_no', 'due_date'];
      var TAKE = { scenario: 1, inv_type: 1, customization: 1 };
      var mSel = {};
      var mRows = MK.filter(function (k) { return r.meta[k]; }).map(function (k) {
        mSel[k] = !!TAKE[k];
        var cb = el('input', { type: 'checkbox', onchange: function (e) { mSel[k] = e.target.checked; } }); cb.checked = mSel[k];
        return el('label', { class: 'check fat-imp-m' }, [cb, el('span', { class: 'muted', text: fLabel('meta', { k: k }, lang()) + ':' }), el('b', { dir: 'ltr', text: r.meta[k] })]);
      });
      // kalemler: kayıtlı ürünle eşleşme (stok kodu > ad > benzer ad)
      var rows = r.items.map(function (it) {
        var o = { on: true, it: Object.assign({}, it), pick: '' };
        // satır iskontosu: net birim fiyat (satır tutarı / miktar) alınır, toplam PDF'tekiyle aynı kalır
        if ((num(it.disc_amount) > 0 || num(it.disc_rate) > 0) && it.amount != null && num(it.qty) > 0) o.it.price = Math.round(it.amount / it.qty * 10000) / 10000;
        var byCode = it.code ? products.filter(function (p) { return p.code && p.code === it.code; })[0] : null;
        var ranked = products.map(function (p) { return { p: p, s: simil(p.name, it.name) }; }).filter(function (x) { return x.s >= 0.55; }).sort(function (a, b) { return b.s - a.s; }).slice(0, 4);
        o.cands = byCode ? [{ p: byCode, s: 1, code: true }].concat(ranked.filter(function (x) { return x.p !== byCode; })) : ranked;
        o.pick = byCode ? String(byCode.id) : ranked[0] && ranked[0].s >= 0.86 ? String(ranked[0].p.id) : '';
        return o;
      });
      var cur = CUR.indexOf(r.currency) >= 0 ? r.currency : '';
      // v1.61.4: PDF'teki fiyatların para birimi (okunamadıysa TRY) ve faturanın para birimi; farklıysa fiyatlar aktarılırken çevrilir
      var srcCur = cur || 'TRY', dstCur = srcCur;
      var dstSel = el('select', { onchange: function (e) { dstCur = e.target.value; } }, CUR.map(function (c) { return opt(c, c + ' · ' + SYM[c], dstCur === c); }));
      var srcSel = el('select', { onchange: function (e) { srcCur = e.target.value; } }, CUR.map(function (c) { return opt(c, c + ' · ' + SYM[c], srcCur === c); }));
      var curRow = el('div', { class: 'fat-fx-cv' }, [el('span', { text: t('impSrcCur') }), srcSel, el('span', { text: '→ ' + t('impDstCur') }), dstSel]);
      // v1.61.2: çevrimdışı teyit — farklı satırlar işaretlenir
      var ck = r.check || null, diffRows = {};
      if (ck && ck.status === 'diff') ck.diffs.forEach(function (d) { if (d.f === 'item') diffRows[d.i] = 1; });
      var tb = el('tbody', null, rows.map(function (o, i) {
        var it = o.it;
        var cb = el('input', { type: 'checkbox', onchange: function (e) { o.on = e.target.checked; syncOn(); } }); cb.checked = o.on; o.cb = cb;
        var sel = el('select', { class: 'fat-imp-sel', onchange: function (e) { o.pick = e.target.value; } }, [opt('', '＋ ' + t('impNewProduct'), !o.pick)].concat(o.cands.map(function (c) {
          return opt(String(c.p.id), (c.code ? '✓ ' : c.s >= 0.86 ? '✓ ' : '≈ ') + (c.p.code ? c.p.code + ' · ' : '') + c.p.name + (c.code ? '' : ' (%' + Math.round(c.s * 100) + ')'), o.pick === String(c.p.id));
        })));
        var ni = function (k, cls) { return el('input', { class: cls, type: 'number', step: 'any', dir: 'ltr', value: it[k] == null ? '' : String(it[k]), oninput: function (e) { it[k] = e.target.value === '' ? null : num(e.target.value); } }); };
        var ti = function (k, cls) { return el('input', { class: cls, value: it[k] || '', oninput: function (e) { it[k] = e.target.value; } }); };
        return (o.tr = el('tr', { class: diffRows[i] ? 'fat-imp-diff' : null }, [el('td', null, [cb]), el('td', null, [ti('code', 'cd')]), el('td', null, [ti('name', 'nm2')]), el('td', null, [ni('qty', 'q')]), el('td', null, [ti('unit', 'u')]),
          el('td', null, [ni('price', 'p')]), el('td', null, [ni('vat', 'v')]), el('td', null, [sel])]));
      }));
      // v1.61: toplu aktif / pasif (pasif kalem faturaya ve ürün kayıtlarına girmez; silinmez)
      var onCnt = el('span', { class: 'muted small' });
      var allCb = el('input', { type: 'checkbox', title: t('impAllOn'), onchange: function (e) { setAll(e.target.checked); } });
      function syncOn() {
        var a = rows.filter(function (o) { return o.on; }).length;
        rows.forEach(function (o) { if (o.tr) o.tr.classList.toggle('off', !o.on); });
        onCnt.textContent = t('impActive', { a: a, b: rows.length });
        allCb.checked = a === rows.length && a > 0; allCb.indeterminate = a > 0 && a < rows.length;
      }
      function setAll(v) { rows.forEach(function (o) { o.on = v; if (o.cb) o.cb.checked = v; }); syncOn(); }
      var bulk = el('div', { class: 'fat-imp-bulk' }, [
        el('button', { type: 'button', class: 'btn small', text: '⊘ ' + t('impAllOff'), onclick: function () { setAll(false); } }),
        el('button', { type: 'button', class: 'btn small', text: '✓ ' + t('impAllOn'), onclick: function () { setAll(true); } }),
        el('span', { class: 'sp' }), onCnt
      ]);
      var itTable = el('div', { class: 'fat-items-wrap' }, [el('table', { class: 'fat-items fat-imp-t' }, [el('thead', null, [el('tr', null, [allCb, fLabel('cols', { k: 'code' }, lang()), fLabel('cols', { k: 'name' }, lang()), fLabel('cols', { k: 'qty' }, lang()), fLabel('cols', { k: 'unit' }, lang()), fLabel('cols', { k: 'price' }, lang()), '%', t('impMatch')].map(function (h) { return typeof h === 'string' ? el('th', { text: h }) : el('th', null, [h]); }))]), tb])]);
      syncOn();
      // toplam denetimi
      var calc = rows.reduce(function (a, o) { return a + num(o.it.qty) * num(o.it.price); }, 0);
      var expect = r.totals.subtotal != null ? r.totals.subtotal - (rows.some(function (o) { return num(o.it.disc_amount) > 0 || num(o.it.disc_rate) > 0; }) ? num(r.totals.discount) : 0) : null;
      var chk = expect != null ? Math.abs(calc - expect) < 0.05 + expect * 0.001 : null;
      var why = r.aiError ? t('pdfWhy_' + r.aiError) : '';
      var src = r.source === 'ai' ? '✦ ' + t('pdfSrcAi') + (r.model ? ' · ' + r.model : '') : '⌁ ' + t('pdfSrcOffline') + (why ? ' · ' + why : '');
      var dv = function (d, v) { return v == null || v === '' ? '—' : typeof v === 'number' ? (d.k === 'vat' && d.f === 'item' || d.k === 'qty' || d.k === 'count' ? String(v) : fmt(v, cur || 'TRY')) : String(v); };
      var dLabel = function (d) {
        if (d.f === 'count') return t('vCount');
        if (d.f === 'item') return t('vRow', { i: d.i + 1, k: t('vk_' + d.k) });
        if (d.f === 'total') return t('vt_' + d.k);
        if (d.f === 'meta') return t('vm_' + d.k);
        return t((d.f === 'buyer' ? 'vb_' : 'vs_') + d.k);
      };
      var vBox = null;
      if (ck) {
        var n = ck.diffs.length;
        var vTxt = ck.status === 'match' ? '✓ ' + t('vMatch') : ck.status === 'fixed' ? '✓ ' + t(ck.whole ? 'vFixedWhole' : 'vFixed', { n: n }) : ck.status === 'diff' ? '⚠ ' + t('vDiff', { n: n }) : 'ⓘ ' + t('vNone');
        var list = n ? el('ul', { class: 'fat-imp-dl', style: 'display:none' }, ck.diffs.slice(0, 40).map(function (d) { return el('li', { text: t('vLine', { f: dLabel(d), a: dv(d, d.a), b: dv(d, d.b) }) }); })) : null;
        var tg = n ? el('button', { type: 'button', class: 'btn link small', text: t('vShow'), onclick: function () { var on = list.style.display === 'none'; list.style.display = on ? '' : 'none'; tg.textContent = t(on ? 'vHide' : 'vShow'); } }) : null;
        vBox = el('div', { class: 'fat-imp-st fat-imp-v ' + (ck.status === 'match' || ck.status === 'fixed' ? 'ok' : ck.status === 'diff' ? 'warn' : 'new') }, [el('span', { text: vTxt }), tg, list]);
        if (ck.status === 'diff' && n) list.style.display = '';
        if (tg && ck.status === 'diff') tg.textContent = t('vHide');
      }
      // diğer okumaya geç / yapay zekayla tekrar oku
      var altB = null;
      if (r.alt && ck && ck.status !== 'match') {
        var altAi = r.alt.source === 'ai' && !(r.alt.check && r.alt.check.status === 'fixed');
        altB = el('button', { type: 'button', class: 'btn', text: altAi ? '✦ ' + t('useAi') : '⌁ ' + t('useOff'), onclick: function () {
          var o = r.alt; o.alt = r; o._file = r._file; if (!o.check || o.check.status !== 'fixed') o.check = Object.assign({}, ck, { status: 'diff', whole: false });
          m.close(); importPreview(o, customers, products, done);
        } });
      }
      var reB = r.source !== 'ai' && !r.verifiedBy && r._file && r.aiError && r.aiError !== 'skip' && r.aiError !== 'key'
        ? el('button', { type: 'button', class: 'btn', text: '✦ ' + t('rereadAi'), onclick: function () { m.close(); readPdf(r._file, done); } }) : null;
      var body = [
        el('div', { class: 'fat-imp-src' }, [el('span', { class: 'fat-pv-tag', text: src }), cur ? el('span', { class: 'muted small', text: t('currency') + ': ' + cur }) : el('span', { class: 'notice error small', text: t('impCurUnknown', { c: r.currency || '?' }) })]),
        vBox,
        el('h3', { class: 'section-title', text: t('secCustomer') }), cBox,
        mRows.length ? el('h3', { class: 'section-title', text: t('secInfo') }) : null,
        mRows.length ? el('div', { class: 'fat-imp-ms' }, mRows) : null,
        mRows.length ? el('div', { class: 'field-hint', text: t('impMetaHint') }) : null,
        el('h3', { class: 'section-title', text: t('items') + ' (' + rows.length + ')' }), curRow, el('div', { class: 'field-hint', text: t('impCurHint') }), bulk, itTable, el('div', { class: 'field-hint', text: t('impOffHint') }),
        expect != null ? el('div', { class: 'fat-imp-st ' + (chk ? 'ok' : 'warn'), text: (chk ? '✓ ' : '⚠ ') + t('impTotals', { a: fmt(calc, cur || 'TRY'), b: fmt(expect, cur || 'TRY') }) }) : null
      ];
      drawC();
      var m = modal('📄 ' + t('impTitle'), body, [
        el('button', { type: 'button', class: 'btn', text: t('close'), onclick: function () { m.close(); } }), reB, altB,
        el('button', { type: 'button', class: 'btn primary', text: '✓ ' + t('impApply'), onclick: function () {
          var p = P[side], mc = matchCust(p);
          var cx = {};
          ['tax_office', 'district', 'city', 'postal_code', 'web', 'country'].forEach(function (k) { if (p[k]) cx[k] = p[k]; });
          var meta = {};
          Object.keys(mSel).forEach(function (k) { if (mSel[k] && k !== 'date' && k !== 'number' && k !== 'due_date') meta[k] = r.meta[k]; });
          var items = rows.filter(function (o) { return o.on && String(o.it.name || '').trim(); }).map(function (o) {
            var it = o.it, x = { name: it.name, qty: it.qty == null ? 1 : it.qty, unit: it.unit || '', price: it.price == null ? '' : it.price, code: it.code || '', depot: it.depot || '' };
            if (it.vat != null) x.vat = it.vat;
            if (o.pick) { var pp = products.filter(function (pr) { return String(pr.id) === o.pick; })[0]; if (pp) { x.product_id = pp.id; if (!x.code && pp.code) x.code = pp.code; } }
            return x;
          });
          var data = { _fromPdf: true, customer: p.name, customer_id: mc ? mc.id : null, phone: p.phone || '', email: p.email || '', address: p.address || '', tax_no: p.tax_no || '', cx: cx, meta: meta, items: items };
          if (mSel.date && r.meta.date) data.date = r.meta.date;
          if (mSel.number && r.meta.number) data.number = r.meta.number;
          if (mSel.due_date && r.meta.due_date) data.due_date = r.meta.due_date;
          data.currency = dstCur;
          if (srcCur !== dstCur) data._fxFrom = srcCur;
          m.close(); done(data);
        } })
      ], 'xwide');
    }

    // ----- Müşteriler -----
    var cflt = '';
    function loadCust() {
      var my = ++seq;
      return Promise.all([
        q('SELECT * FROM customers ORDER BY name COLLATE NOCASE LIMIT 5000'),
        q("SELECT customer_id AS id, currency_code AS cur, COUNT(*) AS n, SUM(total) AS t FROM invoices WHERE customer_id IS NOT NULL AND status <> 'cancelled' GROUP BY customer_id, currency_code"),
        q('SELECT COUNT(*) AS n FROM invoices WHERE customer_id IS NULL')
      ]).then(function (r) { if (!alive || my !== seq) return; drawCust(r[0], r[1], r[2][0] ? r[2][0].n : 0); }).catch(function (e) { custBox.textContent = String(e && e.message || e); });
    }
    function drawCust(rows, agg, unlinked) {
      custBox.innerHTML = '';
      var by = {};
      agg.forEach(function (a) { var b = by[a.id] || (by[a.id] = { n: 0, t: [] }); b.n += a.n; b.t.push(money(a.t, a.cur)); });
      var qIn = el('input', { type: 'search', placeholder: t('custSearch'), value: cflt, oninput: function (e) { cflt = e.target.value; paint(); } });
      custBox.appendChild(el('div', { class: 'toolbar' }, [
        el('div', { class: 'filters' }, [el('div', { class: 'search' }, [qIn])]),
        el('div', { class: 'actions' }, [
          unlinked ? el('button', { type: 'button', class: 'btn', title: t('custImportHint'), text: '⇣ ' + t('custImport') + ' (' + unlinked + ')', onclick: function (e) {
            e.target.disabled = true;
            run('importInvoiceCustomers', {}, null).then(function (x) { toast(t('custImported', { n: x && x.added || 0 })); loadCust(); }, function () { e.target.disabled = false; });
          } }) : null,
          el('button', { type: 'button', class: 'btn primary', text: '+ ' + t('custNewBtn'), onclick: function () { openCustomer(null); } })
        ])
      ]));
      var box = el('div', { class: 'card table-card' });
      custBox.appendChild(box);
      var paint = function () {
        box.innerHTML = '';
        var qq = low(cflt).trim();
        var list = rows.filter(function (c) { return !qq || [c.name, c.tax_no, c.phone, c.email, c.city, c.tax_office].some(function (v) { return low(v).indexOf(qq) >= 0; }); });
        if (!list.length) { box.appendChild(el('div', { class: 'empty-state', style: 'padding:28px;text-align:center', text: rows.length ? t('noMatch') : t('custEmpty') })); return; }
        box.appendChild(el('table', { class: 'table fat-tbl' }, [
          el('thead', null, [el('tr', null, [t('cName'), fLabel('cust', { k: 'tax_no' }, lang()), fLabel('cust', { k: 'phone' }, lang()), fLabel('cust', { k: 'city' }, lang()), t('custInvoices'), ''].map(function (h, i) { return el('th', { class: i === 2 || i === 3 ? 'hide-m' : '', text: h }); }))]),
          el('tbody', null, list.map(function (c) {
            var b = by[c.id];
            return el('tr', { class: 'fat-click', onclick: function (e) { if (!e.target.closest('button')) openCustomer(c); } }, [
              el('td', null, [el('b', { text: c.name }), c.tax_office ? el('div', { class: 'muted small', text: c.tax_office }) : null]),
              el('td', { dir: 'ltr', class: 'nowrap', text: c.tax_no || '' }), el('td', { dir: 'ltr', class: 'hide-m', text: c.phone || '' }), el('td', { class: 'hide-m', text: c.city || '' }),
              el('td', null, b ? [el('span', { text: b.n + ' · ' }), el('span', { class: 'fat-num', dir: 'ltr', text: b.t.join(' + ') })] : [el('span', { class: 'muted', text: '—' })]),
              el('td', null, [el('div', { class: 'fat-acts' }, [
                el('button', { type: 'button', class: 'btn', title: t('custInvoice'), text: '🧾', onclick: function () { invoiceFor(c); } }),
                el('button', { type: 'button', class: 'btn', title: t('edit'), text: '✎', onclick: function () { openCustomer(c); } }),
                el('button', { type: 'button', class: 'btn danger-soft', title: t('del'), text: '🗑', onclick: function () { delCustomer(c, b ? b.n : 0); } })
              ])])
            ]);
          }))
        ]));
      };
      paint();
    }
    function invoiceFor(c) {
      var ex = jparse(c.extra, {}) || {}, cx = {};
      layOn(CFG || {}, 'cust').forEach(function (f) { if (f.custom) { if (ex[f.k]) cx[f.k] = ex[f.k]; } else if (['tax_no', 'address', 'phone', 'email'].indexOf(f.k) < 0 && c[f.k]) cx[f.k] = c[f.k]; });
      showTab('inv');
      openEditor(null, { customer: c.name, customer_id: c.id, phone: c.phone || '', email: c.email || '', address: c.address || '', tax_no: c.tax_no || '', cx: cx });
    }
    function delCustomer(c, n) {
      confirmBox(n ? t('custDelUsed', { n: n }) : t('custDel')).then(function (ok) { if (ok) run('deleteCustomer', { id: c.id }, t('deleted')).then(loadCust, function () {}); });
    }
    function openCustomer(c) {
      (CFG ? Promise.resolve(CFG) : loadCfg()).then(function (cfg) {
        var d = c ? Object.assign({}, c) : { name: '' };
        var ex = jparse(d.extra, {}) || {};
        var fs = layOn(cfg, 'cust');
        var kids = [field(t('cName'), el('input', { value: d.name || '', oninput: function (e) { d.name = e.target.value; } }), { span: 2 })];
        fs.forEach(function (f) {
          var get = f.custom ? ex[f.k] || '' : d[f.k] || '';
          var x = el(f.k === 'address' ? 'textarea' : 'input', { rows: f.k === 'address' ? '2' : null, value: get, dir: { tax_no: 1, phone: 1, email: 1, web: 1, postal_code: 1 }[f.k] ? 'ltr' : null,
            oninput: function (e) { if (f.custom) ex[f.k] = e.target.value; else d[f.k] = e.target.value; } });
          if (f.k === 'address') x.value = get;
          kids.push(field(fLabel('cust', f, lang()), x, { span: f.k === 'address' ? 2 : 1 }));
        });
        var nt = el('textarea', { rows: '2', oninput: function (e) { d.note = e.target.value; } }); nt.value = d.note || '';
        kids.push(field(t('note'), nt, { span: 2 }));
        var hist = el('div', { class: 'fat-hist' });
        if (c) {
          q('SELECT id, number, date, total, paid, currency_code, status FROM invoices WHERE customer_id = ? ORDER BY date DESC, id DESC LIMIT 300', [c.id]).then(function (rows) {
            hist.innerHTML = '';
            hist.appendChild(el('h3', { class: 'section-title', text: t('custHistory') + ' (' + rows.length + ')' }));
            if (!rows.length) { hist.appendChild(el('div', { class: 'muted', text: t('custNoInv') })); return; }
            var by = {};
            rows.forEach(function (x) { if (x.status === 'cancelled') return; var b = by[x.currency_code] || (by[x.currency_code] = { t: 0, p: 0 }); b.t += x.total; b.p += x.paid; });
            hist.appendChild(el('div', { class: 'fat-chips' }, Object.keys(by).map(function (k) { return el('span', { class: 'pm-chip', dir: 'ltr', text: money(by[k].t, k) + ' · ' + t('paid') + ' ' + money(by[k].p, k) }); })));
            hist.appendChild(el('table', { class: 'table fat-tbl' }, [el('tbody', null, rows.map(function (x) {
              return el('tr', null, [el('td', { class: 'fat-no', dir: 'ltr', text: x.number }), el('td', { text: dmy(x.date) }), el('td', { class: 'num fat-num', dir: 'ltr', text: money(x.total, x.currency_code) }), el('td', null, [el('span', { class: 'fat-st ' + x.status, text: t('st_' + x.status) })]),
                el('td', null, [el('button', { type: 'button', class: 'btn small', text: '👁', onclick: function () { q('SELECT * FROM invoices WHERE id = ?', [x.id]).then(function (z) { if (z[0]) openPreview(z[0]); }); } })])]);
            }))]));
          });
        }
        var foot = [el('button', { type: 'button', class: 'btn', text: t('close'), onclick: function () { m.close(); } })];
        if (c) foot.push(el('button', { type: 'button', class: 'btn', text: '🧾 ' + t('custInvoice'), onclick: function () { m.close(); invoiceFor(c); } }));
        foot.push(el('button', { type: 'button', class: 'btn primary', text: t('save'), onclick: function (e) {
          if (!String(d.name || '').trim()) { toast(t('errCustomer'), 'error'); return; }
          e.target.disabled = true;
          var p = { id: c ? c.id : undefined, match: false, mode: 'full', extra: ex };
          ['name', 'tax_office', 'tax_no', 'address', 'district', 'city', 'postal_code', 'country', 'phone', 'email', 'web', 'note'].forEach(function (k) { p[k] = d[k] == null ? '' : String(d[k]); });
          run('saveCustomer', p, t('saved')).then(function () { m.close(); loadCust(); }, function () { e.target.disabled = false; });
        } }));
        var m = modal(c ? c.name : t('custNewBtn'), [el('div', { class: 'form' }, kids), hist], foot, 'wide');
      });
    }

    // ----- Ürünler -----
    var pflt = '';
    function loadProd() {
      var my = ++seq;
      return q("SELECT p.*, (SELECT MAX(x.date) FROM product_prices x WHERE x.product_id = p.id AND x.source = 'invoice') AS last_sale, (SELECT SUM(x.qty) FROM product_prices x WHERE x.product_id = p.id AND x.source = 'invoice') AS sold, (SELECT COUNT(DISTINCT x.invoice_id) FROM product_prices x WHERE x.product_id = p.id AND x.source = 'invoice') AS ninv FROM products p ORDER BY p.name COLLATE NOCASE LIMIT 5000")
        .then(function (rows) { if (!alive || my !== seq) return; drawProd(rows); }).catch(function (e) { prodBox.textContent = String(e && e.message || e); });
    }
    function drawProd(rows) {
      prodBox.innerHTML = '';
      var qIn = el('input', { type: 'search', placeholder: t('prodSearch'), value: pflt, oninput: function (e) { pflt = e.target.value; paint(); } });
      prodBox.appendChild(el('div', { class: 'toolbar' }, [
        el('div', { class: 'filters' }, [el('div', { class: 'search' }, [qIn])]),
        el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn primary', text: '+ ' + t('prodNewBtn'), onclick: function () { openProduct(null); } })])
      ]));
      prodBox.appendChild(el('div', { class: 'field-hint', text: t('prodHint') }));
      var box = el('div', { class: 'card table-card' });
      prodBox.appendChild(box);
      var paint = function () {
        box.innerHTML = '';
        var qq = low(pflt).trim();
        var list = rows.filter(function (p) { return !qq || [p.name, p.code, p.depot, p.description].some(function (v) { return low(v).indexOf(qq) >= 0; }); });
        if (!list.length) { box.appendChild(el('div', { class: 'empty-state', style: 'padding:28px;text-align:center', text: rows.length ? t('noMatch') : t('prodEmpty') })); return; }
        box.appendChild(el('table', { class: 'table fat-tbl' }, [
          el('thead', null, [el('tr', null, [fLabel('prod', { k: 'code' }, lang()), t('itemName'), fLabel('prod', { k: 'price' }, lang()), fLabel('cols', { k: 'vat' }, lang()), fLabel('prod', { k: 'depot' }, lang()), t('prodLast'), ''].map(function (h, i) { return el('th', { class: (i === 2 ? 'num' : '') + (i === 3 || i === 4 || i === 5 ? ' hide-m' : ''), text: h }); }))]),
          el('tbody', null, list.map(function (p) {
            return el('tr', { class: 'fat-click', onclick: function (e) { if (!e.target.closest('button')) openProduct(p); } }, [
              el('td', { dir: 'ltr', class: 'nowrap', text: p.code || '' }),
              el('td', null, [el('b', { text: p.name }), p.unit && p.unit !== 'pcs' ? el('span', { class: 'muted small', text: ' · ' + p.unit }) : null]),
              el('td', { class: 'num fat-num', dir: 'ltr', text: p.sale_price != null ? money(p.sale_price, p.cost_currency || 'USD') : '—' }),
              el('td', { class: 'hide-m', dir: 'ltr', text: p.vat_rate != null ? '%' + num(p.vat_rate) : '' }),
              el('td', { class: 'hide-m', text: p.depot || '' }),
              el('td', { class: 'hide-m', text: p.last_sale ? dmy(p.last_sale) + ' · ' + num(p.sold) + ' ' + (p.unit && p.unit !== 'pcs' ? p.unit : '') : '' }),
              el('td', null, [el('div', { class: 'fat-acts' }, [
                el('button', { type: 'button', class: 'btn', title: t('edit'), text: '✎', onclick: function () { openProduct(p); } }),
                el('button', { type: 'button', class: 'btn danger-soft', title: t('del'), text: '🗑', onclick: function () { delProduct(p); } })
              ])])
            ]);
          }))
        ]));
      };
      paint();
    }
    function delProduct(p) {
      confirmBox(p.ninv ? t('prodDelUsed', { n: p.ninv }) : t('prodDel')).then(function (ok) { if (ok) run('deleteProduct', { id: p.id }, t('deleted')).then(loadProd, function () {}); });
    }
    function openProduct(p) {
      (CFG ? Promise.resolve(CFG) : loadCfg()).then(function (cfg) {
        var d = p ? { name: p.name, code: p.code || '', unit: p.unit && p.unit !== 'pcs' ? p.unit : '', sale_price: p.sale_price == null ? '' : p.sale_price, currency: p.cost_currency || (cfg.defaults || {}).currency || 'USD', vat_rate: p.vat_rate == null ? '' : p.vat_rate, depot: p.depot || '', description: p.description || '' }
          : { name: '', code: '', unit: '', sale_price: '', currency: (cfg.defaults || {}).currency || 'USD', vat_rate: (cfg.defaults || {}).tax_rate || '', depot: '', description: '' };
        var ex = jparse(p && p.extra, {}) || {};
        var inp = function (k, a) { var x = el(a && a.tag || 'input', Object.assign({ value: d[k] == null ? '' : String(d[k]), oninput: function (e) { d[k] = e.target.value; } }, a || {}, { tag: null })); if (a && a.tag === 'textarea') x.value = d[k] || ''; return x; };
        var kids = [field(t('itemName'), inp('name'), { span: 2 })];
        layOn(cfg, 'prod').forEach(function (f) {
          var lb = fLabel('prod', f, lang());
          if (f.custom) { var x = el('input', { value: ex[f.k] || '', oninput: function (e) { ex[f.k] = e.target.value; } }); kids.push(field(lb, x)); return; }
          if (f.k === 'price') {
            kids.push(field(lb, el('div', { class: 'fat-inrow' }, [inp('sale_price', { type: 'number', step: 'any', min: '0', dir: 'ltr' }),
              el('select', { onchange: function (e) { d.currency = e.target.value; } }, CUR.map(function (c) { return opt(c, c + ' · ' + SYM[c], d.currency === c); }))]), { group: true }));
          } else if (f.k === 'vat') kids.push(field(lb, inp('vat_rate', { type: 'number', step: 'any', min: '0', max: '100', dir: 'ltr' })));
          else if (f.k === 'description') kids.push(field(lb, inp('description', { tag: 'textarea', rows: '2' }), { span: 2 }));
          else kids.push(field(lb, inp(f.k, f.k === 'code' ? { dir: 'ltr' } : null)));
        });
        var hist = el('div', { class: 'fat-hist' });
        if (p) {
          q("SELECT x.*, i.number, i.customer_name FROM product_prices x LEFT JOIN invoices i ON i.id = x.invoice_id WHERE x.product_id = ? ORDER BY x.date DESC, x.id DESC LIMIT 300", [p.id]).then(function (rows) {
            hist.innerHTML = '';
            var sales = rows.filter(function (x) { return x.source === 'invoice'; });
            hist.appendChild(el('h3', { class: 'section-title', text: t('prodPrices') }));
            if (!rows.length) hist.appendChild(el('div', { class: 'muted', text: t('prodNoHist') }));
            else hist.appendChild(el('table', { class: 'table fat-tbl' }, [el('thead', null, [el('tr', null, [t('date'), fLabel('prod', { k: 'price' }, lang()), t('prodSource'), t('customer'), t('qty')].map(function (h) { return el('th', { text: h }); }))]),
              el('tbody', null, rows.map(function (x) {
                return el('tr', null, [el('td', { text: dmy(x.date) }), el('td', { class: 'fat-num', dir: 'ltr', text: money(x.price, x.currency_code || 'USD') }),
                  el('td', { dir: x.number ? 'ltr' : null, text: x.source === 'invoice' ? x.number || '—' : t('prodManual') }), el('td', { text: x.customer_name || '' }), el('td', { dir: 'ltr', text: x.qty != null ? String(num(x.qty)) : '' })]);
              }))]));
            if (sales.length) {
              var tq = sales.reduce(function (a, x) { return a + num(x.qty); }, 0), custs = {};
              sales.forEach(function (x) { if (x.customer_name) custs[x.customer_name] = 1; });
              hist.appendChild(el('div', { class: 'field-hint', text: t('prodSold', { q: tq, n: Object.keys(custs).length, i: sales.length }) }));
            }
          });
        }
        var m = modal(p ? p.name : t('prodNewBtn'), [el('div', { class: 'form' }, kids), hist], [
          el('button', { type: 'button', class: 'btn', text: t('close'), onclick: function () { m.close(); } }),
          el('button', { type: 'button', class: 'btn primary', text: t('save'), onclick: function (e) {
            if (!String(d.name || '').trim()) { toast(t('errProdName'), 'error'); return; }
            e.target.disabled = true;
            run('saveProductCard', { id: p ? p.id : undefined, name: d.name, code: d.code, unit: d.unit, sale_price: d.sale_price, currency: d.currency, vat_rate: d.vat_rate, depot: d.depot, description: d.description, extra: ex }, t('saved'))
              .then(function () { m.close(); loadProd(); }, function () { e.target.disabled = false; });
          } })
        ], 'wide');
      });
    }

    // ----- düzen düzenleyicisi (ayarlarda): sütunlar / fatura bilgileri / müşteri / ürün alanları -----
    function layEditor(kind, list) {
      var box = el('div', { class: 'fat-ff fat-lay' });
      var draw = function () {
        box.innerHTML = '';
        list.forEach(function (f, i) {
          if (f.del) return;
          var row = el('div', { class: 'r' + (f.on ? '' : ' off') });
          var cb = el('input', { type: 'checkbox', disabled: f.lock ? true : null, title: f.lock ? t('layLocked') : null, onchange: function (e) { f.on = e.target.checked; row.classList.toggle('off', !f.on); } }); cb.checked = !!f.on;
          var lb = el('input', { value: f.label || '', placeholder: f.custom ? t('sFFNew') : fLabel(kind, { k: f.k }, lang()), oninput: function (e) { f.label = e.target.value; } });
          var mv = function (d) { var j = i + d; while (list[j] && list[j].del) j += d; if (j < 0 || j >= list.length) return; var x = list[i]; list[i] = list[j]; list[j] = x; draw(); };
          row.appendChild(cb); row.appendChild(lb);
          row.appendChild(el('span', { class: 'muted small', text: f.custom ? t('layCustom') : f.lock ? '🔒' : '' }));
          row.appendChild(el('div', { class: 'bt' }, [
            el('button', { type: 'button', class: 'icon-btn tiny', title: t('sFFUp'), text: '↑', onclick: function () { mv(-1); } }),
            el('button', { type: 'button', class: 'icon-btn tiny', title: t('sFFDown'), text: '↓', onclick: function () { mv(1); } }),
            f.lock ? null : el('button', { type: 'button', class: 'icon-btn tiny danger', title: t('remove'), text: '✕', onclick: function () { if (f.custom) list.splice(i, 1); else { f.del = true; f.on = false; } draw(); } })
          ]));
          box.appendChild(row);
        });
        box.appendChild(el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:4px' }, [
          el('button', { type: 'button', class: 'btn small', text: t('sFFAdd'), onclick: function () {
            list.push({ k: kind.charAt(0) + '_' + Date.now().toString(36), label: '', on: true, custom: true }); draw();
            var rs = box.querySelectorAll('.r'); var ins = rs[rs.length - 1].querySelectorAll('input'); if (ins[1]) ins[1].focus();
          } }),
          el('button', { type: 'button', class: 'btn small ghost', text: t('layReset'), onclick: function () {
            var std = layStd(kind), cus = list.filter(function (f) { return f.custom; });
            list.length = 0; std.concat(cus).forEach(function (f) { list.push(f); }); draw();
          } })
        ]));
      };
      draw();
      return box;
    }

    // ----- ayarlar -----
    function openSettings() {
      loadCfg().then(function (cfg) {
        var c = Object.assign({}, cfg.company), d = Object.assign({ currency: 'USD', tax_rate: 0, template: 'falcon', lang: lang(), scenario: 'TEMELFATURA', inv_type: 'SATIS', customization: 'TR1.2' }, cfg.defaults);
        var img = { signature: cfg.signature, stamp: cfg.stamp, logo: cfg.logo, logo2: cfg.logo2 || '' };
        // v1.60: fatura düzeni (sütunlar, fatura bilgileri, müşteri ve ürün alanları), karekod / barkod
        var lay = { cols: layOf(cfg, 'cols'), meta: layOf(cfg, 'meta'), cust: layOf(cfg, 'cust'), prod: layOf(cfg, 'prod'), qr: (cfg.layout || {}).qr !== false, barcode: (cfg.layout || {}).barcode !== false };
        var chk = function (k, label) { var x = el('input', { type: 'checkbox', onchange: function (e) { lay[k] = e.target.checked; } }); x.checked = !!lay[k]; return el('label', { class: 'check' }, [x, el('span', { text: label })]); };
        var bound = {};
        var sync = function (k, src) { (bound[k] || []).forEach(function (x) { if (x !== src) x.value = c[k] || ''; }); };
        var ci = function (k, attrs) { var a = Object.assign({ value: c[k] || '', oninput: function (e) { c[k] = e.target.value; sync(k, e.target); } }, attrs || {}); var tag = a.tag || 'input'; delete a.tag; var x = el(tag, a); if (tag === 'textarea') x.value = c[k] || ''; (bound[k] = bound[k] || []).push(x); return x; };
        // alt bilgi alanları düzenleyicisi
        var ff = ffList(c).map(function (f) { return Object.assign({}, f); });
        var ffTitles = (Array.isArray(c.footer_titles) ? c.footer_titles : []).slice(0, 4); while (ffTitles.length < 4) ffTitles.push('');
        var FL = DOC[lang()] ? DOC[lang()].ff : DOC.tr.ff;
        var ffBox = el('div', { class: 'fat-ff' });
        var drawFF = function () {
          ffBox.innerHTML = '';
          Object.keys(bound).forEach(function (k) { bound[k] = bound[k].filter(function (x) { return !x._ff; }); });
          ffBox.appendChild(el('div', { class: 'r hd' }, [el('span'), el('span', { text: t('sFFLabel') }), el('span', { text: t('sFFValue') }), el('span', { text: t('sFFCol') }), el('span')]));
          ff.forEach(function (f, i) {
            var custom = f.k === 'custom' || FF_KEYS.indexOf(f.k) < 0;
            var row = el('div', { class: 'r' + (f.on === false ? ' off' : '') });
            var cb = el('input', { type: 'checkbox', onchange: function (e) { f.on = e.target.checked; row.classList.toggle('off', !f.on); } }); cb.checked = f.on !== false;
            var lb = el('input', { value: f.label || '', placeholder: custom ? t('sFFNew') : FL[f.k], oninput: function (e) { f.label = e.target.value; } });
            var val;
            if (custom) val = el('input', { value: f.value || '', oninput: function (e) { f.value = e.target.value; } });
            else { val = ci(f.k, FF_LTR[f.k] ? { dir: 'ltr' } : null); val._ff = 1; }
            var col = el('select', { onchange: function (e) { f.col = Number(e.target.value); } }, [1, 2, 3, 4].map(function (n) { return opt(n, String(n), Number(f.col) === n); }));
            var mv = function (d) { var j = i + d; if (j < 0 || j >= ff.length) return; var x = ff[i]; ff[i] = ff[j]; ff[j] = x; drawFF(); };
            row.appendChild(cb); row.appendChild(lb); row.appendChild(val); row.appendChild(col);
            row.appendChild(el('div', { class: 'bt' }, [
              el('button', { type: 'button', class: 'icon-btn tiny', title: t('sFFUp'), text: '↑', onclick: function () { mv(-1); } }),
              el('button', { type: 'button', class: 'icon-btn tiny', title: t('sFFDown'), text: '↓', onclick: function () { mv(1); } }),
              el('button', { type: 'button', class: 'icon-btn tiny danger', title: t('remove'), text: '✕', onclick: function () { ff.splice(i, 1); drawFF(); } })
            ]));
            ffBox.appendChild(row);
          });
          ffBox.appendChild(el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:4px' }, [
            el('button', { type: 'button', class: 'btn small', text: t('sFFAdd'), onclick: function () { ff.push({ k: 'custom', label: '', value: '', col: 1, on: true }); drawFF(); var rs = ffBox.querySelectorAll('.r'); var ins = rs[rs.length - 1].querySelectorAll('input'); if (ins[1]) ins[1].focus(); } }),
            el('button', { type: 'button', class: 'btn small ghost', text: t('sFFReset'), onclick: function () {
              ff = ffDefault().concat(ff.filter(function (f) { return f.k === 'custom'; })); drawFF();
            } })
          ]));
        };
        var ffTitleBox = el('div', { class: 'fat-ff-t' }, [0, 1, 2, 3].map(function (i) {
          var D0 = DOC[lang()] || DOC.tr;
          return el('input', { value: ffTitles[i], placeholder: (i + 1) + ' · ' + [D0.seller, D0.contactH, D0.legalH, D0.bankH][i], oninput: function (e) { ffTitles[i] = e.target.value; } });
        }));
        var prefix = el('input', { value: cfg.prefix || 'FAL', dir: 'ltr', maxlength: '12' });
        var imgRow = function (key, transparent, dark) {
          var box = el('div', { class: 'fat-img' });
          var draw = function () {
            box.innerHTML = '';
            var src = key === 'logo' ? logoSrcOf(img.logo, '#ffffff') : key === 'signature' ? (img.signature || SAMPLE_SIGN) : img[key];
            box.appendChild(el('div', { class: 'pv' + ((key === 'logo' && builtinLogo(img.logo)) || dark ? ' dark' : '') }, [src ? el('img', { src: src, alt: '' }) : el('span', { class: 'muted small', text: '—' })]));
            if (key === 'logo') {
              [['falcon', 'sLogoFalcon'], ['falcon-cti', 'sLogoFalconCti']].forEach(function (x) {
                var on = (img.logo || 'falcon') === x[0];
                box.appendChild(el('button', { type: 'button', class: 'btn small' + (on ? ' primary' : ' ghost'), text: (on ? '✓ ' : '') + t(x[1]), onclick: function () { img.logo = x[0]; draw(); } }));
              });
            }
            box.appendChild(el('button', { type: 'button', class: 'btn small' + (key === 'logo' && !builtinLogo(img.logo) ? ' primary' : ''), text: (key === 'logo' ? !builtinLogo(img.logo) : img[key]) ? t('change') : (key === 'logo' ? t('sLogoCustom') : t('upload')), onclick: function () {
              pickImage(transparent).then(function (du) { if (du) { img[key] = du; draw(); } }, function () { toast(t('imgFail'), 'error'); });
            } }));
            var has = key !== 'logo' && !!img[key];
            if (has) box.appendChild(el('button', { type: 'button', class: 'btn small ghost', text: t('remove'), onclick: function () { img[key] = ''; draw(); } }));
            if (key === 'signature') box.appendChild(el('div', { class: 'field-hint', style: 'flex-basis:100%', text: img.signature ? '✓ ' + t('signReal') : '⚠ ' + t('signSample') }));
            if (key === 'stamp' && !img.stamp) box.appendChild(el('span', { class: 'muted small', text: t('stampNone') }));
            if (key === 'logo2' && !img.logo2) box.appendChild(el('span', { class: 'muted small', text: t('logo2None') }));
          };
          draw(); return box;
        };
        var dCur = el('select', { onchange: function (e) { d.currency = e.target.value; } }, CUR.map(function (x) { return opt(x, x + ' · ' + SYM[x], d.currency === x); }));
        var dTax = el('input', { type: 'number', step: 'any', min: '0', max: '100', dir: 'ltr', value: String(d.tax_rate || 0), oninput: function (e) { d.tax_rate = num(e.target.value); } });
        var dTpl = el('select', { onchange: function (e) { d.template = e.target.value; } }, TEMPLATES.map(function (x) { return opt(x, t('tpl' + x.charAt(0).toUpperCase() + x.slice(1)), d.template === x); }));
        var dVt = el('input', { type: 'checkbox', onchange: function (e) { d.vat_on = e.target.checked; } }); dVt.checked = d.vat_on !== false;
        var dSd = el('input', { type: 'checkbox', onchange: function (e) { d.status_stamp = e.target.checked; } }); dSd.checked = d.status_stamp !== false;
        var dLg = el('select', { onchange: function (e) { d.lang = e.target.value; } }, [['tr', 'langTr'], ['en', 'langEn'], ['ar', 'langAr']].map(function (x) { return opt(x[0], t(x[1]), d.lang === x[0]); }));
        var posSel = el('select', { onchange: function (e) { c.info_pos = e.target.value; } }, [['top', 'sPosTop'], ['bottom', 'sPosBottom'], ['both', 'sPosBoth']].map(function (x) { return opt(x[0], t(x[1]), (c.info_pos || 'both') === x[0]); }));
        drawFF();
        var body = [
          el('h3', { class: 'section-title', text: t('sCompany') }),
          el('div', { class: 'form' }, [
            field(t('sName'), ci('name')), field(t('sTax'), ci('tax', { dir: 'ltr' })), field(t('sPhone'), ci('phone', { dir: 'ltr', inputmode: 'tel' })), field(t('sEmail'), ci('email', { type: 'email', dir: 'ltr' })),
            field(t('sAddress'), ci('address', { tag: 'textarea', rows: 2 }), { span: 2 }), field(t('sWeb'), ci('web', { dir: 'ltr' })), field(t('sPrefix'), prefix),
            field(t('sBank'), ci('bank', { tag: 'textarea', rows: 2 }), { span: 2 }), field(t('sFooter'), ci('footer'), { span: 2 }),
            field(t('sPos'), posSel),
            field(t('sFF'), ffBox, { span: 2, group: true, hint: t('sFFHint') }),
            field(t('sFFCols'), ffTitleBox, { span: 2, group: true, hint: t('sFFColsHint') }),
            field(t('sLogo'), imgRow('logo', false), { span: 2, group: true }),
            field(t('sSign'), imgRow('signature', true), { span: 2, group: true }),
            field(t('sStamp'), imgRow('stamp', true), { span: 2, group: true }),
            field(t('sLogo2'), imgRow('logo2', false), { span: 2, group: true, hint: t('sLogo2Hint') })
          ]),
          el('h3', { class: 'section-title', style: 'margin-top:16px', text: t('sLayout') }),
          el('div', { class: 'field-hint', style: 'margin-bottom:8px', text: t('sLayoutHint') }),
          el('div', { class: 'form' }, [
            field(t('layCols'), layEditor('cols', lay.cols), { span: 2, group: true, hint: t('layColsHint') }),
            field(t('layMeta'), layEditor('meta', lay.meta), { span: 2, group: true }),
            field(t('layCust'), layEditor('cust', lay.cust), { span: 2, group: true, hint: t('layCustHint') }),
            field(t('layProd'), layEditor('prod', lay.prod), { span: 2, group: true }),
            el('div', { class: 'span-2 fat-chks' }, [chk('qr', t('layQr')), chk('barcode', t('layBarcode'))])
          ]),
          el('h3', { class: 'section-title', style: 'margin-top:16px', text: t('sDefaults') }),
          el('div', { class: 'form' }, [field(t('currency'), dCur), field(t('taxRate'), dTax, { hint: t('dVatHint') }), field(t('template'), dTpl), field(t('lang'), dLg), el('label', { class: 'check span-2' }, [dSd, el('span', { text: t('statusDefault') })]), el('label', { class: 'check span-2' }, [dVt, el('span', { text: t('vatDefault') })]),
            field(fLabel('meta', { k: 'scenario' }, lang()), el('input', { value: d.scenario || '', list: 'fat-dl-sc', oninput: function (e) { d.scenario = e.target.value; } })),
            field(fLabel('meta', { k: 'inv_type' }, lang()), el('input', { value: d.inv_type || '', list: 'fat-dl-it', oninput: function (e) { d.inv_type = e.target.value; } })),
            field(fLabel('meta', { k: 'customization' }, lang()), el('input', { value: d.customization || '', dir: 'ltr', oninput: function (e) { d.customization = e.target.value; } })),
            el('datalist', { id: 'fat-dl-sc' }, ['TEMELFATURA', 'TICARIFATURA', 'EARSIVFATURA', 'IHRACAT', 'KAMU'].map(function (v) { return el('option', { value: v }); })),
            el('datalist', { id: 'fat-dl-it' }, ['SATIS', 'IADE', 'TEVKIFAT', 'ISTISNA', 'OZELMATRAH', 'IHRACKAYITLI'].map(function (v) { return el('option', { value: v }); }))])
        ];
        var m = modal(t('sTitle'), body, [
          el('button', { type: 'button', class: 'btn', text: t('close'), onclick: function () { m.close(); } }),
          el('button', { type: 'button', class: 'btn', text: '👁 ' + t('preview'), onclick: function () {
            var co = Object.assign({}, c, { footer_fields: ff, footer_titles: ffTitles }); if (!co.name) co.name = 'Falcon System';
            var px = String(prefix.value || 'FAL').trim().replace(/[^\w-]+/g, '').slice(0, 12) || 'FAL';
            var tmp = { company: co, defaults: d, prefix: px, signature: img.signature || '', stamp: img.stamp || '', logo: img.logo || 'falcon', logo2: img.logo2 || '', layout: lay };
            openPreview(sampleInv(tmp, d), { cfg: tmp, tag: t('previewSample'), extra: function () { return []; } });
          } }),
          el('button', { type: 'button', class: 'btn primary', text: t('save'), onclick: function (e) {
            e.target.disabled = true;
            var px = String(prefix.value || 'FAL').trim().replace(/[^\w-]+/g, '').slice(0, 12) || 'FAL';
            c.footer_fields = ff; c.footer_titles = ffTitles;
            Promise.all([sset('invoice_company', JSON.stringify(c)), sset('invoice_defaults', JSON.stringify(d)), sset('invoice_prefix', px),
              sset('invoice_signature', img.signature || ''), sset('invoice_stamp', img.stamp || ''), sset('invoice_logo', img.logo || 'falcon'),
              sset('invoice_layout', JSON.stringify(lay)), sset('invoice_logo2', img.logo2 || '')])
              .then(function () { CFG = null; toast(t('saved')); m.close(); }, function (er) { e.target.disabled = false; toast(String(er && er.message || er), 'error'); });
          } })
        ], 'wide');
      });
    }

    drawTabs(); drawHead(); load(); loadCfg();
    var off = null;
    try { if (F().sync && F().sync.onChanged) off = F().sync.onChanged(function () { CFG = null; reload(); }); } catch (e) {}
    var langObs = new MutationObserver(function () { drawTabs(); drawHead(); reload(); });
    try { langObs.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] }); } catch (e) {}
    return function () { alive = false; try { langObs.disconnect(); } catch (e) {} try { if (typeof off === 'function') off(); } catch (e) {} };
  }

  if (document.head) style(); else document.addEventListener('DOMContentLoaded', style);
  window.FalconFatura = { mount: mount, html: invoiceHtml, savePdf: savePdf, translateNames: translateNames, namesPref: pvNamesPref, logo: falconLogo, version: '1.63.0' };
})();
