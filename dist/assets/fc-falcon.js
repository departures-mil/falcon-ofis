/* Falcon Ofis v1.58 — ortak çekirdek yapıştırıcısı (React paketine dokunmadan, contact-falcon.js gibi DOM ile).
 * Çekirdek: ../cekirdek/fc-core.js (departures-mil/ortak-cekirdek, sürümü cekirdek/VERSION).
 *  - Dil ve tema Falcon'da kalır (React z() / FalconFX); çekirdek ikisini izler, çekirdekten yapılan seçim Falcon'a geçer.
 *  - Renk şeması seçici (falcon varsayılan + çekirdeğin yerleşik şemaları; "klasik" yok: Falcon'un eski görünümü zaten falcon).
 *  - Üst çubuk: ✦ Asistan Agent (Eşitle'nin önünde), çekirdeğin Güncelle düğmesi (Wi‑Fi'den sonra), pencere düğmelerine Orta.
 *  - Ayarlar: Asistan Agent · Otomatik hata raporu · Arşiv · Hakkında kartları "Admin ile iletişim"den ÖNCE (iletişim en sonda).
 *  - Güncelleme: GitHub Releases latest.json (yama ya da tam app.asar; program klasörü yazılamıyorsa kurulum).
 *  - Eski kabuk köprüsü: bu sürüm eski güncelleyicinin klasöründen çalışıyorsa "Yeni kurulum gerekli" penceresi.
 *  - İlk açılış rehberi (PIN açıldıktan sonra, yalnız yeni kullanıcıda), "neler yeni", çökme raporu. */
