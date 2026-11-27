/* v1.59: Fatura sekmesi (masaüstü + telefon aynı dosya).
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
  var TEMPLATES = ['falcon', 'classic', 'minimal'];

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
      items: 'Ürün / hizmet kalemleri', itemName: 'Ürün / hizmet', qty: 'Miktar', unit: 'Birim', price: 'Birim fiyat', line: 'Tutar',
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
      sDefaults: 'Varsayılanlar', sPrefix: 'Fatura no ön eki', sLogo: 'Logo', sLogoFalcon: 'Falcon logosu', sLogoCustom: 'Kendi logom',
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
      items: 'Products / services', itemName: 'Product / service', qty: 'Qty', unit: 'Unit', price: 'Unit price', line: 'Amount',
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
      sDefaults: 'Defaults', sPrefix: 'Invoice number prefix', sLogo: 'Logo', sLogoFalcon: 'Falcon logo', sLogoCustom: 'My own logo',
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
      items: 'المنتجات / الخدمات', itemName: 'المنتج / الخدمة', qty: 'الكمية', unit: 'الوحدة', price: 'سعر الوحدة', line: 'المبلغ',
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
      sDefaults: 'الإعدادات الافتراضية', sPrefix: 'بادئة رقم الفاتورة', sLogo: 'الشعار', sLogoFalcon: 'شعار فالكون', sLogoCustom: 'شعاري الخاص',
      sSign: 'التوقيع', sStamp: 'ختم الشركة', upload: 'رفع', change: 'تغيير', remove: 'إزالة',
      signSample: 'يُستخدم الآن توقيع «نموذج». ارفع توقيعك الأصلي (PNG شفاف هو الأفضل؛ الخلفية البيضاء تُجعل شفافة تلقائياً).',
      signReal: 'يُستخدم توقيعك الخاص.', stampNone: 'لا يوجد ختم (اختياري).', imgFail: 'تعذّرت قراءة الصورة.',
      tplFalcon: 'Falcon System (مؤسسي)', tplClassic: 'كلاسيكي', tplMinimal: 'بسيط',
      saved: 'تم الحفظ', deleted: 'تم الحذف', pdfSaved: 'ملف PDF جاهز', product: 'اختر من المنتجات',
      errItems: 'أدخل بنداً واحداً على الأقل (اسم المنتج / الخدمة).', errCustomer: 'اكتب اسم العميل.',
      langTr: 'التركية', langEn: 'الإنجليزية', langAr: 'العربية', previewTitle: 'معاينة الفاتورة', overdue: 'متأخرة', previewDraft: 'مسودة غير محفوظة', previewSample: 'فاتورة نموذجية', previewSampleCust: 'شركة العميل النموذجي', previewSampleItem1: 'خدمة استشارية', previewSampleItem2: 'تدريب (ساعة)', zoomFit: 'ملاءمة', zoomFull: '100%'
    }
  };
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

  function lang() { var l = (document.documentElement.lang || 'tr').slice(0, 2); return TX[l] ? l : 'tr'; }
  function t(k, v) { var s = (TX[lang()][k] || TX.tr[k] || k); if (v) for (var x in v) s = s.split('{' + x + '}').join(v[x]); return s; }
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
    return Promise.all(['invoice_company', 'invoice_defaults', 'invoice_prefix', 'invoice_signature', 'invoice_stamp', 'invoice_logo'].map(sget)).then(function (r) {
      CFG = {
        company: jparse(r[0], {}), defaults: jparse(r[1], {}), prefix: r[2] || 'FAL',
        signature: r[3] || '', stamp: r[4] || '', logo: r[5] || 'falcon'
      };
      if (!CFG.company.name) CFG.company.name = 'Falcon CTI';
      return CFG;
    });
  }

  // ---------- logolar / örnek imza ----------
  var EAGLE = 'M251.05 92.0967C250.533 92.7811 249.926 93.5547 249.222 94.3965C246.431 97.7327 242.143 102.152 236.17 106.463C224.232 115.079 205.538 123.285 178.526 121.544L178.253 122.835L178.255 122.836C178.256 122.836 178.257 122.836 178.259 122.837C178.263 122.838 178.268 122.84 178.275 122.843C178.29 122.848 178.311 122.856 178.339 122.866C178.394 122.886 178.475 122.914 178.581 122.951C178.794 123.025 179.107 123.132 179.513 123.264C180.324 123.527 181.504 123.891 182.987 124.296C185.953 125.106 190.136 126.08 195.007 126.742C203.996 127.964 215.395 128.127 225.827 124.163C225.383 124.646 224.854 125.198 224.236 125.799C221.988 127.986 218.587 130.829 213.987 133.44C204.798 138.657 190.796 142.965 171.579 139.221L171.251 140.511L171.452 139.875L171.252 140.511L171.253 140.512C171.254 140.512 171.255 140.512 171.257 140.513C171.26 140.514 171.266 140.516 171.272 140.518C171.286 140.522 171.305 140.527 171.33 140.535C171.381 140.551 171.456 140.574 171.555 140.604C171.751 140.663 172.041 140.749 172.413 140.855C173.158 141.069 174.238 141.366 175.577 141.702C178.255 142.374 181.977 143.205 186.155 143.834C193.377 144.921 202.077 145.426 209.094 143.395C208.962 143.501 208.826 143.614 208.682 143.727C206.789 145.202 203.826 147.129 199.574 148.898C191.076 152.435 177.398 155.355 156.789 152.734C139.171 150.492 124.902 150.202 115.363 154.311C110.561 156.379 106.94 159.568 104.709 164.174C102.811 168.092 101.942 172.991 102.152 179.02C97.4753 168.611 100.111 157.963 104.968 149.688C107.613 145.181 110.901 141.41 113.974 138.812C115.51 137.513 116.98 136.518 118.276 135.87C119.507 135.255 120.519 134.983 121.259 135.003L121.403 135.011C124.668 135.285 126.988 136.6 128.394 138.065C129.099 138.801 129.567 139.567 129.816 140.252C130.07 140.949 130.077 141.504 129.953 141.86L129.506 143.139L130.791 142.714C132.058 142.295 132.95 141.573 133.523 140.591C134.085 139.629 134.31 138.47 134.356 137.22C134.448 134.753 133.843 131.62 133.4 128.39C132.96 125.169 131.437 122.935 129.835 120.9C128.337 118.997 126.821 117.313 125.837 115.103C136.082 109.714 150.197 105.732 169.452 106.085C206.128 106.757 232.573 104.865 251.05 92.0967ZM7.28711 9.03809C14.1231 30.4343 33.9153 48.0768 63.3721 69.9375C86.1395 86.8358 94.3589 104.379 96.918 117.646C98.1991 124.287 98.0647 129.874 97.6123 133.795C97.4365 135.319 97.2112 136.59 97.0039 137.573C93.7672 127.848 85.2798 121.71 75.7891 117.602C65.5294 113.161 53.9201 111.016 46.0996 109.303C29.864 105.745 20.5195 96.4424 15.2236 88.0293C12.573 83.8183 10.9362 79.8286 9.96289 76.8936C9.8445 76.5365 9.73605 76.1952 9.63672 75.8711C13.9912 81.5036 20.9254 86.2062 27.0967 89.6357C30.7903 91.6884 34.2451 93.304 36.7764 94.4062C38.0422 94.9575 39.0782 95.381 39.7988 95.667C40.159 95.8099 40.4408 95.9191 40.6328 95.9922C40.7288 96.0287 40.8026 96.0565 40.8525 96.0752C40.8775 96.0845 40.8972 96.0909 40.9102 96.0957C40.9166 96.0981 40.9214 96.1003 40.9248 96.1016C40.9264 96.1021 40.9278 96.1022 40.9287 96.1025L40.9297 96.1035C40.93 96.1036 40.9308 96.1035 41.1602 95.4775L40.9307 96.1035L41.458 94.8818C23.9496 86.1147 15.4909 74.1545 11.3984 64.4121C9.34989 59.5353 8.39237 55.2062 7.94727 52.1016C7.82506 51.2491 7.74248 50.4892 7.68555 49.8359C13.5258 59.3455 22.6539 66.1762 30.5195 70.6963C34.7819 73.1457 38.6898 74.9273 41.5332 76.0967C42.9552 76.6815 44.112 77.1139 44.915 77.4004C45.3166 77.5437 45.6301 77.6503 45.8438 77.7217C45.9503 77.7572 46.0322 77.7837 46.0879 77.8018C46.1158 77.8108 46.1378 77.8176 46.1523 77.8223C46.1596 77.8246 46.1651 77.8269 46.1689 77.8281C46.1709 77.8287 46.1727 77.8288 46.1738 77.8291L46.1748 77.8301C46.1752 77.8301 46.1784 77.822 46.375 77.1943L46.1758 77.8301L46.7471 76.6406C24.2919 61.5272 14.4964 43.6136 10.3027 29.501C8.20439 22.4395 7.5065 16.3229 7.33301 11.9766C7.28923 10.8797 7.27824 9.89568 7.28711 9.03809Z';
  var WORD = '<g><path d="M43.96 194.048V197.852H30.375V207.343H41.5176V211.093H30.375V224.388H25.667V194.048H43.96Z"/><path d="M69.4429 194.048L80.4282 224.388H75.5337L73.186 217.037L73.0376 216.573H61.4692L61.3179 217.03L58.8823 224.388H53.9653L64.9507 194.048H69.4429ZM66.5981 200.432L62.9438 211.901L62.6665 212.77H71.8384L71.5581 211.899L67.8677 200.431L67.23 198.448L66.5981 200.432Z"/><path d="M98.374 194.048V220.584H111.325V224.388H93.666V194.048H98.374Z"/><path d="M137.627 193.469C141.221 193.469 144.238 194.337 146.715 196.04L144.989 199.655C142.956 198.39 140.606 197.761 137.952 197.761C135.834 197.761 133.926 198.228 132.238 199.166C130.55 200.105 129.225 201.408 128.26 203.067C127.297 204.729 126.83 206.625 126.83 208.739C126.83 211.103 127.321 213.198 128.324 215.012C129.337 216.825 130.757 218.231 132.568 219.218C134.396 220.2 136.526 220.674 138.93 220.674C140.081 220.674 141.207 220.562 142.302 220.335C143.219 220.139 144.248 219.83 145.387 219.417L146.213 223.224C145.462 223.565 144.866 223.815 144.42 223.975C144.024 224.123 143.581 224.256 143.086 224.376L142.573 224.493C141.821 224.655 141.036 224.778 140.218 224.862C139.392 224.955 138.53 225.003 137.627 225.003C135.223 225.003 133.147 224.689 131.387 224.081C129.738 223.511 128.232 222.645 126.873 221.484L126.604 221.249C125.116 219.902 123.92 218.248 123.022 216.275L122.847 215.876C121.941 213.717 121.489 211.454 121.489 209.083C121.489 206.863 121.89 204.783 122.688 202.841C123.485 200.89 124.632 199.175 126.136 197.693C127.678 196.185 129.337 195.11 131.109 194.459C132.885 193.806 135.05 193.469 137.627 193.469Z"/><path d="M174.183 193.469C177.418 193.469 180.235 194.137 182.656 195.451C185.079 196.766 186.952 198.604 188.292 200.964C189.637 203.311 190.321 206.06 190.321 209.227C190.321 212.32 189.622 215.041 188.241 217.411C186.863 219.781 184.978 221.637 182.577 222.99C180.181 224.328 177.388 225.003 174.183 225.003C170.987 225.003 168.188 224.328 165.768 222.988C163.349 221.635 161.456 219.779 160.07 217.41C158.699 215.041 158.009 212.32 158.009 209.227C158.009 206.06 158.692 203.311 160.037 200.966C161.386 198.606 163.271 196.767 165.708 195.451C168.14 194.136 170.958 193.469 174.183 193.469ZM174.183 197.363C172.087 197.363 170.183 197.882 168.48 198.927C166.792 199.97 165.475 201.393 164.531 203.181C163.578 204.968 163.116 206.99 163.116 209.227C163.116 211.456 163.579 213.479 164.532 215.274C165.477 217.054 166.793 218.468 168.479 219.508C170.183 220.554 172.087 221.073 174.183 221.073C176.288 221.073 178.189 220.554 179.872 219.506C181.539 218.466 182.849 217.053 183.797 215.275C184.746 213.479 185.214 211.457 185.214 209.227C185.214 207.128 184.803 205.22 183.97 203.518L183.798 203.18C182.85 201.394 181.541 199.971 179.873 198.929C178.189 197.882 176.288 197.363 174.183 197.363Z"/><path d="M210.865 194.048L223.493 213.8C223.816 214.311 224.079 214.775 224.287 215.192L224.477 215.593C224.712 216.126 224.925 216.641 225.115 217.136L226.404 216.897V194.048H230.769V224.677H225.462L212.09 204.502L211.056 202.611C210.967 202.442 210.9 202.301 210.825 202.151C210.787 202.063 210.74 201.913 210.686 201.678L209.37 201.828V224.388H204.951V194.048H210.865Z"/><path d="M118.062 234.271C119.078 234.271 119.932 234.485 120.646 234.89L120.418 235.37C119.742 235.037 118.991 234.873 118.172 234.873C117.367 234.873 116.623 235.055 115.962 235.429C115.317 235.79 114.8 236.296 114.428 236.944C114.058 237.595 113.887 238.327 113.887 239.122C113.887 240.009 114.069 240.82 114.459 241.524C114.848 242.216 115.395 242.757 116.096 243.142C116.821 243.524 117.633 243.695 118.515 243.695C118.941 243.695 119.36 243.654 119.767 243.573C119.976 243.532 120.197 243.475 120.43 243.404L120.534 243.887C120.432 243.93 120.345 243.968 120.272 243.996C120.11 244.056 119.921 244.113 119.702 244.165C119.43 244.208 119.169 244.251 118.902 244.285C118.643 244.317 118.363 244.333 118.062 244.333C117.26 244.333 116.591 244.232 116.039 244.044C115.484 243.849 114.983 243.552 114.533 243.151C114.093 242.749 113.733 242.262 113.455 241.684L113.341 241.431C113.05 240.731 112.905 240.004 112.905 239.248C112.905 238.524 113.035 237.856 113.289 237.241C113.543 236.627 113.909 236.078 114.388 235.599C114.815 235.179 115.27 234.874 115.746 234.673L115.952 234.594C116.52 234.385 117.216 234.271 118.062 234.271Z"/><path d="M134.605 234.47V234.909H131.294V244.116H130.547V234.909H127.238V234.47H134.605Z"/><path d="M142.847 234.47V244.116H142.083V234.47H142.847Z"/></g>';
  function falconLogo(color, withWord) {
    var vb = withWord ? '0 0 256 256' : '0 0 256 186';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '"><g fill="' + color + '" stroke="' + color + '" stroke-width="1.33"><path d="' + EAGLE + '"/>' + (withWord ? WORD : '') + '</g></svg>');
  }
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
    minimal: { ink: '#111827', accent: '#2563eb', soft: '#f8fafc', line: '#e5e7eb' }
  };
  function invoiceHtml(inv, cfg, forPdf) {
    var lg = DOC[inv.lang] ? inv.lang : lang();
    var D = DOC[lg], rtl = lg === 'ar', cur = inv.currency_code, tpl = PALETTE[inv.template] ? inv.template : 'falcon', P = PALETTE[tpl];
    var items = jparse(inv.items, []); if (!Array.isArray(items)) items = [];
    var c = cfg.company || {};
    var logoSrc = cfg.logo && cfg.logo !== 'falcon' ? cfg.logo : falconLogo(tpl === 'falcon' ? '#ffffff' : P.ink, true);
    var sign = cfg.signature || SAMPLE_SIGN;
    var other = ['tr', 'en', 'ar'].filter(function (x) { return x !== lg; }).map(function (x) { return DOC[x].title; }).join(' · ');
    var remaining = rnd((inv.total || 0) - (inv.paid || 0), cur);
    var st = inv.status || 'pending';
    var M = function (n) { return '<span dir="ltr" class="m">' + esc(money(n, cur, lg)) + '</span>'; };
    var L = function (x) { return '<span dir="ltr">' + esc(x) + '</span>'; };
    var pos = c.info_pos === 'top' || c.info_pos === 'bottom' ? c.info_pos : 'both';
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
      var tt = String(fTitles[i] || '').trim(); tt = tt === '-' ? '' : (tt || fDef[i]);
      return '<div class="fc">' + (tt ? '<h5>' + esc(tt) + '</h5>' : '') + x + '</div>';
    }).join('');
    var rows = items.map(function (it, i) {
      return '<tr><td class="c">' + (i + 1) + '</td><td>' + esc(it.name) + '</td><td class="n">' + esc(fmt(it.qty, 'X', lg).replace(/[.,]00$/, '')) +
        '</td><td class="c">' + esc(it.unit || '') + '</td><td class="n">' + M(it.price) + '</td><td class="n">' + M(rnd(it.qty * it.price, cur)) + '</td></tr>';
    }).join('');
    var totals = '<tr><td>' + D.subtotal + '</td><td class="n">' + M(inv.subtotal) + '</td></tr>' +
      (inv.discount ? '<tr><td>' + D.discount + '</td><td class="n">− ' + M(inv.discount) + '</td></tr>' : '') +
      (inv.tax_rate ? '<tr><td>' + D.tax + ' (%' + esc(fmt(inv.tax_rate, 'X', lg).replace(/[.,]00$/, '')) + ')</td><td class="n">' + M(inv.tax) + '</td></tr>' : '') +
      '<tr class="g"><td>' + D.grand + '</td><td class="n">' + M(inv.total) + '</td></tr>' +
      (inv.paid > 0 ? '<tr><td>' + D.paid + '</td><td class="n">' + M(inv.paid) + '</td></tr><tr class="r"><td>' + D.remaining + '</td><td class="n">' + M(remaining) + '</td></tr>' : '');
    var font = rtl ? "'Noto Sans Arabic','Segoe UI',Tahoma,Arial,sans-serif" : "'Segoe UI','Inter',Arial,'Noto Sans Arabic',sans-serif";
    var css =
      '@page{size:210mm 297mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}table{color:inherit;font-size:inherit;font-family:inherit}' +
      '.inv{width:210mm;min-height:297mm;padding:0 0 16mm;font-family:' + font + ';color:' + P.ink + ';font-size:10.5pt;background:#fff;position:relative;-webkit-print-color-adjust:exact;print-color-adjust:exact;display:flex;flex-direction:column}' +
      '.hd{display:flex;justify-content:space-between;align-items:center;gap:10mm;padding:12mm 14mm 9mm;' + (tpl === 'falcon' ? 'background:' + P.ink + ';color:#fff;border-bottom:3px solid ' + P.accent + ';' : tpl === 'classic' ? 'border-bottom:2px solid ' + P.ink + ';margin:0 14mm;padding:12mm 0 7mm;' : 'border-bottom:1px solid ' + P.line + ';margin:0 14mm;padding:12mm 0 7mm;') + '}' +
      '.brand{display:flex;align-items:center;gap:5mm}.brand img{height:' + (tpl === 'minimal' ? '20mm' : '25mm') + ';width:auto}' +
      '.co{font-size:9pt;line-height:1.55;opacity:.95}.co b{font-size:13pt;display:block;margin-bottom:1mm;letter-spacing:.02em}' +
      '.tt{text-align:' + (rtl ? 'left' : 'right') + '}.tt h1{margin:0;font-size:' + (rtl ? '26pt' : '24pt') + ';letter-spacing:' + (rtl ? '0' : '.14em') + ';font-weight:800;color:' + (tpl === 'falcon' ? '#fff' : P.accent) + '}' +
      '.tt .o{font-size:8.5pt;opacity:.75;margin-top:1mm}.meta{margin-top:3mm;font-size:9.5pt;line-height:1.6}.meta span{opacity:.75}' +
      '.body{padding:8mm 14mm 0;flex:1}' +
      '.parties{display:flex;justify-content:space-between;gap:8mm;margin-bottom:7mm}' +
      '.box{flex:1;background:' + P.soft + ';border-' + (rtl ? 'right' : 'left') + ':3px solid ' + P.accent + ';padding:4mm 5mm;border-radius:2mm;font-size:9.5pt;line-height:1.6}' +
      '.box h3{margin:0 0 1.5mm;font-size:8.5pt;text-transform:uppercase;letter-spacing:.08em;opacity:.7}.box b{font-size:11.5pt}' +
      '.stbox{display:flex;flex-direction:column;align-items:' + (rtl ? 'flex-start' : 'flex-end') + ';justify-content:center;gap:2mm;min-width:45mm}' +
      '.st{display:inline-block;border:2px solid currentColor;border-radius:2mm;padding:1.5mm 4mm;font-weight:800;letter-spacing:.08em;font-size:11pt;transform:rotate(' + (rtl ? '4' : '-4') + 'deg)}' +
      '.st.paid{color:#15803d}.st.partial{color:#b45309}.st.pending{color:#b91c1c}.st.cancelled{color:#6b7280}' +
      'table.it{width:100%;border-collapse:collapse;font-size:9.8pt}' +
      'table.it th{background:' + (tpl === 'minimal' ? 'transparent' : P.ink) + ';color:' + (tpl === 'minimal' ? P.ink : '#fff') + ';font-weight:700;padding:2.6mm 2.5mm;text-align:' + (rtl ? 'right' : 'left') + ';font-size:9pt;' + (tpl === 'minimal' ? 'border-bottom:2px solid ' + P.ink + ';' : '') + '}' +
      'table.it td{padding:2.4mm 2.5mm;border-bottom:1px solid ' + P.line + ';vertical-align:top}' +
      (tpl === 'classic' ? 'table.it td,table.it th{border:1px solid ' + P.line + '}' : '') +
      'table.it tr:nth-child(even) td{background:' + (tpl === 'minimal' ? '#fff' : P.soft) + '}' +
      '.n,table.it th.n{text-align:' + (rtl ? 'left' : 'right') + ';white-space:nowrap}.c,table.it th.c{text-align:center}.m{unicode-bidi:isolate}' +
      '.sum{display:flex;justify-content:space-between;gap:8mm;margin-top:6mm;align-items:flex-start}' +
      '.notes{flex:1;font-size:9pt;line-height:1.6}.notes h4{margin:0 0 1mm;font-size:8.5pt;text-transform:uppercase;letter-spacing:.06em;opacity:.7}.notes p{margin:0 0 3mm;white-space:pre-wrap}' +
      'table.tot{width:78mm;border-collapse:collapse;font-size:10pt}table.tot td{padding:1.8mm 2.5mm}table.tot tr+tr td{border-top:1px solid ' + P.line + '}' +
      'table.tot tr.g td{background:' + P.ink + ';color:#fff;font-weight:800;font-size:11.5pt}table.tot tr.r td{font-weight:800;color:#b91c1c}' +
      '.sig{display:flex;justify-content:space-between;align-items:flex-end;gap:10mm;margin-top:10mm;page-break-inside:avoid}' +
      '.sg{width:62mm;text-align:center;font-size:9pt}.sg .im{height:26mm;display:flex;align-items:flex-end;justify-content:center}.sg img{max-height:26mm;max-width:60mm}' +
      '.sg .ln{border-top:1px solid ' + P.ink + ';margin-top:1.5mm;padding-top:1.5mm;font-weight:700}' +
      '.ft{margin:6mm 14mm 0;padding-top:3mm;border-top:1px solid ' + P.line + ';font-size:8pt;line-height:1.5;page-break-inside:avoid}' +
      (tpl === 'falcon' ? '.ft{border-top:2px solid ' + P.accent + '}' : '') +
      '.ft .th{text-align:center;font-style:italic;opacity:.85;margin-bottom:2.5mm;font-size:8.5pt}' +
      '.ft .cols{display:flex;gap:6mm;justify-content:space-between}.ft .fc{flex:1;min-width:0}.ft .fc:first-child{flex:1.25}' +
      '.ft h5{margin:0 0 .8mm;font-size:7.5pt;text-transform:uppercase;letter-spacing:.07em;color:' + P.accent + ';' + (tpl === 'falcon' ? 'filter:brightness(.8);' : '') + '}' +
      '.ft .k{opacity:.65}.ft .ad{white-space:pre-wrap}.inv [dir=ltr]{unicode-bidi:isolate;direction:ltr}' +
      '.ft .bt{display:flex;justify-content:space-between;margin-top:2.5mm;padding-top:1.5mm;border-top:1px dashed ' + P.line + ';font-size:7.5pt;opacity:.7}' +
      '.wm{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;font-size:90pt;font-weight:900;color:rgba(185,28,28,.08);transform:rotate(-24deg)}' +
      '.wmlogo{position:absolute;left:50%;top:52%;width:120mm;transform:translate(-50%,-50%);opacity:.035;pointer-events:none}';
    var body =
      '<div class="inv" dir="' + (rtl ? 'rtl' : 'ltr') + '" lang="' + lg + '">' +
      (tpl !== 'minimal' ? '<img class="wmlogo" src="' + falconLogo(P.ink, false) + '" alt="">' : '') +
      (st === 'cancelled' ? '<div class="wm">' + esc(D.st_cancelled) + '</div>' : '') +
      '<div class="hd"><div class="brand"><img src="' + logoSrc + '" alt=""><div class="co"><b>' + esc(c.name || '') + '</b>' + contact.join('<br>') + '</div></div>' +
      '<div class="tt"><h1>' + esc(D.title) + '</h1><div class="o">' + esc(other) + '</div><div class="meta"><span>' + D.no + ':</span> <b dir="ltr">' + esc(inv.number) + '</b><br><span>' + D.date + ':</span> ' + esc(dmy(inv.date)) +
      (inv.due_date ? '<br><span>' + D.due + ':</span> ' + esc(dmy(inv.due_date)) : '') + '<br><span>' + D.currency + ':</span> ' + esc(cur) + '</div></div></div>' +
      '<div class="body"><div class="parties"><div class="box"><h3>' + D.billTo + '</h3><b>' + esc(inv.customer_name) + '</b>' +
      [inv.customer_address ? esc(inv.customer_address) : '', inv.customer_phone ? '☎ ' + L(inv.customer_phone) : '', inv.customer_email ? '✉ ' + L(inv.customer_email) : '', inv.customer_tax ? esc(D.taxNo) + ': ' + L(inv.customer_tax) : ''].filter(Boolean).map(function (x) { return '<br>' + x; }).join('') +
      '</div><div class="stbox"><span class="st ' + st + '">' + esc(D['st_' + st] || '') + '</span></div></div>' +
      '<table class="it"><thead><tr><th class="c" style="width:9mm">#</th><th>' + D.desc + '</th><th class="n" style="width:18mm">' + D.qty + '</th><th class="c" style="width:18mm">' + D.unit + '</th><th class="n" style="width:32mm">' + D.price + '</th><th class="n" style="width:34mm">' + D.amount + '</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="sum"><div class="notes">' + (inv.note ? '<h4>' + D.note + '</h4><p>' + esc(inv.note) + '</p>' : '') + (c.bank ? '<h4>' + D.bank + '</h4><p>' + esc(c.bank) + '</p>' : '') + '</div><table class="tot">' + totals + '</table></div>' +
      '<div class="sig"><div class="sg"><div class="im">' + (cfg.stamp ? '<img src="' + cfg.stamp + '" alt="">' : '') + '</div><div class="ln">' + D.stamp + '</div></div>' +
      '<div class="sg"><div class="im"><img src="' + sign + '" alt=""></div><div class="ln">' + D.sign + '</div></div></div></div>' +
      '<div class="ft"><div class="th">' + esc(c.footer || D.thanks) + '</div>' + (fcols && pos !== 'top' ? '<div class="cols">' + fcols + '</div>' : '') +
      '<div class="bt"><span>' + esc(c.name || '') + '</span><span dir="ltr">' + esc(inv.number) + ' · ' + esc(dmy(inv.date)) + '</span></div></div></div>';
    if (!forPdf) return { css: css, body: body };
    return '<!doctype html><html lang="' + lg + '" dir="' + (rtl ? 'rtl' : 'ltr') + '"><head><meta charset="utf-8"><title>' + esc(inv.number) + '</title><style>' + css + '</style></head><body>' + body + '</body></html>';
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
      '.fat-items{width:100%;border-collapse:collapse}.fat-items th{font-size:12px;text-align:start;opacity:.75;padding:4px 4px;font-weight:600}' +
      '.fat-items td{padding:3px 4px;vertical-align:middle}.fat-items input{width:100%;min-width:0}.fat-items .q{width:76px}.fat-items .u{width:80px}.fat-items .p{width:120px}.fat-items .l{width:120px;text-align:end;font-variant-numeric:tabular-nums;white-space:nowrap}' +
      '.fat-tot{display:flex;flex-direction:column;align-items:flex-end;gap:4px;font-size:14px}.fat-tot div{display:flex;gap:18px;justify-content:space-between;min-width:260px}.fat-tot .g{font-weight:800;font-size:16px;border-top:1px solid var(--border,#334);padding-top:6px}' +
      '.fat-cash{border:1px solid var(--border,#334);border-radius:12px;padding:12px 14px}.fat-cash .segmented{margin:6px 0 8px;flex-wrap:wrap}.fat-cash .segmented button{flex:1;min-width:140px}' +
      '.fat-pv{background:#7d8595;border-radius:10px;padding:14px;overflow:auto;max-height:70vh}.fat-pv-host{transform-origin:top left;margin:0 auto}' +
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
      '@media (max-width:720px){.fat-items .u{display:none}.fat-items th.uh{display:none}.fat-items .p,.fat-items .l{width:92px}.fat-tbl .hide-m{display:none}.fat-acts{flex-wrap:wrap}.fat-acts .btn{padding:4px 8px}}';
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
    var wrap = el('div', { class: 'stack fatura-page' }, [head, sumBox, listBox]);
    root.innerHTML = ''; root.appendChild(wrap);

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
          el('button', { type: 'button', class: 'btn', text: '⬇ ' + t('pdf'), onclick: function () { savePdf(r).then(function (x) { if (x !== null) toast(t('pdfSaved')); }).catch(function (e) { toast(String(e && e.message || e), 'error'); }); } }),
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
    function openPreview(inv, opts) {
      opts = opts || {};
      (opts.cfg ? Promise.resolve(opts.cfg) : CFG ? Promise.resolve(CFG) : loadCfg()).then(function (cfg) {
        var cur = Object.assign({}, inv);
        var host = el('div', { class: 'fat-pv-host', style: 'width:210mm' });
        var sr = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
        var pv = el('div', { class: 'fat-pv' }, [host]);
        var zoom = 'fit';
        var render = function () {
          var h = invoiceHtml(cur, cfg, false);
          sr.innerHTML = '<style>' + h.css.replace('@page{size:210mm 297mm;margin:0}', '') + '.inv{box-shadow:0 6px 30px rgba(0,0,0,.35)}</style>' + h.body;
          setTimeout(fit, 0);
        };
        var fit = function () {
          var full = host.offsetWidth || 794, hh = Math.max(1123, (sr.firstElementChild && sr.querySelector('.inv') ? sr.querySelector('.inv').offsetHeight : 1123));
          var k = zoom === 'fit' ? Math.min(1, (pv.clientWidth - 28) / full) : 1;
          host.style.transform = 'scale(' + k + ')'; host.style.height = (hh * k) + 'px'; host.style.marginBottom = '0';
        };
        var tplSel = el('select', { onchange: function (e) { cur.template = e.target.value; render(); if (opts.onChange) opts.onChange(cur.template, cur.lang); } },
          TEMPLATES.map(function (x) { return opt(x, t('tpl' + x.charAt(0).toUpperCase() + x.slice(1)), (cur.template || 'falcon') === x); }));
        var lgSel = el('select', { onchange: function (e) { cur.lang = e.target.value; render(); if (opts.onChange) opts.onChange(cur.template, cur.lang); } },
          [['tr', 'langTr'], ['en', 'langEn'], ['ar', 'langAr']].map(function (x) { return opt(x[0], t(x[1]), (cur.lang || lang()) === x[0]); }));
        var zb = el('button', { type: 'button', class: 'btn small', text: t('zoomFull'), onclick: function () { zoom = zoom === 'fit' ? 'full' : 'fit'; zb.textContent = zoom === 'fit' ? t('zoomFull') : t('zoomFit'); fit(); } });
        var bar = el('div', { class: 'fat-pv-bar' }, [
          el('span', { class: 'field-label', text: t('template') }), tplSel, el('span', { class: 'field-label', text: t('lang') }), lgSel,
          el('span', { class: 'sp' }), opts.tag ? el('span', { class: 'fat-pv-tag', text: opts.tag }) : null, zb
        ]);
        var foot = [el('button', { type: 'button', class: 'btn', text: t('close'), onclick: function () { m.close(); } })];
        var m;
        if (opts.extra) foot = foot.concat(opts.extra(function () { return m; }, cur));
        else foot.push(el('button', { type: 'button', class: 'btn primary', text: '⬇ ' + t('pdf'), onclick: function () { savePdf(cur).then(function (x) { if (x !== null) toast(t('pdfSaved')); }); } }));
        m = modal(t('previewTitle') + (cur.number ? ' · ' + cur.number : ''), [bar, pv], foot, 'xwide');
        var onRs = function () { if (!pv.isConnected) { window.removeEventListener('resize', onRs); return; } fit(); };
        window.addEventListener('resize', onRs);
        render();
      });
    }
    // Ayarlardaki şirket bilgileriyle örnek fatura
    function sampleInv(cfg, d) {
      var c = CUR.indexOf(d.currency) >= 0 ? d.currency : 'USD';
      var items = [{ name: t('previewSampleItem1'), qty: 1, unit: '', price: c === 'SYP' ? 1500000 : c === 'TRY' ? 25000 : 750 }, { name: t('previewSampleItem2'), qty: 4, unit: '', price: c === 'SYP' ? 200000 : c === 'TRY' ? 3000 : 90 }];
      var sub = rnd(items.reduce(function (a, it) { return a + it.qty * it.price; }, 0), c), tr = num(d.tax_rate), tax = rnd(sub * tr / 100, c);
      return { number: (cfg.prefix || 'FAL') + '-' + today().slice(0, 4) + '-0001', date: today(), due_date: '', customer_name: t('previewSampleCust'),
        customer_phone: '+90 555 000 00 00', customer_address: '', currency_code: c, items: JSON.stringify(items), subtotal: sub, discount: 0, tax_rate: tr, tax: tax,
        total: rnd(sub + tax, c), paid: 0, status: 'pending', template: d.template || 'falcon', lang: d.lang || lang(), note: '' };
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

    // ----- fatura düzenleyici -----
    function openEditor(inv) {
      Promise.all([CFG ? Promise.resolve(CFG) : loadCfg(), q('SELECT id, name, unit, sale_price, cost_currency FROM products ORDER BY name COLLATE NOCASE').catch(function () { return []; }),
        q('SELECT id, name FROM people ORDER BY name COLLATE NOCASE'),
        q('SELECT customer_name, customer_phone, customer_email, customer_address, customer_tax FROM invoices ORDER BY id DESC LIMIT 400')]).then(function (r) {
        var cfg = r[0], products = r[1], people = r[2], past = r[3];
        var dft = cfg.defaults || {};
        var isNew = !inv;
        var st = {
          number: inv ? inv.number : '', date: inv ? inv.date : today(), due_date: inv ? inv.due_date || '' : '',
          customer: inv ? inv.customer_name : '', phone: inv ? inv.customer_phone || '' : '', email: inv ? inv.customer_email || '' : '',
          address: inv ? inv.customer_address || '' : '', tax_no: inv ? inv.customer_tax || '' : '',
          currency: inv ? inv.currency_code : (CUR.indexOf(dft.currency) >= 0 ? dft.currency : 'USD'),
          template: inv ? inv.template || 'falcon' : (dft.template || 'falcon'), lang: inv ? inv.lang || lang() : (dft.lang || lang()),
          items: inv ? jparse(inv.items, []) : [{ name: '', qty: 1, unit: '', price: '' }],
          discount: inv ? inv.discount || '' : '', tax_rate: inv ? inv.tax_rate || '' : (dft.tax_rate != null && dft.tax_rate !== '' ? dft.tax_rate : 0),
          note: inv ? inv.note || '' : '', cash: false, account_id: '', pay_amount: ''
        };
        if (!Array.isArray(st.items) || !st.items.length) st.items = [{ name: '', qty: 1, unit: '', price: '' }];
        var dlP = 'fat-dl-p-' + Date.now(), dlC = 'fat-dl-c-' + Date.now();
        var names = {}; people.forEach(function (p) { names[p.name] = 1; }); past.forEach(function (p) { names[p.customer_name] = 1; });
        var dl1 = el('datalist', { id: dlP }, products.map(function (p) { return el('option', { value: p.name }); }));
        var dl2 = el('datalist', { id: dlC }, Object.keys(names).sort().map(function (n) { return el('option', { value: n }); }));

        var inp = function (k, attrs) {
          var a = Object.assign({ value: st[k] == null ? '' : String(st[k]), oninput: function (e) { st[k] = e.target.value; if (attrs && attrs.after) attrs.after(); } }, attrs || {});
          delete a.after; return el(a.tag || 'input', a);
        };
        var custIn = inp('customer', { list: dlC, autocomplete: 'off', required: true, after: function () {
          var p = null; for (var i = 0; i < past.length; i++) if (past[i].customer_name === st.customer) { p = past[i]; break; }
          if (p && isNew) { [['phone', 'customer_phone'], ['email', 'customer_email'], ['address', 'customer_address'], ['tax_no', 'customer_tax']].forEach(function (x) { if (!st[x[0]] && p[x[1]]) { st[x[0]] = p[x[1]]; F2[x[0]].value = p[x[1]]; } }); }
        } });
        var F2 = { phone: inp('phone', { dir: 'ltr', inputmode: 'tel' }), email: inp('email', { type: 'email', dir: 'ltr' }), address: inp('address', { tag: 'textarea', rows: 2 }), tax_no: inp('tax_no', { dir: 'ltr' }) };
        F2.address.value = st.address;
        var curSel = el('select', { onchange: function (e) { st.currency = e.target.value; drawCash(); recalc(); } }, CUR.map(function (c) { return opt(c, c + ' · ' + SYM[c], st.currency === c); }));
        var tplSel = el('select', { onchange: function (e) { st.template = e.target.value; } }, TEMPLATES.map(function (x) { return opt(x, t('tpl' + x.charAt(0).toUpperCase() + x.slice(1)), st.template === x); }));
        var lgSel = el('select', { onchange: function (e) { st.lang = e.target.value; } }, [['tr', 'langTr'], ['en', 'langEn'], ['ar', 'langAr']].map(function (x) { return opt(x[0], t(x[1]), st.lang === x[0]); }));

        var tbody = el('tbody');
        var totBox = el('div', { class: 'fat-tot' });
        function recalc() {
          var c = st.currency, sub = 0;
          st.items.forEach(function (it, i) { var l = rnd(num(it.qty) * num(it.price), c); sub += l; var cell = tbody.querySelector('[data-l="' + i + '"]'); if (cell) cell.textContent = fmt(l, c); });
          sub = rnd(sub, c);
          var disc = Math.min(sub, rnd(num(st.discount), c)), tax = rnd((sub - disc) * num(st.tax_rate) / 100, c), tot = rnd(sub - disc + tax, c);
          totBox.innerHTML = '';
          totBox.appendChild(el('div', null, [el('span', { text: t('subtotal') }), el('b', { dir: 'ltr', text: money(sub, c) })]));
          if (disc) totBox.appendChild(el('div', null, [el('span', { text: t('discount') }), el('b', { dir: 'ltr', text: '− ' + money(disc, c) })]));
          if (num(st.tax_rate)) totBox.appendChild(el('div', null, [el('span', { text: t('tax') + ' (%' + num(st.tax_rate) + ')' }), el('b', { dir: 'ltr', text: money(tax, c) })]));
          totBox.appendChild(el('div', { class: 'g' }, [el('span', { text: t('grand') }), el('b', { dir: 'ltr', text: money(tot, c) })]));
          st._total = tot;
          if (payIn && !payTouched) payIn.value = tot ? String(tot) : '';
        }
        function drawItems() {
          tbody.innerHTML = '';
          st.items.forEach(function (it, i) {
            var nm = el('input', { value: it.name || '', list: dlP, autocomplete: 'off', placeholder: t('itemName'), oninput: function (e) {
              it.name = e.target.value;
              var p = null; for (var j = 0; j < products.length; j++) if (products[j].name === it.name) { p = products[j]; break; }
              if (p) {
                it.product_id = p.id;
                if (!it.unit && p.unit) { it.unit = p.unit; un.value = p.unit; }
                if ((it.price === '' || it.price == null || num(it.price) === 0) && p.sale_price && (!p.cost_currency || p.cost_currency === st.currency)) { it.price = p.sale_price; pr.value = p.sale_price; }
                recalc();
              } else it.product_id = null;
            } });
            var qt = el('input', { class: 'q', type: 'number', step: 'any', min: '0', dir: 'ltr', value: it.qty == null ? '' : String(it.qty), oninput: function (e) { it.qty = e.target.value; recalc(); } });
            var un = el('input', { class: 'u', value: it.unit || '', oninput: function (e) { it.unit = e.target.value; } });
            var pr = el('input', { class: 'p', type: 'number', step: 'any', min: '0', dir: 'ltr', value: it.price == null ? '' : String(it.price), oninput: function (e) { it.price = e.target.value; recalc(); } });
            tbody.appendChild(el('tr', null, [
              el('td', null, [nm]), el('td', null, [qt]), el('td', { class: 'u' }, [un]), el('td', null, [pr]),
              el('td', { class: 'l', 'data-l': String(i), dir: 'ltr' }),
              el('td', null, [el('button', { type: 'button', class: 'icon-btn tiny danger', title: t('removeItem'), text: '✕', onclick: function () { st.items.splice(i, 1); if (!st.items.length) st.items.push({ name: '', qty: 1, unit: '', price: '' }); drawItems(); } })])
            ]));
          });
          recalc();
        }
        var itemsTable = el('table', { class: 'fat-items' }, [el('thead', null, [el('tr', null, [
          el('th', { text: t('itemName') }), el('th', { class: 'q', text: t('qty') }), el('th', { class: 'uh', text: t('unit') }), el('th', { text: t('price') }), el('th', { style: 'text-align:end', text: t('line') }), el('th')
        ])]), tbody]);

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

        var form = el('div', { class: 'form' }, [
          field(t('cName'), custIn), field(t('cPhone'), F2.phone), field(t('cEmail'), F2.email), field(t('cTax'), F2.tax_no),
          field(t('cAddress'), F2.address, { span: 2 }),
          field(t('date'), inp('date', { type: 'date' })), field(t('due'), inp('due_date', { type: 'date' })),
          field(t('currency'), curSel), field(t('invNo'), inp('number', { dir: 'ltr', placeholder: 'FAL-…' }), { hint: t('invNoHint') }),
          field(t('template'), tplSel), field(t('lang'), lgSel),
          el('div', { class: 'field span-2' }, [el('span', { class: 'field-label', text: t('items') }), itemsTable,
            el('div', null, [el('button', { type: 'button', class: 'btn small', text: t('addItem'), onclick: function () { st.items.push({ name: '', qty: 1, unit: '', price: '' }); drawItems(); var ins = tbody.querySelectorAll('tr:last-child input'); if (ins[0]) ins[0].focus(); } })])]),
          field(t('discount'), inp('discount', { type: 'number', step: 'any', min: '0', dir: 'ltr', after: recalc })),
          field(t('taxRate'), inp('tax_rate', { type: 'number', step: 'any', min: '0', max: '100', dir: 'ltr', after: recalc })),
          el('div', { class: 'span-2' }, [totBox]),
          field(t('note'), inp('note', { tag: 'textarea', rows: 2 }), { span: 2 }),
          cashBox, dl1, dl2
        ]);
        var submit = function (withPdf, btn) {
          if (!String(st.customer).trim()) { toast(t('errCustomer'), 'error'); custIn.focus(); return; }
          var items = st.items.filter(function (it) { return String(it.name || '').trim(); }).map(function (it) { return { name: it.name, qty: num(it.qty), unit: it.unit || '', price: num(it.price), product_id: it.product_id || null }; });
          if (!items.length) { toast(t('errItems'), 'error'); return; }
          btn.disabled = true;
          var payload = {
            id: inv ? inv.id : undefined, number: st.number, date: st.date, due_date: st.due_date, customer: { name: String(st.customer).trim() },
            customer_phone: st.phone, customer_email: st.email, customer_address: st.address, customer_tax: st.tax_no, currency: st.currency, items: items,
            discount: num(st.discount), tax_rate: num(st.tax_rate), note: st.note, template: st.template, lang: st.lang,
            record_cash: isNew && st.cash, account_id: st.account_id ? Number(st.account_id) : null, pay_amount: payTouched ? num(st.pay_amount) : ''
          };
          run('saveInvoice', payload, t('saved')).then(function (res) {
            m.close(); load();
            if (withPdf && res && res.id) q('SELECT * FROM invoices WHERE id = ?', [res.id]).then(function (x) { if (x[0]) return savePdf(x[0]); });
          }, function () { btn.disabled = false; });
        };
        // kaydetmeden önizleme: düzenleyicideki bilgilerden taslak fatura
        var nextNo = function () {
          if (String(st.number).trim()) return Promise.resolve(String(st.number).trim());
          if (!isNew) return Promise.resolve(inv.number);
          var pre = (cfg.prefix || 'FAL') + '-' + String(st.date || today()).slice(0, 4) + '-';
          return q('SELECT number FROM invoices WHERE number LIKE ?', [pre + '%']).then(function (rs) {
            var mx = 0; rs.forEach(function (x) { var n = parseInt(String(x.number).slice(pre.length), 10); if (n > mx) mx = n; });
            return pre + String(mx + 1).padStart(4, '0');
          }).catch(function () { return pre + '0001'; });
        };
        var draftInv = function (no) {
          var c = st.currency, items = st.items.filter(function (it) { return String(it.name || '').trim(); }).map(function (it) { return { name: it.name, qty: num(it.qty), unit: it.unit || '', price: num(it.price) }; });
          var sub = rnd(items.reduce(function (a, it) { return a + rnd(it.qty * it.price, c); }, 0), c);
          var disc = Math.min(sub, rnd(num(st.discount), c)), tax = rnd((sub - disc) * num(st.tax_rate) / 100, c), tot = rnd(sub - disc + tax, c);
          var paid = inv ? inv.paid || 0 : (st.cash ? Math.min(tot, payTouched ? rnd(num(st.pay_amount), c) : tot) : 0);
          var status = inv && inv.status === 'cancelled' ? 'cancelled' : paid >= tot && tot > 0 ? 'paid' : paid > 0 ? 'partial' : 'pending';
          return { number: no, date: st.date, due_date: st.due_date, customer_name: String(st.customer).trim() || '—', customer_phone: st.phone, customer_email: st.email,
            customer_address: st.address, customer_tax: st.tax_no, currency_code: c, items: JSON.stringify(items), subtotal: sub, discount: disc, tax_rate: num(st.tax_rate),
            tax: tax, total: tot, paid: paid, status: status, template: st.template, lang: st.lang, note: st.note };
        };
        var showPreview = function () {
          nextNo().then(function (no) {
            openPreview(draftInv(no), {
              tag: '✎ ' + t('previewDraft'),
              onChange: function (tp, lg) { st.template = tp; st.lang = lg; tplSel.value = tp; lgSel.value = lg; },
              extra: function (getM) {
                return [
                  el('button', { type: 'button', class: 'btn', text: t('save'), onclick: function (e) { getM().close(); submit(false, b1); } }),
                  el('button', { type: 'button', class: 'btn primary', text: '⬇ ' + t('saveAndPdf'), onclick: function (e) { getM().close(); submit(true, b2); } })
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
        setTimeout(function () { try { custIn.focus(); } catch (e) {} }, 30);
      });
    }

    // ----- ayarlar -----
    function openSettings() {
      loadCfg().then(function (cfg) {
        var c = Object.assign({}, cfg.company), d = Object.assign({ currency: 'USD', tax_rate: 0, template: 'falcon', lang: lang() }, cfg.defaults);
        var img = { signature: cfg.signature, stamp: cfg.stamp, logo: cfg.logo };
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
            var src = key === 'logo' ? (img.logo && img.logo !== 'falcon' ? img.logo : falconLogo('#ffffff', true)) : key === 'signature' ? (img.signature || SAMPLE_SIGN) : img.stamp;
            box.appendChild(el('div', { class: 'pv' + ((key === 'logo' && (!img.logo || img.logo === 'falcon')) || dark ? ' dark' : '') }, [src ? el('img', { src: src, alt: '' }) : el('span', { class: 'muted small', text: '—' })]));
            box.appendChild(el('button', { type: 'button', class: 'btn small', text: (key === 'signature' ? img.signature : key === 'stamp' ? img.stamp : img.logo !== 'falcon') ? t('change') : t('upload'), onclick: function () {
              pickImage(transparent).then(function (du) { if (du) { img[key] = du; draw(); } }, function () { toast(t('imgFail'), 'error'); });
            } }));
            var has = key === 'logo' ? img.logo && img.logo !== 'falcon' : !!img[key];
            if (has) box.appendChild(el('button', { type: 'button', class: 'btn small ghost', text: key === 'logo' ? t('sLogoFalcon') : t('remove'), onclick: function () { img[key] = key === 'logo' ? 'falcon' : ''; draw(); } }));
            if (key === 'signature') box.appendChild(el('div', { class: 'field-hint', style: 'flex-basis:100%', text: img.signature ? '✓ ' + t('signReal') : '⚠ ' + t('signSample') }));
            if (key === 'stamp' && !img.stamp) box.appendChild(el('span', { class: 'muted small', text: t('stampNone') }));
          };
          draw(); return box;
        };
        var dCur = el('select', { onchange: function (e) { d.currency = e.target.value; } }, CUR.map(function (x) { return opt(x, x + ' · ' + SYM[x], d.currency === x); }));
        var dTax = el('input', { type: 'number', step: 'any', min: '0', max: '100', dir: 'ltr', value: String(d.tax_rate || 0), oninput: function (e) { d.tax_rate = num(e.target.value); } });
        var dTpl = el('select', { onchange: function (e) { d.template = e.target.value; } }, TEMPLATES.map(function (x) { return opt(x, t('tpl' + x.charAt(0).toUpperCase() + x.slice(1)), d.template === x); }));
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
            field(t('sStamp'), imgRow('stamp', true), { span: 2, group: true })
          ]),
          el('h3', { class: 'section-title', style: 'margin-top:16px', text: t('sDefaults') }),
          el('div', { class: 'form' }, [field(t('currency'), dCur), field(t('taxRate'), dTax), field(t('template'), dTpl), field(t('lang'), dLg)])
        ];
        var m = modal(t('sTitle'), body, [
          el('button', { type: 'button', class: 'btn', text: t('close'), onclick: function () { m.close(); } }),
          el('button', { type: 'button', class: 'btn', text: '👁 ' + t('preview'), onclick: function () {
            var co = Object.assign({}, c, { footer_fields: ff, footer_titles: ffTitles }); if (!co.name) co.name = 'Falcon CTI';
            var px = String(prefix.value || 'FAL').trim().replace(/[^\w-]+/g, '').slice(0, 12) || 'FAL';
            var tmp = { company: co, defaults: d, prefix: px, signature: img.signature || '', stamp: img.stamp || '', logo: img.logo || 'falcon' };
            openPreview(sampleInv(tmp, d), { cfg: tmp, tag: t('previewSample'), extra: function () { return []; } });
          } }),
          el('button', { type: 'button', class: 'btn primary', text: t('save'), onclick: function (e) {
            e.target.disabled = true;
            var px = String(prefix.value || 'FAL').trim().replace(/[^\w-]+/g, '').slice(0, 12) || 'FAL';
            c.footer_fields = ff; c.footer_titles = ffTitles;
            Promise.all([sset('invoice_company', JSON.stringify(c)), sset('invoice_defaults', JSON.stringify(d)), sset('invoice_prefix', px),
              sset('invoice_signature', img.signature || ''), sset('invoice_stamp', img.stamp || ''), sset('invoice_logo', img.logo || 'falcon')])
              .then(function () { CFG = null; toast(t('saved')); m.close(); }, function (er) { e.target.disabled = false; toast(String(er && er.message || er), 'error'); });
          } })
        ], 'wide');
      });
    }

    drawHead(); load(); loadCfg();
    var off = null;
    try { if (F().sync && F().sync.onChanged) off = F().sync.onChanged(function () { CFG = null; load(); }); } catch (e) {}
    var langObs = new MutationObserver(function () { drawHead(); load(); });
    try { langObs.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] }); } catch (e) {}
    return function () { alive = false; try { langObs.disconnect(); } catch (e) {} try { if (typeof off === 'function') off(); } catch (e) {} };
  }

  if (document.head) style(); else document.addEventListener('DOMContentLoaded', style);
  window.FalconFatura = { mount: mount, html: invoiceHtml, savePdf: savePdf, logo: falconLogo, version: '1.59.2' };
})();