(function () {
  'use strict';
  var FC = window.FC;
  if (!FC || !window.falcon) return;
  var F = window.falcon, de = document.documentElement, ui = FC.ui;
  var APP = 'falcon-ofis', LANGS = ['tr', 'en', 'ar'];

  var NEWS = {
    '1.62.0': {
      tr: "- Fatura: kâr ekleme. Düzenleyicide kalemlerin altındaki «Kâr ekle» kutusuna oranı yazın (ör. %15) ya da hazır düğmelerden seçin, «Tüm kalemlere uygula» ile bütün fiyatlar yükselir ve toplama eklenir.\n- Tek bir kalem için birim fiyatın yanındaki ％ düğmesi: o kaleme ayrı kâr eklenir, kaldırılabilir.\n- Kâr her zaman ilk (kârsız) fiyat üzerinden hesaplanır, tekrar uygulanınca üst üste binmez; «Tüm kârları kaldır» ilk fiyatları geri getirir. Toplamlar kısmında «Dahil kâr» tutarı görünür.\n- Döviz çevirisiyle birlikte çalışır; ürün kayıtlarındaki fiyatlar değişmez.",
      en: "- Invoice: add profit. In the editor, type a rate in the «Add profit» box under the lines (e.g. 15%) or pick a ready button, then «Apply to all lines» raises every price and the totals.\n- For a single line, use the ％ button next to its unit price: that line gets its own profit, which can be removed.\n- Profit is always calculated on the original (no-profit) price, so applying it again does not stack; «Remove all profit» restores the original prices. The totals show the «Profit included» amount.\n- Works together with currency conversion; saved product prices are not changed.",
      ar: "- الفاتورة: إضافة هامش ربح. في محرر الفاتورة اكتب النسبة في خانة «إضافة هامش ربح» أسفل البنود (مثلاً 15%) أو اختر أحد الأزرار الجاهزة، ثم «تطبيق على جميع البنود» فترتفع جميع الأسعار ويُضاف ذلك إلى الإجمالي.\n- لبند واحد استخدم زر ％ بجانب سعر الوحدة: يُضاف لذلك البند ربح مستقل ويمكن إزالته.\n- يُحسب الربح دائماً على السعر الأصلي (دون ربح) فلا يتراكم عند إعادة تطبيقه، و«إزالة كل الأرباح» تعيد الأسعار الأصلية. ويظهر مبلغ «الربح المتضمَّن» في قسم الإجماليات.\n- يعمل مع تحويل العملات، ولا تتغير أسعار المنتجات المحفوظة."
    },
    '1.61.5': {
      tr: "- PDF'den doldur: gerçek bir 28 kalemli e-Fatura ile yapay zekâ (Gemini) okuması denendi; çevrimdışı okumayla rakamlar birebir teyit edildi. Büyük faturalarda yapay zekâ 2–3 dakika sürebildiği için bekleme süresi 4 dakikaya çıkarıldı (istediğinizde «Beklemeden çevrimdışı oku» düğmesi hâlâ var).\n- Yapay zekâ müşteri adının sonuna «SN.» / «SAYIN» eklediğinde bu artık atılıyor.",
      en: "- Fill from PDF: AI (Gemini) reading was tested with a real 28-line e-invoice and the figures were verified exactly by the offline reading. Because the AI can take 2–3 minutes on large invoices, the waiting limit is now 4 minutes (the «Read offline without waiting» button is still there).\n- When the AI adds «SN.» / «SAYIN» to the end of the customer name, it is now removed.",
      ar: "- التعبئة من PDF: جُرّبت قراءة الذكاء الاصطناعي (Gemini) على فاتورة إلكترونية حقيقية من 28 بنداً، وتم التحقق من الأرقام بالقراءة دون اتصال وكانت متطابقة تماماً. ولأن الذكاء الاصطناعي قد يستغرق دقيقتين إلى ثلاث دقائق في الفواتير الكبيرة، رُفعت مدة الانتظار إلى 4 دقائق (ولا يزال زر «القراءة دون اتصال دون انتظار» متاحاً).\n- عندما يضيف الذكاء الاصطناعي «SN.» / «SAYIN» إلى آخر اسم العميل تُحذف الآن."
    },
    '1.61.4': {
      tr: "- Fatura: fiyatlar başka para biriminde girildiyse (ör. PDF'ten TL geldi, fatura USD) «Döviz kuru» kutusunda «Fiyatlar şu birimde girildiyse: TRY → Hepsini USD birimine çevir» ile tek tuşta hepsi çevrilir.\n- PDF'den doldur: «PDF'teki fiyatların para birimi → Fatura para birimi» seçimi. Farklı seçilirse bütün fiyatlar aktarılırken güncel kurla otomatik çevrilir; orijinal fiyat saklanır.",
      en: "- Invoice: if prices were entered in another currency (e.g. TRY from a PDF on a USD invoice), «If the prices were entered in: TRY → Convert all to USD» in the «Exchange rate» box converts them all with one click.\n- Fill from PDF: «Currency of the prices in the PDF → Invoice currency». If different, all prices are converted automatically at the current rate while importing; the original price is kept.",
      ar: "- الفاتورة: إذا أُدخلت الأسعار بعملة أخرى (مثلاً بالليرة التركية من PDF في فاتورة بالدولار) فإن خيار «إذا أُدخلت الأسعار بعملة: TRY ← تحويل الكل إلى USD» في خانة «سعر الصرف» يحوّلها كلها بنقرة واحدة.\n- التعبئة من PDF: اختيار «عملة الأسعار في ملف PDF ← عملة الفاتورة». عند اختلافهما تُحوَّل جميع الأسعار تلقائياً بسعر الصرف الحالي أثناء الاستيراد، ويُحفظ السعر الأصلي."
    },
    '1.61.3': {
      tr: "- KDV'siz fatura: düzenleyicide «KDV: KDV'li / KDV'siz». KDV'sizde KDV oranı ve tutarı sütunları, toplamdaki KDV satırları ve «Vergiler Dahil Toplam» faturada hiç görünmez, KDV hesaplanmaz.\n- Karekod (QR) ve barkod her fatura için ayrı açılıp kapatılır (düzenleyicide «Kodlar», önizlemede onay kutuları). Bütün faturalar için: Fatura ayarları → Fatura düzeni.\n- Fatura ayarlarında yeni faturalar için varsayılan: KDV'li / KDV'siz.",
      en: "- Invoices without VAT: «VAT: With VAT / No VAT» in the editor. Without VAT, the VAT rate and amount columns, the VAT lines and «Total incl. taxes» are not shown at all and no VAT is calculated.\n- The QR code and barcode can be turned on or off for each invoice («Codes» in the editor, check boxes in the preview). For all invoices: Invoice settings → Invoice layout.\n- Invoice settings have a default for new invoices: with / without VAT.",
      ar: "- فاتورة بدون ضريبة القيمة المضافة: خيار «مع الضريبة / بدون ضريبة» في المحرر. بدون الضريبة لا تظهر أعمدة نسبة الضريبة ومبلغها ولا أسطر الضريبة ولا «الإجمالي شامل الضرائب»، ولا تُحتسب الضريبة.\n- يمكن تشغيل رمز QR والباركود أو إيقافهما لكل فاتورة («الرموز» في المحرر، وخانات اختيار في المعاينة). ولجميع الفواتير: إعدادات الفاتورة ← تخطيط الفاتورة.\n- في إعدادات الفاتورة إعداد افتراضي للفواتير الجديدة: مع الضريبة / بدونها."
    },
    '1.61.2': {
      tr: "- PDF'den doldur: yapay zeka okuduktan sonra PDF bir de çevrimdışı okunup rakamlar karşılaştırılıyor. Aynıysa «✓ Çevrimdışı okumayla teyit edildi» yazar; fark varsa ve PDF'in kendi yazısındaki toplamlar tutuyorsa rakamlar oradan alınır, farklar listelenir. Tek tıkla diğer okumaya geçilebilir.\n- Yapay zeka neden kullanılamadıysa artık doğru yazıyor (anahtar yok, internete ulaşılamadı, zamanında cevap vermedi, kota doldu…). Eskiden büyük model geç cevap verince yanlışlıkla «internet yok» yazıyordu; şimdi daha hızlı modele geçiliyor.\n- Okurken «Beklemeden çevrimdışı oku» ve önizlemede «Yapay zekayla tekrar oku» düğmeleri.",
      en: "- Fill from PDF: after the AI reads the PDF, it is also read offline and the figures are compared. If they match you see «✓ Verified by the offline reading»; if not and the PDF's own totals reconcile, the figures are taken from the PDF text and the differences are listed. You can switch to the other reading with one click.\n- The reason the AI could not be used is now shown correctly (no key, internet unreachable, no answer in time, quota exhausted…). Previously a slow large model was wrongly reported as «no internet»; now a faster model is tried.\n- New «Read offline without waiting» button while reading and «Read again with AI» in the preview.",
      ar: "- التعبئة من PDF: بعد قراءة الملف بالذكاء الاصطناعي يُقرأ أيضاً دون اتصال وتُقارن الأرقام. عند التطابق تظهر عبارة «✓ تم التحقق بالقراءة دون اتصال»؛ وإذا وُجد اختلاف وكانت مجاميع نص الملف نفسه متطابقة تُعتمد الأرقام منه وتُعرض الاختلافات. ويمكن الانتقال إلى القراءة الأخرى بنقرة واحدة.\n- يُعرض الآن السبب الصحيح لتعذّر استخدام الذكاء الاصطناعي (لا يوجد مفتاح، تعذّر الوصول إلى الإنترنت، لم يستجب في الوقت المحدد، نفدت الحصة…). سابقاً كان تأخر النموذج الكبير يُعرض خطأً على أنه «لا يوجد إنترنت»؛ أما الآن فيُنتقل إلى نموذج أسرع.\n- زر «القراءة دون اتصال دون انتظار» أثناء القراءة، وزر «إعادة القراءة بالذكاء الاصطناعي» في المعاينة."
    },
    '1.61.1': {
      tr: "- Fatura: «Ödendi / Ödenmedi / Kısmi ödeme» damgası kaldırılabilir. Düzenleyicide «Ödeme durumu damgası: Durum damgası / Damgasız», önizlemede «Durum damgası» kutusu var. Fatura ayarlarından yeni faturalar için varsayılanı seçebilirsiniz.",
      en: "- Invoice: the «Paid / Unpaid / Partly paid» stamp can be removed. The editor has «Payment status stamp: Status stamp / No stamp» and the preview has a «Status stamp» box. The default for new invoices is set in the invoice settings.",
      ar: "- الفاتورة: يمكن إزالة ختم «مدفوعة / غير مدفوعة / مدفوعة جزئياً». في المحرر خيار «ختم حالة الدفع: ختم الحالة / بدون ختم»، وفي المعاينة خانة «ختم الحالة». ويُحدَّد الإعداد الافتراضي للفواتير الجديدة من إعدادات الفاتورة."
    },
    '1.61.0': {
      tr: "- Fatura: para birimi değişince bütün fiyatlar o birime çevrilir (USD, TL, Suriye lirası arasında her yönde). Çeviri her seferinde orijinal fiyattan yapılır; ilk para birimine dönünce fiyatlar aynen geri gelir.\n- Kur internetten alınır, internet yoksa son kayıtlı kur kullanılır. «Döviz kuru» kutusundan kuru elle düzeltebilirsiniz. Kullanılan kur faturaya ve PDF'e «Döviz Kuru: 1 USD = … TRY» olarak yazılır.\n- Ürün kayıtlarındaki fiyatlar değişmez; kayıtlı bir ürünü başka para birimindeki faturaya eklediğinizde fiyatı otomatik çevrilir.\n- PDF'den doldur: «Tümünü pasif yap» / «Tümünü aktif yap» düğmeleri ve tek tek aç/kapa. Pasif ürünler faturaya ve ürün kayıtlarına girmez, silinmez.",
      en: "- Invoice: when the currency changes, all prices are converted to it (USD, TRY, Syrian pound, in every direction). Each conversion starts from the original price; switching back to the first currency restores the prices exactly.\n- The rate is fetched from the internet; offline the last saved rate is used. You can correct it in the «Exchange rate» box. The rate used is printed on the invoice and PDF as «Exchange Rate: 1 USD = … TRY».\n- Saved product prices are not changed; a saved product added to an invoice in another currency is converted automatically.\n- Fill from PDF: «Deactivate all» / «Activate all» buttons and per-line toggles. Inactive items are left out of the invoice and the product records and are not deleted.",
      ar: "- الفاتورة: عند تغيير العملة تُحوَّل جميع الأسعار إليها (الدولار والليرة التركية والليرة السورية، في كل الاتجاهات). يتم كل تحويل من السعر الأصلي، وعند العودة إلى العملة الأولى تعود الأسعار كما كانت تماماً.\n- يُجلب سعر الصرف من الإنترنت، وعند انقطاعه يُستخدم آخر سعر محفوظ. يمكن تعديل السعر يدوياً من خانة «سعر الصرف». يُطبع السعر المستخدم على الفاتورة وملف PDF بصيغة «سعر الصرف: 1 USD = … TRY».\n- لا تتغير أسعار المنتجات المحفوظة؛ وعند إضافة منتج محفوظ إلى فاتورة بعملة أخرى يُحوَّل سعره تلقائياً.\n- التعبئة من PDF: زرّا «إلغاء تفعيل الكل» و«تفعيل الكل» مع مفتاح لكل بند. البنود غير المفعّلة لا تدخل الفاتورة ولا سجلات المنتجات ولا تُحذف."
    },
    '1.60.2': {
      tr: "- PDF'den doldur: PDF'te Depo ve Stok Kodu bitişik yazılmış satırlar (ör. «K2B04/06 KOM.KNN.05.000180») artık doğru ayrılıyor. 2 sayfalık, 28 kalemli gerçek bir e-Fatura ile denendi: bütün kalemler, KDV ve toplam (95.476,90 TL) birebir okundu.",
      en: "- Fill from PDF: lines where the PDF prints the warehouse and stock code as one piece of text (e.g. «K2B04/06 KOM.KNN.05.000180») are now split correctly. Tested with a real 2-page e-invoice with 28 lines: all lines, VAT and the total (95,476.90 TL) were read exactly.",
      ar: "- التعبئة من PDF: تُفصل الآن بشكل صحيح البنود التي يطبع فيها الملف المستودع ورمز المخزون كنص واحد (مثل «K2B04/06 KOM.KNN.05.000180»). جُرّب على فاتورة إلكترونية حقيقية من صفحتين و28 بنداً: قُرئت جميع البنود وضريبة القيمة المضافة والإجمالي (95,476.90 ليرة) بدقة تامة."
    },
    '1.60.1': {
      tr: "- Arapça ve dar ekran: varsayılan kasa adları (Dolar Kasası, Nakit TL…) İngilizce ve Arapçada kendi dilinde görünür; kayıt adı değişmez, telefonla eşitleme etkilenmez.\n- Tarih kutuları programın dilinde (gg.aa.yyyy); dil değişince bir sonraki açılışta uygulanır.\n- 1366 / 1280 piksel ekranlarda üst çubuk taşmaz; Kapat ve diğer pencere düğmeleri her zaman görünür (düğme yazıları dar ekranda gizlenir).\n- Duyuru penceresi programın temasını izler (koyu temada koyu); 🔔 düğmesi menünün üstüne binmez, «Sor»un üstünde durur.\n- «Sor» asistanı internetsiz de kasa bakiyelerini (≈ USD toplamıyla) ve azalan / biten stoğu söyler; Arapça «كم المال في الصندوق» doğru anlaşılır.",
      en: "- Arabic and narrow screens: default cash box names (USD Cash Box, Cash TRY…) appear in English and Arabic; the stored name is unchanged and phone sync is not affected.\n- Date fields follow the program language; after changing the language it applies on the next start.\n- On 1366 / 1280 px screens the top bar no longer overflows; Close and the other window buttons are always visible (button labels are hidden on narrow screens).\n- The announcement window follows the program theme (dark in dark mode); the 🔔 button no longer covers the menu and sits above «Ask».\n- The «Ask» assistant now gives cash balances (with an ≈ USD total) and low / out-of-stock items without internet; Arabic «كم المال في الصندوق» is understood correctly.",
      ar: "- العربية والشاشات الضيقة: تظهر أسماء الصناديق الافتراضية (صندوق الدولار، نقد بالليرة التركية…) بالإنجليزية والعربية؛ لا يتغيّر الاسم المحفوظ ولا تتأثر المزامنة مع الهاتف.\n- حقول التاريخ تتبع لغة البرنامج؛ عند تغيير اللغة يُطبَّق ذلك عند التشغيل التالي.\n- على شاشات 1366 / 1280 بكسل لا يتجاوز الشريط العلوي حدود الشاشة؛ زر الإغلاق وأزرار النافذة ظاهرة دائماً (تُخفى نصوص الأزرار على الشاشات الضيقة).\n- نافذة الإعلانات تتبع سمة البرنامج (داكنة في الوضع الداكن)؛ زر 🔔 لم يعد يغطي القائمة ويقع فوق زر «اسأل».\n- مساعد «اسأل» يعرض الآن أرصدة الصناديق (مع مجموع تقريبي بالدولار) والمخزون المنخفض / النافد دون إنترنت؛ ويُفهم سؤال «كم المال في الصندوق» بشكل صحيح."
    },
    '1.60.0': {
      tr: "- Fatura: «📄 PDF'den doldur» — PDF faturayı okuyup müşteri, fatura bilgileri, ürünler ve fiyatları otomatik doldurur. Önce kendi yapay zeka anahtarınızla en güçlü model denenir; internet ya da anahtar yoksa çevrimdışı okunur. Doldurmadan önce önizleme açılır, düzeltip onaylarsınız.\n- Yeni standart kalem sütunları: Sıra No, Depo, Stok Kodu, Mal Hizmet, Miktar, Birim Fiyat, Mal Hizmet Tutarı, KDV Oranı, KDV Tutarı. Her satırın KDV'si ayrı hesaplanır.\n- Fatura bilgileri: Tarih, Fatura No, Özelleştirme No, Senaryo, Fatura Tipi, Oluşma Zamanı, ETTN (otomatik), Kampanya Kodu, Kargo Firması.\n- Fatura ayarları → Fatura düzeni: sütunlar, fatura bilgileri, müşteri ve ürün alanları eklenebilir, çıkarılabilir, adı değiştirilebilir ve sıralanabilir.\n- Yeni «e-Fatura (GİB düzeni)» şablonu, karekod (QR) ve barkod, ikinci logo (marka / mağaza).\n- Müşteriler sekmesi: her fatura alıcısı otomatik kaydedilir; aynı VKN ya da ad ikinci kez açılmaz. Müşteri kartında faturaları ve toplamları görünür.\n- Ürünler sekmesi: faturaya giren her ürün kaydedilir, stok kodu ya da adıyla tanınır; fiyat geçmişi silinmez, son fiyat varsayılan gelir.",
      en: "- Invoice: «📄 Fill from PDF» reads a PDF invoice and fills the customer, invoice details, products and prices. Your own AI key is tried first with the strongest model; without internet or a key it is read offline. A preview opens first so you can correct and confirm.\n- New standard line columns: No, Warehouse, Stock Code, Goods / Services, Quantity, Unit Price, Amount, VAT Rate, VAT Amount. VAT is calculated per line.\n- Invoice details: Date, Invoice No, Customization ID, Scenario, Invoice Type, Issue Time, ETTN (automatic), Campaign Code, Carrier.\n- Invoice settings → Invoice layout: columns, invoice details, customer and product fields can be added, removed, renamed and reordered.\n- New «e-Invoice (GİB layout)» template, QR code and barcode, second logo (brand / store).\n- Customers tab: every buyer is saved automatically; the same tax ID or name is never added twice. The customer card shows invoices and totals.\n- Products tab: every invoiced product is saved and recognised by stock code or name; price history is kept and the last price is suggested.",
      ar: "- الفاتورة: «📄 التعبئة من PDF» يقرأ فاتورة PDF ويعبّئ بيانات العميل والفاتورة والمنتجات والأسعار تلقائياً. يُجرَّب أولاً أقوى نموذج بمفتاح الذكاء الاصطناعي الخاص بك، وعند عدم توفر الإنترنت أو المفتاح تُقرأ دون اتصال. تُفتح معاينة قبل التعبئة للتصحيح والتأكيد.\n- أعمدة البنود القياسية الجديدة: الرقم، المستودع، رمز المخزون، السلع / الخدمات، الكمية، سعر الوحدة، المبلغ، نسبة الضريبة، قيمة الضريبة. تُحسب ضريبة القيمة المضافة لكل بند على حدة.\n- بيانات الفاتورة: التاريخ، رقم الفاتورة، رقم التخصيص، السيناريو، نوع الفاتورة، وقت الإنشاء، الرقم الموحد ETTN (تلقائي)، رمز الحملة، شركة الشحن.\n- إعدادات الفواتير ← تخطيط الفاتورة: يمكن إضافة الأعمدة وبيانات الفاتورة وحقول العميل والمنتج وحذفها وإعادة تسميتها وترتيبها.\n- قالب جديد «فاتورة إلكترونية (نموذج GİB)»، ورمز QR وباركود، وشعار ثانٍ (العلامة التجارية / المتجر).\n- تبويب العملاء: يُسجَّل كل مشترٍ تلقائياً، ولا يُضاف الرقم الضريبي أو الاسم نفسه مرتين. تعرض بطاقة العميل فواتيره ومجاميعها.\n- تبويب المنتجات: يُسجَّل كل منتج يرد في فاتورة ويُعرف برمز المخزون أو الاسم، ويُحفظ سجل الأسعار ويُقترح آخر سعر."
    },
    '1.59.4': {
      tr: "- Fatura başına imza: «Yeni fatura» / düzenleme penceresinde «✍ İmza ekle» ya da «⊘ İmzasız» seçilir; önizleme çubuğunda da aç/kapa vardır. İmzasız faturada imza alanı boş kalır, elle imzalanabilir. Seçim yalnız o faturaya uygulanır ve faturayla birlikte eşitlenir.",
      en: "- Signature per invoice: choose «✍ Add signature» or «⊘ No signature» in the «New invoice» / edit window; there is also an on/off switch in the preview bar. Without a signature the signature box is left blank and can be signed by hand. The choice applies to that invoice only and syncs with it.",
      ar: "- التوقيع لكل فاتورة: اختر «✍ إضافة التوقيع» أو «⊘ بدون توقيع» في نافذة «فاتورة جديدة» / التعديل، ويوجد مفتاح تشغيل/إيقاف في شريط المعاينة أيضاً. في الفاتورة بدون توقيع يبقى حقل التوقيع فارغاً ويمكن التوقيع يدوياً. يُطبَّق الاختيار على تلك الفاتورة فقط ويُزامَن معها."
    },
    '1.59.3': {
      tr: "- Yeni standart Falcon logosu: «CTI» yazısı kaldırıldı; faturalarda artık varsayılan olarak bu logo kullanılır.\n- Fatura ayarları → Logo: «Falcon (standart)», «Falcon CTI (eski)» ya da «Kendi logom» seçilebilir.\n- Fatura kalemlerinde uzun ürün adı: Shift+Enter ile alt satıra geçilir, kutu yazıya göre büyür ve tüm metin tek kutuda görünür (Enter miktara geçer). PDF'te ilk satır kalın, alttaki özellik satırları aynen basılır.\n- Kayıtlı ürünler ▾ düğmesiyle ya da yazarken açılan listeden seçilir.",
      en: "- New standard Falcon logo: the «CTI» lettering has been removed; invoices now use this logo by default.\n- Invoice settings → Logo: choose «Falcon (standard)», «Falcon CTI (old)» or «My own logo».\n- Long product names in invoice lines: Shift+Enter starts a new line, the box grows with the text so everything is visible in one box (Enter moves to quantity). In the PDF the first line is bold and the specification lines below are printed as typed.\n- Saved products can be picked with the ▾ button or from the list that opens while typing.",
      ar: "- شعار فالكون القياسي الجديد: أُزيلت كتابة «CTI»، وأصبحت الفواتير تستخدم هذا الشعار افتراضياً.\n- إعدادات الفاتورة ← الشعار: يمكن اختيار «فالكون (القياسي)» أو «فالكون CTI (القديم)» أو «شعاري الخاص».\n- أسماء المنتجات الطويلة في بنود الفاتورة: يُنتقل إلى سطر جديد بـ Shift+Enter، ويتّسع الحقل مع النص ليظهر كله في حقل واحد (Enter ينتقل إلى الكمية). في ملف PDF يكون السطر الأول عريضاً وتُطبع أسطر المواصفات تحته كما كُتبت.\n- تُختار المنتجات المحفوظة بزر ▾ أو من القائمة التي تظهر أثناء الكتابة."
    },
    '1.59.2': {
      tr: "- Fatura önizleme: «Yeni fatura» / düzenleme penceresine 👁 Önizle düğmesi eklendi. Fatura kaydedilmeden PDF'deki haliyle gösterilir; şablon ve fatura dili önizlemede anında değiştirilir, oradan doğrudan «Kaydet» ya da «Kaydet ve PDF». Sığdır / %100 yakınlaştırma.\n- Faturanın altına resmî firma bilgileri bloğu: ünvan, adres, telefon, faks, e-posta, web, vergi dairesi, vergi no, MERSİS no, ticaret sicil no, banka, IBAN — sütunlar hâlinde.\n- Alt bilgi tamamen ayarlanabilir (Fatura ayarları → Alt bilgi alanları): alan aç/kapa, adını değiştir, sırala, 1–4 sütundan birine koy, sil, «+ Alan ekle» ile yeni alan (ör. KEP adresi). Sütun başlıkları da değiştirilebilir.\n- Fatura ayarlarında 👁 Önizle: değişiklikler kaydetmeden örnek bir fatura üzerinde görülür.\n- Firma bilgilerinin yeri seçilebilir (Fatura ayarları): üstte (antette), altta (alt bilgide) ya da ikisinde birden.",
      en: "- Invoice preview: a 👁 Preview button in the «New invoice» / edit window shows the invoice exactly as in the PDF before saving; template and invoice language can be switched in the preview, and you can «Save» or «Save and PDF» from there. Fit / 100% zoom.\n- Formal company details block at the bottom of the invoice: company name, address, phone, fax, e-mail, web, tax office, tax no, MERSIS no, trade registry no, bank, IBAN — in columns.\n- The footer is fully configurable (Invoice settings → Footer fields): turn fields on/off, rename, reorder, place in one of 4 columns, delete, or add new ones with «+ Add field» (e.g. registered e-mail). Column titles can be renamed too.\n- 👁 Preview in invoice settings: changes are shown on a sample invoice before saving.\n- The position of the company details can be chosen (Invoice settings): top (letterhead), bottom (footer) or both.",
      ar: "- معاينة الفاتورة: زر 👁 معاينة في نافذة «فاتورة جديدة» / التعديل يعرض الفاتورة كما ستظهر في ملف PDF قبل الحفظ؛ يمكن تغيير القالب ولغة الفاتورة داخل المعاينة، ومنها «حفظ» أو «حفظ وPDF» مباشرةً. تكبير: ملاءمة / 100%.\n- كتلة بيانات الشركة الرسمية أسفل الفاتورة: الاسم التجاري، العنوان، الهاتف، الفاكس، البريد الإلكتروني، الموقع، دائرة الضرائب، الرقم الضريبي، رقم MERSIS، رقم السجل التجاري، البنك، IBAN — في أعمدة.\n- التذييل قابل للتخصيص بالكامل (إعدادات الفواتير ← حقول التذييل): تفعيل الحقل أو إيقافه، تغيير اسمه، ترتيبه، وضعه في أحد الأعمدة الأربعة، حذفه، أو إضافة حقل جديد بزر «+ إضافة حقل». ويمكن تغيير عناوين الأعمدة أيضاً.\n- 👁 معاينة في إعدادات الفواتير: تظهر التغييرات على فاتورة نموذجية قبل الحفظ.\n- يمكن اختيار موضع بيانات الشركة (إعدادات الفواتير): في الأعلى (الترويسة)، أو في الأسفل (التذييل)، أو في الاثنين معاً."
    },
    '1.59.0': {
      tr: "- Yeni sekme: Fatura (Finans grubunda). Ürün / hizmet satışı kalem kalem girilir; ara toplam, indirim, vergi ve genel toplam kendiliğinden hesaplanır.\n- Resmî PDF fatura: Falcon logosu ve antet, firma e-posta / telefon / adresi, fatura no ve tarih, imza ve kaşe alanı. Üç şablon (Falcon System, Klasik, Sade); fatura Türkçe, İngilizce ya da Arapça (sağdan sola) basılır.\n- Para birimi her faturada seçilir: Suriye Lirası, Türk Lirası, Dolar. Toplamlar her para birimi için ayrı tutulur.\n- Gelir kaydı: fatura keserken «Kasaya giriş yap / yapma». Yapılmazsa fatura «Bekliyor» kalır, sonradan bir ya da birkaç kez (kısmi) «Kasaya işle» ile gelire alınır.\n- Fatura ayarları: firma bilgileri, logo, imza (şimdilik ÖRNEK imza — kendi imzanızı yükleyin), kaşe, fatura no ön eki.\n- Para çıkışlarında ödeme yöntemi: Nakit / Sham Cash / Havale-Banka / Diğer. Sham Cash ve QR bilgileri artık İnfak ve Düzenli İnfak / Aidat ödemelerinde de girilir; Kasa'da yönteme göre süzgeç ve toplam.\n- Düzeltme: Ayarlar'daki «Kullanım Limitleri» kartı telefonda üst üste çoğalıyordu; artık tek kart.",
      en: "- New tab: Invoices (in the Finance group). Product / service sales are entered line by line; subtotal, discount, tax and grand total are calculated automatically.\n- Formal PDF invoice: Falcon logo and letterhead, company e-mail / phone / address, invoice number and date, signature and stamp area. Three templates (Falcon System, Classic, Minimal); invoices print in Turkish, English or Arabic (right to left).\n- The currency is chosen per invoice: Syrian pound, Turkish lira, US dollar. Totals are kept separately for each currency.\n- Income record: «Post to cash box / do not post» when issuing the invoice. If not posted, the invoice stays «Unpaid» and is posted later, once or in parts, with «Post to cash».\n- Invoice settings: company details, logo, signature (a SAMPLE signature for now — upload your own), stamp, invoice number prefix.\n- Payment method for money going out: Cash / Sham Cash / Bank transfer / Other. Sham Cash and QR details can now be entered in Charity (İnfak) and recurring charity / dues payments too; the Cash page filters and totals by method.\n- Fix: the «Usage limits» card in Settings multiplied on the phone; it is now a single card.",
      ar: "- تبويب جديد: الفواتير (ضمن مجموعة المالية). تُدخل مبيعات المنتجات / الخدمات بنداً بنداً، ويُحسب المجموع الفرعي والخصم والضريبة والإجمالي تلقائياً.\n- فاتورة PDF رسمية: شعار فالكون والترويسة، البريد الإلكتروني والهاتف والعنوان، رقم الفاتورة وتاريخها، ومكان للتوقيع والختم. ثلاثة قوالب (Falcon System، كلاسيكي، بسيط)؛ تُطبع الفاتورة بالتركية أو الإنجليزية أو العربية (من اليمين إلى اليسار).\n- تُختار العملة لكل فاتورة: الليرة السورية، الليرة التركية، الدولار. تُحفظ الإجماليات لكل عملة على حدة.\n- تسجيل الإيراد: «تسجيل في الصندوق / عدم التسجيل» عند إصدار الفاتورة. إن لم تُسجَّل تبقى «غير مدفوعة» وتُسجَّل لاحقاً دفعة واحدة أو على دفعات بزر «تسجيل في الصندوق».\n- إعدادات الفواتير: بيانات الشركة، الشعار، التوقيع (توقيع «نموذج» حالياً — ارفع توقيعك)، الختم، بادئة رقم الفاتورة.\n- طريقة الدفع في المصروفات: نقداً / شام كاش / حوالة-بنك / أخرى. أصبح إدخال بيانات شام كاش ورمز QR ممكناً أيضاً في الإنفاق ودفعات الإنفاق الدوري / الاشتراكات؛ وفي صفحة الصندوق تصفية وإجماليات حسب الطريقة.\n- إصلاح: كانت بطاقة «حدود الاستخدام» في الإعدادات تتكرر على الهاتف؛ أصبحت بطاقة واحدة."
    },
    '1.58.5': {
      tr: "- Elektrik: ön ödemeli sayaçta kalan süre tahmini — okunan değerlerden günlük ortalama hesaplanır ve \"Bu hızla yaklaşık N gün yeter\" yazar (3 gün kala uyarı rengi, bitmişse kırmızı).\n- Sayaç türü okumalardan kendiliğinden anlaşılır: değer azalıyorsa harcama artı olarak gösterilir, değer artınca yükleme sayılır (⬆ yüklendi).\n- Kayıtlara ve eşitlemeye dokunulmaz.",
      en: "- Electricity: remaining-time estimate for prepaid meters — the daily average is calculated from the readings and it shows \"At this rate it lasts about N more days\" (warning colour 3 days before, red if it has run out).\n- The meter type is recognised from the readings: when the value goes down, usage is shown as a positive amount and a rise counts as a top-up (⬆ topped up).\n- Records and sync are not touched.",
      ar: "- الكهرباء: تقدير المدة المتبقية للعدادات مسبقة الدفع — يُحسب المعدل اليومي من القراءات ويظهر «بهذا المعدل يكفي نحو N يوم» (لون تحذير قبل 3 أيام، وأحمر إذا نفدت).\n- يُتعرَّف على نوع العداد من القراءات: عندما تنخفض القيمة يظهر الاستهلاك كقيمة موجبة، ويُعدّ الارتفاع شحناً (⬆ شحن).\n- لا تُمَسّ السجلات ولا المزامنة."
    },
    '1.58.4': {
      tr: "- Güncelle'ye basınca program kapanıp öyle kalmıyor: güncelleme bitince program her zaman penceresiyle açılır (Windows açılışında arka planda başlamış olsa da).\n- Program dosyası başka bir uygulama tarafından açık tutulsa bile güncelleme yerine konur (gerekirse açık kalan kopyalar kapatılır, dosya kopyalanıp bayt bayt doğrulanır).\n- Kayıtlara dokunulmaz; güncellemeden önce tam yedek alınır.",
      en: "- Pressing Update no longer leaves the program closed: when the update finishes the program always opens with its window (even if it was started in the background at Windows startup).\n- The update is put in place even if another application keeps the program file open (leftover copies are closed if needed, the file is copied and verified byte by byte).\n- Records are not touched; a full backup is taken before updating.",
      ar: "- لم يعد الضغط على تحديث يترك البرنامج مغلقاً: عند انتهاء التحديث يُفتح البرنامج دائماً بنافذته (حتى لو بدأ في الخلفية عند تشغيل Windows).\n- يُوضع التحديث في مكانه حتى لو أبقى تطبيق آخر ملف البرنامج مفتوحاً (تُغلق النسخ المتبقية عند الحاجة، ويُنسخ الملف ويُتحقق منه بايتاً بايتاً).\n- لا تُمَسّ السجلات؛ تُؤخذ نسخة احتياطية كاملة قبل التحديث."
    },
    '1.58.3': {
      tr: "- Güncellemeler artık tamamen kendiliğinden: yeni sürüm arka planda sessizce indirilir, program kapanınca pencere açmadan kurulur; bir sonraki açılışta yeni sürüm gelir. Hemen kurmak için Güncelle → «Şimdi kur ve yeniden aç». Kurulum gereken güncellemeler de sessiz yapılır. Kayıtlara dokunulmaz.",
      en: "- Updates are now fully automatic: the new version downloads quietly in the background and installs without any window when the program closes; the next start opens the new version. To install right away: Update → «Install now and reopen». Updates that need the installer also run silently. Records are not touched.",
      ar: "- أصبحت التحديثات تلقائية بالكامل: يُنزَّل الإصدار الجديد بهدوء في الخلفية ويُثبَّت دون أي نافذة عند إغلاق البرنامج، ويُفتح الإصدار الجديد في المرة التالية. للتثبيت فوراً: تحديث ← «ثبّت الآن وأعد الفتح». التحديثات التي تحتاج إلى برنامج التثبيت تتم بصمت أيضاً. لا تُمَسّ السجلات."
    },
    '1.58.2': {
      tr: "- \"Yeni kurulum gerekli\" penceresindeki \"Şimdi kur\" artık takılmıyor: siyah pencere açılmaz, program kapanmazsa kendisi kapatılır, Türkçe harfli klasörlerde de çalışır.\n- Güncelleme adımları %TEMP%\\falcon-guncelleme.log dosyasına yazılır.",
      en: "- \"Install now\" in the \"New installer required\" window no longer hangs: no black window opens, the program is closed if it does not exit, and folders with non-English letters work.\n- Update steps are written to %TEMP%\\falcon-guncelleme.log.",
      ar: "- زر «ثبّت الآن» في نافذة «يلزم مثبّت جديد» لم يعد يتوقف: لا تظهر نافذة سوداء، ويُغلق البرنامج تلقائياً إن لم يُغلق، ويعمل في المجلدات ذات الأحرف غير الإنجليزية.\n- تُكتب خطوات التحديث في الملف %TEMP%\\falcon-guncelleme.log."
    },
    '1.58.1': {
      tr: "- Program her açılışta tam ekran açılır (pencere seçimi yalnız o oturum için geçerlidir).\n- Arapça: döviz/dijital para kur kartlarında \"Kur girilmedi\" yazısı küçük ve okunaklı.\n- Arapça: \"Sor\" düğmesi kenar çubuğunun üstüne binmiyor (sol altta).",
      en: "- The program always opens full screen (the window choice applies only to the current session).\n- Arabic: \"No rate set\" on the currency/crypto rate cards is small and readable.\n- Arabic: the \"Ask\" button no longer covers the sidebar (bottom left).",
      ar: "- يُفتح البرنامج دائماً بملء الشاشة (اختيار النافذة يسري على الجلسة الحالية فقط).\n- العربية: عبارة «لم يتم إدخال السعر» في بطاقات أسعار العملات والعملات الرقمية صغيرة وواضحة.\n- العربية: لم يعد زر «اسأل» يغطي الشريط الجانبي (أسفل اليسار)."
    },
    '1.58.0': {
      tr: '- Güncellemeler artık GitHub sürümlerinden gelir: yalnızca değişen kısımlar indirilir (yüzde, MB, kalan ve hız görünür).\n- Sağ üstte Orta düğmesi (yarım pencere), Asistan Agent ve yeni Güncelle düğmesi.\n- Ayarlar > Görünüm: renk şeması seçimi (Falcon varsayılan).\n- Wi‑Fi ve bulut eşitlemesinde öbür cihazda silinen kayıtlar artık arşive alınır (Ayarlar > Arşiv; geri yüklenebilir).\n- Beklenmeyen hatalar (izin verirseniz) yöneticiye kişisel bilgi olmadan bildirilir.\n- Kayıtlarınız, belgeleriniz, PIN kodunuz ve eşitleme bağlantınız aynen korunur.',
      en: '- Updates now come from GitHub releases: only the changed parts are downloaded (percentage, MB, remaining and speed are shown).\n- New Half-window button, Assistant Agent and a new Update button at the top right.\n- Settings > Appearance: colour scheme picker (Falcon is the default).\n- With Wi‑Fi and cloud sync, records deleted on another device are now archived (Settings > Archive; they can be restored).\n- Unexpected errors are reported to the administrator without personal data (if you allow it).\n- Your records, documents, PIN and sync connection are kept as they are.',
      ar: '- التحديثات تأتي الآن من إصدارات GitHub: تُنزَّل الأجزاء المتغيرة فقط (تظهر النسبة والميغابايت والمتبقي والسرعة).\n- زر «نصف النافذة» و«المساعد» وزر تحديث جديد أعلى اليمين.\n- الإعدادات > المظهر: اختيار نظام الألوان (فالكون هو الافتراضي).\n- في مزامنة Wi‑Fi والسحابة تُنقل السجلات المحذوفة على جهاز آخر إلى الأرشيف (الإعدادات > الأرشيف؛ يمكن استعادتها).\n- تُرسَل الأخطاء غير المتوقعة إلى المسؤول دون بيانات شخصية (إذا سمحت بذلك).\n- تبقى سجلاتك ومستنداتك ورمز PIN واتصال المزامنة كما هي.'
    }
  };

  FC.i18n.add({
    tr: {
      'fo.half': 'Orta (yarım pencere)', 'fo.restore': 'Tam ekrana dön',
      'fo.bridge.title': 'Yeni kurulum gerekli', 'fo.bridge.desc': 'Bu bilgisayardaki Falcon Ofis eski güncelleme yöntemini kullanıyor. Bundan sonraki güncellemeler GitHub üzerinden, yalnızca değişen kısımlar indirilerek gelecek. Bunun için program dosyalarının bir kez yenilenmesi gerekiyor.',
      'fo.bridge.swap': 'Program dosyaları yerinde yenilenecek; program kendiliğinden yeniden açılır.', 'fo.bridge.setup': 'Kurulum programı indirilip açılacak. Kurulumdan sonra program aynı kayıtlarla açılır.',
      'fo.bridge.safe': 'Kayıtlarınız, belgeleriniz, yedekleriniz, PIN kodunuz ve eşitleme bağlantınız aynen korunur; önce otomatik tam yedek alınır.',
      'fo.bridge.go': 'Şimdi kur', 'fo.bridge.later': 'Sonra', 'fo.bridge.page': 'İndirme sayfası',
      'fo.arc.title': 'Arşiv (başka cihazda silinenler)', 'fo.arc.desc': 'Wi‑Fi ya da bulut eşitlemesinde başka bir cihazda silinen kayıtlar burada kalıcı olarak saklanır; hiçbir kayıt kaybolmaz. İstediğinizi geri yükleyebilirsiniz.',
      'fo.arc.empty': 'Arşivde kayıt yok.', 'fo.arc.restore': 'Geri yükle', 'fo.arc.restored': 'Geri yüklendi', 'fo.arc.taken': 'Bu numarada artık başka bir kayıt var; geri yüklenemedi.', 'fo.arc.more': '{n} kayıt daha',
      'fo.arc.wifi': 'Wi‑Fi', 'fo.arc.bulut': 'Bulut', 'fo.arc.show': 'Arşivi göster ({n})',
      'fo.fb.title': 'Eşitleme hesabı', 'fo.fb.desc': 'Telefon ve bilgisayarın aynı kayıtları görmesi için Firebase projenizde bir e-posta / şifre hesabıyla bağlanın (ilk seferde hesap oluşturulur).',
      'fo.fb.mail': 'E-posta', 'fo.fb.pass': 'Şifre (en az 6 karakter)', 'fo.fb.connect': 'Bağlan', 'fo.fb.ok': 'Bağlandı; kayıtlar eşitleniyor.', 'fo.fb.create': 'Bu e-postayla hesap bulunamadı. Yeni hesap oluşturulsun mu?',
      'fo.fb.choice': 'Hem bu bilgisayarda hem bulutta kayıt var. Hangisi kullanılsın? (Değiştirilecek kayıtlar önce yedeklenir.)', 'fo.fb.down': 'Buluttakini al', 'fo.fb.up': 'Bu bilgisayardakini gönder', 'fo.fb.fail': 'Bağlanılamadı: {e}'
    },
    en: {
      'fo.half': 'Half window', 'fo.restore': 'Back to full screen',
      'fo.bridge.title': 'New installer required', 'fo.bridge.desc': 'Falcon Ofis on this computer still uses the old update method. From now on updates come from GitHub and only the changed parts are downloaded. For this, the program files need to be renewed once.',
      'fo.bridge.swap': 'The program files will be renewed in place; the program restarts by itself.', 'fo.bridge.setup': 'The installer will be downloaded and opened. After installing, the program opens with the same records.',
      'fo.bridge.safe': 'Your records, documents, backups, PIN and sync connection are kept; a full backup is taken first.',
      'fo.bridge.go': 'Install now', 'fo.bridge.later': 'Later', 'fo.bridge.page': 'Download page',
      'fo.arc.title': 'Archive (deleted on another device)', 'fo.arc.desc': 'Records deleted on another device through Wi‑Fi or cloud sync are kept here permanently; nothing is lost. You can restore any of them.',
      'fo.arc.empty': 'The archive is empty.', 'fo.arc.restore': 'Restore', 'fo.arc.restored': 'Restored', 'fo.arc.taken': 'Another record now uses this number; it could not be restored.', 'fo.arc.more': '{n} more records',
      'fo.arc.wifi': 'Wi‑Fi', 'fo.arc.bulut': 'Cloud', 'fo.arc.show': 'Show archive ({n})',
      'fo.fb.title': 'Sync account', 'fo.fb.desc': 'To let your phone and computer see the same records, connect with an email / password account in your Firebase project (it is created the first time).',
      'fo.fb.mail': 'Email', 'fo.fb.pass': 'Password (at least 6 characters)', 'fo.fb.connect': 'Connect', 'fo.fb.ok': 'Connected; records are syncing.', 'fo.fb.create': 'No account was found for this email. Create a new account?',
      'fo.fb.choice': 'There are records both on this computer and in the cloud. Which should be used? (Records that change are backed up first.)', 'fo.fb.down': 'Take the cloud records', 'fo.fb.up': 'Send this computer’s records', 'fo.fb.fail': 'Could not connect: {e}'
    },
    ar: {
      'fo.half': 'نصف النافذة', 'fo.restore': 'العودة إلى ملء الشاشة',
      'fo.bridge.title': 'يلزم مثبّت جديد', 'fo.bridge.desc': 'ما زال Falcon Ofis على هذا الحاسوب يستخدم طريقة التحديث القديمة. من الآن تأتي التحديثات من GitHub وتُنزَّل الأجزاء المتغيرة فقط. لذلك يجب تجديد ملفات البرنامج مرة واحدة.',
      'fo.bridge.swap': 'ستُجدَّد ملفات البرنامج في مكانها ويُعاد تشغيله تلقائياً.', 'fo.bridge.setup': 'سيُنزَّل المثبّت ويُفتح. بعد التثبيت يفتح البرنامج بالسجلات نفسها.',
      'fo.bridge.safe': 'تبقى سجلاتك ومستنداتك ونسخك الاحتياطية ورمز PIN واتصال المزامنة كما هي؛ تُؤخذ نسخة احتياطية كاملة أولاً.',
      'fo.bridge.go': 'ثبّت الآن', 'fo.bridge.later': 'لاحقاً', 'fo.bridge.page': 'صفحة التنزيل',
      'fo.arc.title': 'الأرشيف (المحذوف على جهاز آخر)', 'fo.arc.desc': 'تُحفظ هنا بشكل دائم السجلات المحذوفة على جهاز آخر عبر مزامنة Wi‑Fi أو السحابة؛ لا يضيع شيء. يمكنك استعادة أي منها.',
      'fo.arc.empty': 'الأرشيف فارغ.', 'fo.arc.restore': 'استعادة', 'fo.arc.restored': 'تمت الاستعادة', 'fo.arc.taken': 'هذا الرقم مستخدم الآن لسجل آخر؛ تعذّرت الاستعادة.', 'fo.arc.more': '{n} سجلات أخرى',
      'fo.arc.wifi': 'Wi‑Fi', 'fo.arc.bulut': 'السحابة', 'fo.arc.show': 'عرض الأرشيف ({n})',
      'fo.fb.title': 'حساب المزامنة', 'fo.fb.desc': 'ليرى الهاتف والحاسوب السجلات نفسها، اتصل بحساب بريد / كلمة مرور في مشروع Firebase الخاص بك (يُنشأ في المرة الأولى).',
      'fo.fb.mail': 'البريد الإلكتروني', 'fo.fb.pass': 'كلمة المرور (6 أحرف على الأقل)', 'fo.fb.connect': 'اتصال', 'fo.fb.ok': 'تم الاتصال؛ تجري مزامنة السجلات.', 'fo.fb.create': 'لم يُعثر على حساب بهذا البريد. هل يُنشأ حساب جديد؟',
      'fo.fb.choice': 'توجد سجلات على هذا الحاسوب وفي السحابة. أيّها يُستخدم؟ (تُنسخ السجلات التي ستتغير احتياطياً أولاً.)', 'fo.fb.down': 'خذ سجلات السحابة', 'fo.fb.up': 'أرسل سجلات هذا الحاسوب', 'fo.fb.fail': 'تعذّر الاتصال: {e}'
    }
  });
  function T(k, v) { return FC.t(k, v); }
  var el = function (a, b, c) { return ui.el(a, b, c); };

  /* ---------- 1) dil: Falcon → çekirdek (ve çekirdekten seçilince Falcon'a) ---------- */
  function htmlLang() { var l = String(de.getAttribute('lang') || 'tr').slice(0, 2); return LANGS.indexOf(l) >= 0 ? l : 'tr'; }
  function falconLang() {
    var b = document.querySelector('.topbar .lang-switch .lang-btn.active');
    var l = b ? String(b.textContent || '').trim().toLowerCase() : '';
    return LANGS.indexOf(l) >= 0 ? l : htmlLang();
  }
  function followFalconLang() { var l = htmlLang(); if (FC.i18n.lang() !== l) FC.i18n.set(l); }
  FC.i18n.onChange(function (l) {
    if (falconLang() === l) return;
    var btn = Array.prototype.filter.call(document.querySelectorAll('.topbar .lang-switch .lang-btn'), function (b) { return String(b.textContent || '').trim().toLowerCase() === l; })[0];
    if (btn) btn.click(); else { try { F.settings.set('language', l); } catch (e) {} }
  });

  /* ---------- 2) tema: FalconFX (falcon-theme / falcon-zoom) ↔ çekirdek ---------- */
  function fxTheme() { var t = null; try { t = localStorage.getItem('falcon-theme'); } catch (e) {} return t === 'light' || t === 'auto' ? t : 'dark'; }
  FC.storage.set('theme', fxTheme());
  FC.storage.set('fontScale', 1);
  window.addEventListener('falcon-look', function () { if (FC.look.theme() !== fxTheme()) { FC.storage.set('theme', fxTheme()); FC.look.apply(); } });
  var lookBusy = false;
  function lookToFalcon(s) {
    if (lookBusy || !window.FalconFX) return;
    lookBusy = true;
    try {
      if (s.theme !== fxTheme()) window.FalconFX.setLook('theme', s.theme);
      if (s.scale !== 1) { window.FalconFX.setLook('zoom', s.scale); FC.storage.set('fontScale', 1); FC.look.apply(); }
    } finally { lookBusy = false; }
  }

  /* çekirdeğin çizdiği her şey .fc-scope içinde (core-falcon.css yalnız orada geçerli; Falcon'un görünümü değişmez) */
  var layer = null;
  function ensureLayer() {
    if (!layer) { layer = document.createElement('div'); layer.className = 'fc-scope fc-layer'; }
    if (document.body && layer.parentNode !== document.body) document.body.appendChild(layer);
    ui.root = layer;
  }
  function scope(n) { if (n && n.classList) n.classList.add('fc-scope'); return n; }

  /* ---------- 3) başlat ---------- */
  var info = { overlay: false, channel: 'win-app' }, started = false;
  function start() {
    if (started) return; started = true;
    ensureLayer();
    var version = (FC.host && FC.host.version()) || '';
    FC.storage.set('lang', htmlLang());   // Falcon'un dili geçerli (React <html lang>'ı zaten ayarladı ya da birazdan ayarlar)
    FC.init({
      app: APP, repo: APP, version: info.overlay ? info.baseVersion : version,
      channel: info.channel, setupChannel: 'win-setup',
      whatsnew: false, announcements: false, update: info.noUpdate ? false : undefined,
      agent: { notify: function (t, b) { try { F.notify(t, b); return true; } catch (e) { return false; } }, ai: function () { return aiKey ? { provider: 'gemini', key: aiKey } : null; }, sync: true }
    });
    FC.look.onChange(lookToFalcon);
    followFalconLang();
    new MutationObserver(followFalconLang).observe(de, { attributes: true, attributeFilter: ['lang'] });
    if (!info.overlay) FC.whatsnew.start({ version: version, notes: function (v) { return NEWS[v] || null; } });
    var pending = false;
    new MutationObserver(function () { if (pending) return; pending = true; requestAnimationFrame(function () { pending = false; try { ensureAll(); } catch (e) { if (window.console) console.error(e); } }); })
      .observe(document.body, { childList: true, subtree: true });
    ensureAll();
    if (info.overlay) setTimeout(bridge, 2500);
    else waitUnlocked(maybeOnboarding);
    loadAiKey(); setInterval(loadAiKey, 60000);
  }
  var aiKey = '';
  function loadAiKey() { try { Promise.resolve(F.settings.get('ai_gemini_key')).then(function (k) { aiKey = String(k || ''); }, function () {}); } catch (e) {} }

  /* ---------- 4) üst çubuk ---------- */
  var core = null, halfBtn = null;
  function topbar() {
    var actions = document.querySelector('.topbar .topbar-actions');
    if (!actions) return;
    if (!core) {
      core = FC.topbar.mount(null, { sync: false, lan: false, theme: false, lang: false, window: false });
      core.agent = core.el.querySelector('.agent-btn');
      core.update = core.el.querySelector('.top-act-wrap');
      if (core.update) { core.update.classList.add('fc-update-wrap'); scope(core.update); }
      scope(core.agent);
    }
    if (core.agent && core.agent.parentNode !== actions) {
      var sync = actions.querySelector('.sync-act') || actions.querySelector('.lan-act');
      actions.insertBefore(core.agent, sync || actions.firstChild);
    }
    if (core.update && core.update.parentNode !== actions) {
      var lan = actions.querySelector('.lan-act'), wc0 = actions.querySelector('.win-controls');
      actions.insertBefore(core.update, lan ? lan.nextSibling : wc0);
    }
    var wc = actions.querySelector('.win-controls');
    if (wc && FC.host.can && FC.host.can.half && !wc.querySelector('[data-win="half"]')) {
      if (!halfBtn) {
        halfBtn = el('button.icon-btn', { type: 'button', 'data-win': 'half', html: ui.icon('half') });
        halfBtn.addEventListener('click', function () { FC.host.window.half(); });
        var draw = function (s) { var h = !!(s && s.half); halfBtn.title = T(h ? 'fo.restore' : 'fo.half'); halfBtn.setAttribute('aria-label', halfBtn.title); halfBtn.setAttribute('aria-pressed', String(h)); };
        var last = {}; draw(last);
        FC.host.window.onState(function (s) { last = s || {}; draw(last); });
        FC.i18n.onChange(function () { draw(last); });
      }
      var first = wc.firstElementChild;
      wc.insertBefore(halfBtn, first ? first.nextSibling : null);
    }
  }

  /* ---------- 5) ayarlar ---------- */
  var cards = null, schemeRow = null;
  function settings() {
    var grid = document.querySelector('.settings-grid');
    if (!grid) return;
    if (!cards) {
      cards = [FC.agent ? FC.agent.card() : null, FC.crash.card(), archiveCard(), FC.settings.about({ onboarding: onboardingOpts() })].filter(Boolean);
      cards.forEach(function (c) { c.classList.add('fc-core-card'); scope(c); });
    }
    var contact = document.getElementById('fo-contact');
    var anchor = contact && contact.parentNode === grid ? contact : null;
    for (var i = cards.length - 1; i >= 0; i--) {
      var c = cards[i], next = i === cards.length - 1 ? anchor : cards[i + 1];
      if (c.parentNode !== grid || c.nextSibling !== next) grid.insertBefore(c, next);
    }
    var look = grid.querySelector('.look-card');
    if (look) {
      if (!schemeRow) {
        schemeRow = scope(el('div.look-row.fc-scheme-row'));
        var draw = function () { schemeRow.innerHTML = ''; schemeRow.appendChild(el('span.look-label', { text: T('fc.scheme') })); schemeRow.appendChild(FC.look.picker()); };
        draw(); FC.look.onChange(draw); FC.i18n.onChange(draw);
      }
      if (schemeRow.parentNode !== look) {
        var rows = look.querySelectorAll('.look-row');
        look.insertBefore(schemeRow, rows.length ? rows[0] : null);
      }
    }
  }
  function archiveCard() {
    if (!F.arsiv) return null;
    var c = ui.card({ key: 'arsiv', title: '', icon: 'box' }), list = [], open = false;
    function label(r) {
      var d = {}; try { d = JSON.parse(r.data) || {}; } catch (e) {}
      var name = ['title', 'name', 'label', 'customer', 'supplier', 'description', 'category', 'note', 'provider', 'code'].map(function (k) { return typeof d[k] === 'string' ? d[k] : ''; }).filter(Boolean)[0] || ('#' + r.pk);
      return r.tbl + ' · ' + String(name).slice(0, 80);
    }
    function draw() {
      c.innerHTML = '';
      c.appendChild(el('h3.card-title', { html: ui.icon('box') + '<span>' + ui.esc(T('fo.arc.title')) + '</span>' }));
      c.appendChild(el('p.card-desc', { text: T('fo.arc.desc') }));
      var active = list.filter(function (r) { return !r.restored_at; });
      if (!active.length) { c.appendChild(el('p.muted', { text: T('fo.arc.empty') })); return; }
      if (!open) { c.appendChild(el('button.btn.small', { type: 'button', text: T('fo.arc.show', { n: active.length }), onclick: function () { open = true; draw(); } })); return; }
      var ul = el('div.fc-arsiv');
      active.slice(0, 50).forEach(function (r) {
        var when = new Date(r.archived_at).toLocaleString(FC.i18n.locale());
        var row = el('div.fc-arsiv-row', null, [
          el('div', null, [el('div', { text: label(r), dir: 'auto' }), el('div.muted.small', { text: T('fo.arc.' + (r.kaynak === 'bulut' ? 'bulut' : 'wifi')) + ' · ' + when })]),
          el('button.btn.small', { type: 'button', text: T('fo.arc.restore'), onclick: function (e) {
            var b = e.currentTarget; b.disabled = true;
            F.arsiv.restore(r.n).then(function (res) {
              if (res && res.ok) { FC.ui.toast(T('fo.arc.restored'), 'ok'); refreshArchive(); }
              else { FC.ui.toast(res && res.error === 'ERR_ARCHIVE_TAKEN' ? T('fo.arc.taken') : String((res && res.error) || 'ERR'), 'error'); b.disabled = false; }
            });
          } })
        ]);
        ul.appendChild(row);
      });
      c.appendChild(ul);
      if (active.length > 50) c.appendChild(el('p.muted.small', { text: T('fo.arc.more', { n: active.length - 50 }) }));
    }
    function refreshArchive() { F.arsiv.list().then(function (r) { if (r && r.ok) { list = r.data || []; draw(); } }, function () {}); }
    draw(); FC.i18n.onChange(draw);
    c._refresh = refreshArchive;
    return c;
  }

  function ensureAll() {
    ensureLayer(); topbar(); settings();
    if (cards) cards.forEach(function (c) { if (c._refresh && c.isConnected && !c._seen) { c._seen = true; c._refresh(); } else if (!c.isConnected) c._seen = false; });
  }

  /* ---------- 6) ilk açılış rehberi (dil → görünüm → kendi Firebase'iniz → kendi AI anahtarınız) ---------- */
  function onboardingOpts() {
    return {
      store: false,
      onFirebase: function (cfg) { firebaseAccount(cfg); },
      onAi: function (a) { if (a && a.provider === 'gemini' && a.key) { try { F.settings.set('ai_gemini_key', a.key); aiKey = a.key; } catch (e) {} } }
    };
  }
  function waitUnlocked(fn) {
    var tries = 0;
    (function poll() {
      Promise.resolve(F.security.status()).then(function (s) {
        if (s && (s.unlocked || s.disabled)) fn(); else if (++tries < 1200) setTimeout(poll, 1500);
      }, function () { if (++tries < 1200) setTimeout(poll, 1500); });
    })();
  }
  function maybeOnboarding() {
    if (FC.storage.get('onboarding.done', false)) return;
    // Var olan kullanıcı (eşitleme bağlı ya da kayıt var): rehber gösterilmez
    Promise.all([F.sync.status().catch(function () { return null; }),
      F.db.get("SELECT (SELECT COUNT(*) FROM cash_transactions) + (SELECT COUNT(*) FROM products) + (SELECT COUNT(*) FROM people) AS n").catch(function () { return null; })])
      .then(function (r) {
        var st = r[0], n = r[1] && r[1].n;
        if ((st && st.connected) || n > 0) { FC.storage.set('onboarding.done', true); return; }
        setTimeout(function () { FC.onboarding.maybeStart(onboardingOpts()); }, 800);
      });
  }
  function errText(code) { return String(code || 'ERR').replace(/^ERR_/, ''); }
  function firebaseAccount(cfg) {
    var mail = el('input.input.ltr', { type: 'email', autocomplete: 'username', placeholder: 'ad@ornek.com' });
    var pass = el('input.input.ltr', { type: 'password', autocomplete: 'new-password' });
    var res = el('div', { role: 'status' });
    var body = el('div', null, [el('p', { text: T('fo.fb.desc') }),
      el('label.field', null, [el('span.field-label', { text: T('fo.fb.mail') }), mail]),
      el('label.field', null, [el('span.field-label', { text: T('fo.fb.pass') }), pass]), res]);
    var m = ui.modal({ title: T('fo.fb.title'), icon: 'cloud', body: body, buttons: [{ label: T('fc.skip'), cls: 'ghost' }, 'spacer', { label: T('fo.fb.connect'), cls: 'primary', onClick: function (close, btn) { go({}, close, btn); return false; } }] });
    function go(extra, close, btn) {
      res.innerHTML = '';
      if (btn) btn.disabled = true;
      F.sync.connect(Object.assign({ apiKey: cfg.apiKey, projectId: cfg.projectId, email: mail.value.trim(), password: pass.value }, extra)).then(function (r) {
        if (btn) btn.disabled = false;
        if (r && r.ok && r.data && r.data.needsChoice) {
          m.setButtons([{ label: T('fo.fb.down'), onClick: function (c2, b2) { go(Object.assign({}, extra, { choice: 'download' }), c2, b2); return false; } },
            { label: T('fo.fb.up'), cls: 'primary', onClick: function (c2, b2) { go(Object.assign({}, extra, { choice: 'upload' }), c2, b2); return false; } }]);
          res.appendChild(el('div.notice', { text: T('fo.fb.choice') })); return;
        }
        if (r && r.ok) { FC.ui.toast(T('fo.fb.ok'), 'ok'); close(); return; }
        if (r && r.error === 'ERR_SYNC_BAD_LOGIN' && !extra.create) {
          m.setButtons([{ label: T('fc.back'), cls: 'ghost', onClick: function () { m.setButtons([{ label: T('fc.skip'), cls: 'ghost' }, 'spacer', { label: T('fo.fb.connect'), cls: 'primary', onClick: function (c3, b3) { go({}, c3, b3); return false; } }]); return false; } },
            'spacer', { label: T('fo.fb.connect'), cls: 'primary', onClick: function (c2, b2) { go(Object.assign({}, extra, { create: true }), c2, b2); return false; } }]);
          res.appendChild(el('div.notice', { text: T('fo.fb.create') })); return;
        }
        res.appendChild(el('div.notice.error', { text: T('fo.fb.fail', { e: errText(r && r.error) }) }));
      }, function (e) { if (btn) btn.disabled = false; res.appendChild(el('div.notice.error', { text: T('fo.fb.fail', { e: errText(e && e.message) }) })); });
    }
  }

  /* ---------- 7) eski kabuk köprüsü ---------- */
  function bridge() {
    var body = el('div', null, [
      el('p', { text: T('fo.bridge.desc') }),
      el('p.muted', { text: T(info.channel === 'win-app' ? 'fo.bridge.swap' : 'fo.bridge.setup') }),
      el('div.notice.ok', null, [el('span', { html: ui.icon('check') }), el('span', { text: T('fo.bridge.safe') })])
    ]);
    var pb = FC.progress.box(); pb.el.hidden = true; body.appendChild(pb.el);
    var off = null;
    var m = ui.modal({ title: T('fo.bridge.title'), icon: 'download', body: body, onClose: function () { if (off) off(); }, buttons: [
      { label: T('fo.bridge.page'), cls: 'ghost', onClick: function () { ui.openUrl('https://github.com/departures-mil/falcon-ofis/releases/latest'); return false; } }, 'spacer',
      { label: T('fo.bridge.later') },
      { label: T('fo.bridge.go'), cls: 'primary', icon: 'download', onClick: function (close, btn) {
        btn.disabled = true; pb.el.hidden = false; pb.busy(T('fc.update.checking'));
        off = FC.updater.subscribe(function (s) {
          if (s.status === 'downloading' && s.progress) { pb.title(T('fc.update.downloading')); pb.set(s.progress, { patch: s.mode === 'patch' }); }
          else if (s.status === 'error') { pb.busy(FC.updater.errorText(s.error)); btn.disabled = false; }
          else if (['verifying', 'installing', 'restarting'].indexOf(s.status) >= 0) pb.busy(T('fc.update.' + s.status));
        });
        FC.updater.check().then(function (p) { if (!p) { var st = FC.updater.state(); pb.busy(st.error ? FC.updater.errorText(st.error) : T('fc.update.none', { v: info.version })); btn.disabled = false; return; } return FC.updater.run(); }).catch(function () { btn.disabled = false; });
        return false;
      } }] });
    return m;
  }

  /* ---------- açılış ---------- */
  function boot() {
    var done = false;
    var go = function () { if (done) return; done = true; start(); };
    try {
      Promise.resolve(F.kurulum && F.kurulum.info()).then(function (i) { if (i) info = i; go(); }, go);
    } catch (e) { go(); }
    setTimeout(go, 3000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.FalconCore = { bridge: bridge, info: function () { return info; }, news: NEWS };
})();
