# Falcon Ofis

Ofis / kasa / stok programı. Windows masaüstü (Electron 44, `electron/`) + Android (telefon kabuğunun kaynağı bu depoda YOK).
React kaynağı yok: arayüz derlenmiş `dist/assets/index-*.js/css`; özellikler yama betikleriyle (`araclar/patch-ui-*.py`) ya da
paketin yanındaki düz JS eklentileriyle (`dist/assets/*-falcon.js`) eklenir. Görünüm ortak çekirdeğin tasarım kaynağıdır (Falcon).

## Ortak çekirdek (v1.58.0'dan beri)
- `departures-mil/ortak-cekirdek` gömülü kopya: `cekirdek/electron/` (fc-electron-main, fc-preload, fcd1) + `dist/cekirdek/`
  (fc-core.js, css, yazı tipleri). Commit `cekirdek/VERSION`'da. Çekirdek deposunu buradan değiştirme.
  Yerel düzeltme: `dist/cekirdek/fc-core.js` → kabuk indirmesinde `latest.json` 404 = "güncel" ("falcon-ofis yerel düzeltmesi").
  Yerel düzeltme (1.58.2): Windows takası çekirdeğin `swapAndRelaunch` betiği yerine `electron/takas.js` ile yapılır (main.js
  `swapAndRelaunchSafe`): wscript ile gizli, yollar ortam değişkeninde (Türkçe harf), 15 sn'de kapanmayan program zorla kapatılır,
  günlük `%TEMP%\falcon-guncelleme.log`. Çekirdeğin betiğinde aynı hatalar var (ayrık cmd → siyah pencereler, `%N%` parantez içinde
  artmıyor → sonsuz bekleme, UTF-8 yollar bozuk); ortak-cekirdek oturumunda düzeltilmeli. CI: `node test/win-takas.js` (windows-latest).
- `dist/cekirdek/css/core-falcon.css` = core.css'in `.fc-scope` ile kapsanmış hali (`node araclar/cekirdek-css.js`); Falcon'un kendi
  görünümü değişmez. `tokens.css` Falcon CSS'inden SONRA yüklenir (renk şemaları).
- Yapıştırıcı `dist/assets/fc-falcon.js` (+ `fc-falcon.css`): dil ve tema Falcon'da kalır (React `<html lang>`, FalconFX
  `falcon-theme/zoom`), çekirdek izler; şema seçici Görünüm kartında (falcon varsayılan + yerleşik şemalar; `klasik` YOK — eski görünüm
  zaten falcon); üst çubuk: ✦ (Eşitle'nin önü), çekirdek Güncelle (Wi‑Fi'den sonra), pencere düğmelerine Orta; Ayarlar'da
  Asistan Agent · Otomatik hata raporu · Arşiv · Hakkında kartları, **Admin ile iletişim (`contact-falcon.js`) EN SONDA**;
  ilk açılış rehberi (PIN açılınca, yalnız yeni kullanıcıda; Firebase adımı → e-posta/şifre ile `falcon.sync.connect`; AI adımı →
  `ai_gemini_key`); "neler yeni" (`NEWS`); eski kabuk köprüsü penceresi. Kullanım Limitleri Falcon'un kendi kartı (`kullanim-falcon.js`).
- Ana süreç (`electron/main.js`): `fcMain.install` (Orta/pencere, indirme, ana süreç hataları); `fc:update:*` Falcon'da yeniden
  tanımlı: önce tam yedek (`guncelleme-oncesi-*.falcon`), sonra app.asar takası; kurulum kanalında `veri-konumu.json` yazılır ve kurulum açılır.
  Ana süreç çökmesi `cokme-bekleyen.json` → sonraki açılışta çökme raporu.

## Kurallar (kullanıcı)
- Yazışma dili Türkçe. Arayüz tr / en / ar (Arapça sağdan sola).
- Sürüm semver X.Y.Z, etiket tam `vX.Y.Z`. Tek kaynak `package.json`; ekranda tam sürüm görünür. Her sürümde `fc-falcon.js` `NEWS`
  ve `release-notes.json` (tr/en/ar) güncellenir; `npm test` tutarlılığı denetler.
- **Güncelleme yalnız GitHub Releases** (`latest.json` + FCD1 yama; kanallar `win-app` = app.asar, `win-setup` = NSIS). Firebase yalnız
  canlı kayıtlar içindir: güncelleme ya da paket Firebase'e YÜKLENMEZ (eski "yayın kutusu" ve `guncellemeler/<platform>` kaldırıldı).
- Yayın (onay beklemeden): dalda CI yeşil → main'e fast-forward → `gh api -X POST repos/departures-mil/falcon-ofis/actions/workflows/release.yml/dispatches -f ref=main`
  → `gh api repos/departures-mil/falcon-ofis/releases/latest` ile doğrula. Etiket push'u bu ortamda engelli.
- Kurulum: electron-builder NSIS, kullanıcı başına, tek tık, tr/en/ar (`%LOCALAPPDATA%\Programs`). **Veri kurulum klasörüne yazılmaz**
  (kaldırma o klasörü siler): kurulumlu sürüm `%APPDATA%\Falcon Ofis` ya da `veri-konumu.json`'un gösterdiği eski klasörü kullanır.
  Taşınabilir / eski kurulumlar (exe yanında "Falcon Ofis Veri") olduğu gibi çalışır ve app.asar'ı yerinde günceller.
  `productName`/`name`/`appId` (com.falcon.ofis) DEĞİŞMEZ. Electron ana sürümü değişirse `falconElectron` + `minVersion` ile kurulum zorlanır.
- Eşitleme kuralı: hiçbir kayıt kalıcı silinmez. Wi‑Fi (`electron/lan-db.js`, `dist/assets/lan-db.js` AYNI dosya) ve bulut
  (`electron/sync.js`) uzak silmeyi `local_arsiv`'e yazar (Ayarlar → Arşiv, geri yüklenebilir); çakışmada kaybeden `local_lan_conflicts`.
- ESKİ KANAL KÖPRÜSÜ: 1.51–1.57 `guncelleme/masaustu.json` (raw GitHub), ≤1.50 Firebase `guncellemeler/masaustu` okur; ikisi de ECDSA
  imzalı `.fopk`'yi overlay olarak çalıştırır. Köprü 1.58.0 ile bir kez konuldu (`araclar/kopru.js`, anahtar
  geliştiricinin bilgisayarındaki anahtar klasörü). Eski kabukta yeni sürüm "Yeni kurulum gerekli" der ve
  GitHub sürümünden program dosyalarını yeniler (yazılabilir klasör: app.asar takası; değilse kurulum). Yeni sürümler köprüye konmaz.
- ONARIM ARACI (`onarim/`, iş akışı `onarim.yml`): 1.58.0 overlay'inde takılanlar için tek tık `FalconOfis-Onarim.cmd` (WinForms, tr/en/ar):
  takılı `fc-update-*.cmd`/find pencerelerini kapatır, imzalı köprü paketinin zip'ini "onarim" ön sürümünden indirir (SHA-256),
  `…\guncelleme\1.58.2\` + `aktif.json` (BOM'suz) yazar. Link: releases/download/onarim/FalconOfis-Onarim.zip. Köprü değişirse
  `onarim.ps1` içindeki `$VERSION` de güncellenmeli (build.js denetler).
- 1.58.4: Güncelle sonrası program `--hidden`/`--watchdog` olmadan açılır (`relaunchArgs`); takas.js app.asar taşınamazsa açık kopyaları
  kapatır (`killImage`), olmazsa yerinde kopyalar + `fc /B` doğrular. Claude masaüstü dosya araçlarıyla `app.asar` İÇİ LİSTELENMEZ:
  Electron .asar'ı silinmeye kapalı açık tutar ve takası kilitler.
- Android: APK yalnızca kullanıcı isteyince; telefon kabuğu kaynağı burada olmadığından `android` kanalı yok.
- İmza anahtarları / şifreler depoya girmez.

- 1.63 ÇIKTI AKIŞI: PDF'ler doğrudan kaydedilmez. Fatura: `openPreview` (dil → ürün adları olduğu gibi / çevrilmiş → önizle ve düzelt → PDF);
  diğer dökümler `dist/assets/cikti-falcon.js` (`FalconCikti.open`, ürün/malzeme dökümü `araclar/patch-ui-163.py` ile). Ürün adı çevirisi:
  `FalconFaturaPdf.translate` (Gemini) → olmazsa çevrimdışı `TERMS` sözlüğü; önbellek ayarı `invoice_name_tr`. Sayfa numarası: fatura HTML'indeki
  `<meta name="falcon-pdf-footer">` → main.js `htmlToPdf` footerTemplate. Test: `araclar/cikti-e2e.js`.
- 1.64 FATURA ÇIKTISI: tek dil (başlık altındaki diğer dil satırı yok; SYP simgesi `ل.س` yalnız Arapçada, `symOf`/`curLbl`; tip kodları `codeText`
  — «SATIŞ» da tanınır). «Fatura özeti» kartı yok (damga + QR + barkod `.stbox`). Döviz kuru satırı varsayılan GİZLİ: şablon bayrağı `fx` (göster) / `nf`
  (gizle), yoksa `layout.fx_show`. Önizleme durumu fatura başına `settings.invoice_pv_<no>` (eşitlenir): `ed[dil] = [{o, i, n}]` (orijinal metin + kaçıncı
  geçiş → yeni metin; şablon değişince korunur, ekranda yoksa saklanır), `cur` + `rates` (çıktı para birimi ve kullanılan kur; kayıt değişmez), `fxc`,
  `lang`/`tpl`. Enter düzeltmede kapalı. Test: `araclar/fatura-164-e2e.js`.

- 1.65 SHAM CASH DEKONTU: `dist/assets/shamcash-falcon.js` (`FalconShamDekont.open/read`, masaüstü + telefon). Okuma: Gemini (dosyanın kendisi) + çevrimdışı
  tesseract (`dist/assets/ocr`: tesseract.js 7 + core simd-lstm + eng/ara best_int; dil verisi `falcon://app/ocr/<ad>` — main.js protocol, ACAO *; yalnız masaüstü,
  telefona konmaz). Rakamlar nokta vuruşlu: bölge bulanıklaştırılıp eşiklenir; hesaplarda yalnız son 4 hane okunur ("************" + 4 hane); bilinen adlar
  (benim adlarım + geçmiş sc_name/sc_doc + alıcılar) boşluksuz eşleşirse bilinen yazılış kullanılır. Kayıt `importShamCashReceipt` (`cash_transactions.sc_doc`
  JSON = dekonttaki metin AYNEN; Arapça adlara dokunulmaz; aynı `sc_ref` ikinci kez yazılmaz → `{duplicate:true}`), not `setShamCashNote` (sc_note), dekonttan
  gelen harekette `saveShamCash` yalnız notu değiştirir. Yön: ayar `shamcash_me` {names, accounts(son 4)}. Kasa/kategori hatırlanır: `shamcash_acc_<CUR>`,
  `shamcash_cat_<in|out>`. Masaüstü dekont kutusu `<userData>\Sham Cash Dekontları` (peek → kayıtta take = receipts'e bayt bayt kopya → `İşlendi`); yanında aynı
  adlı .json (doğrulanmış alanlar + direction/me_name/me_account/category/note) ya da yapay zekâ + çevrimdışı birebir aynıysa kendiliğinden kaydedilir.
  Arayüz `araclar/patch-ui-165.py` (Kasa düğmesi, `sc` süzgeci girişleri de kapsar, aramada sc_doc, ayrıntıda dekont + Notum), servis `patch-srv-165.py`
  (migration 30). Test: `araclar/shamcash-e2e.js <dekont.pdf>`.

- 1.65.1 TUTAR SIRALAMASI: Kasa tablosunda TUTAR başlığı (`FalconAmtSortTh`) tıklanınca 0 → büyükten küçüğe → küçükten büyüğe → tarih sırası (bileşen durumu
  `falconSrt`). `FalconSortAmt` işaretli tutarı güncel kurla (`V().rates`, birim/USD) USD'ye çevirerek sıralar; eşitlikte tarih sırası korunur. Yama
  `araclar/patch-ui-1651.py` (masaüstü index + telefon main bundle; telefon-hazirla.sh'ta). Stil satır içi (telefona CSS gerekmez).

- 1.67 SHAM CASH HER YERDE: `FalconScSection` (Kasa formu iki yönde + bağlı kayıtlar, İnfak, düzenli ödeme — `FalconScFor`) içinde `FalconScDocAttach`:
  «📎 Sham Cash dekontu ekle» → `FalconShamDekont.pick({direction})` (files.import receipt = bayt bayt kopya → read → getMe/directionOf; yön yoksa formdaki yön
  + `addMe`; `pickAccount`; `dupOf`) → forma amount/date/direction(yalnız Kasa formu)/account_id/sc_name/sc_account/sc_ref + `sc_doc` (JSON) + `sc_doc_file`.
  Sunucu `saveShamCash` artık girişte de (payee yalnız çıkış) → `attachShamDoc` (sc_doc aynen + file_path, receipts satırı, aynı sc_ref → ERR_SC_DUPLICATE,
  db.tx geri alır). `isShamAccount` (ayar `shamcash_acc_<CUR>` ya da adında sham/شام) → `transfer` tarafları pay_method=shamcash. Kasa otomatiği arayüzde:
  `FalconScPmUp` (yöntem → kasa), `FalconScAccChange` (kasa → yöntem). sc_doc'lu kayıtta form `FalconScDocLocked`. `openOriginal` önce sc_doc.file_path.
  Yamalar `araclar/patch-srv-167.py` (electron/services.js + telefon index) ve `patch-ui-167.py` (iki bundle), telefon-hazirla.sh'ta. Test: `araclar/sham-her-yer-167-e2e.js`
  (örnekler `dekont-ornek/sham-giris.pdf`, `sham-cikis.pdf` — metin katmanlı; testte internetten gelen admin duyurusu gizlenir).

## Test
- `npm test`: `test/app.test.js` (sürüm, çekirdek kopyası, CSP, güncelleme kanalı, paketleme, Wi‑Fi arşiv kuralı sql.js ile, FOPK) +
  `test/electron-smoke.test.js` (gerçek Electron + xvfb, `FALCON_SMOKE=1`: açılış, üst çubuk, Ayarlar sırası; eski 1.57.0 kabuğunda
  overlay ile açılan yeni sürüm → "Yeni kurulum gerekli").
- Ekran görüntüleri: `PLAYWRIGHT_CORE=/opt/npm-tools/node_modules/playwright-core xvfb-run -a -s "-screen 0 1600x1000x24" node araclar/ekran.js <klasör>`.
- Test ortam değişkenleri: `FALCON_TEST_NO_PIN`, `FALCON_TEST_OLD_DATA_CHOICE`, `FALCON_TEST_NO_UPDATE`, `FALCON_TEST_DOCS_DIR`, `FALCON_TEST_UPDATE_DIR`.
- 1.66 FATURA TAHSİLATI (`openPay`, fatura-falcon.js): «Sham Cash (dekont)» / «Elle giriş» (`localStorage.fat_pay_mode`). Sham Cash'te önce `FalconShamDekont.read`
  (1.65 okuyucusu), tutar + işlem no yoksa genel okuyucu `dist/assets/dekont-falcon.js` (`FalconDekont.read`: Gemini `FalconFaturaPdf.gemini` + PDF metni / Tesseract
  OCR ana iş parçacığında, `ocr/tesseract-core-simd-lstm.wasm.js` + ara/eng; telefonda da). `addInvoicePayment` `sc: { ref, name, account, doc }` → hareketin
  sc_ref / sc_doc / pay_method (telefon: `araclar/patch-srv-166.py`); aynı sc_ref ikinci kez → `ERR_SC_DUPLICATE` (arayüz de açıklama / sc_ref ile engeller).
  Dekont `files.saveReceipt` (orijinal PDF / resim; telefonda JPEG) → `addReceipts`. Test: `araclar/tahsilat-166-e2e.js` (örnekler `araclar/dekont-ornek/`).

- 1.67.1 DEKONTTAN DOLDURMA + ONAY (Para Girişi / Çıkışı): `araclar/patch-ui-1671.py` (iki bundle; telefon-hazirla.sh'ta) `FalconScDocAttach` baştan: okuma özeti tablosu
  (`FalconShamDekont.rows/message/conflictText`), farklı alanda Online/Offline seçimi (`choose`), sürükle-bırak (`fromDrop` → files.saveReceipt, bayt bayt), vurgu (`markForm`:
  `.sc-filled` yeşil / `.sc-diff` turuncu), Tür sonradan değişince karşı taraf yeniden (`redirect`, yön dekonttan/formdan geldiyse «benim adım» öğrenilir). Forma yazılanlar
  `formPatch` (amount/date/direction/account_id/sc_*/sc_note/people/kayıtlı alıcı + geçici `sc_doc_info`); kayıt yalnız Kaydet ile. `FalconScApply` ortak; «Fişten oku»
  (`FalconOcrBtn`, `cur` = form değeri) `detect` ile Sham Cash dekontunu tanır (import `receipt`, PDF de). Yön sırası: benim adlarım → dekont türü (`kindDir`: SEND→out,
  RECEIVE→in; formla çelişirse yön değişir + uyarı, ad öğrenilmez) → formdaki yön. `read(…, onStep)`: online + offline paralel, `checks` alan alan (ok/diff/ai/off), `aiDoc`/`offDoc`;
  masaüstü OCR'ı yoksa (telefon) `FalconDekont.ocr` metni → `parseText` (`_partial`: ad/hesap teyitte kullanılmaz). Offline: ISO tarih (2026-11-28 - 12:34:34), tireli GENERATED,
  Arapça adlarda harf kutusu boşluğuyla kelime ayırma (`spacedName`). Test: `araclar/dekont-1671-e2e.js` (Gemini ana süreçte taklit; örnek `dekont-ornek/sham-goruntu.pdf` görüntü tabanlı).

- 1.67.2 DEKONT OKUMA HIZI (`shamcash-falcon.js` + `araclar/patch-ui-1672.py`, iki bundle; telefon-hazirla.sh'ta): Gemini isteği 25 sn (`AI_REQ`), toplam 45 sn (`AI_TOTAL`); 429/5xx → hemen
  sonraki model; düşünme kapalı (`thinkingConfig` thinkingLevel minimal/low → 400'de thinkingBudget 0/128 → ayarsız; çalışan biçim `localStorage.sc_ai_think`), model listesi
  `localStorage.sc_ai_models` (24 sa). `read`: online / offline ayrı izlenir, `onStep('tick', metin)` saniyeli durum; online gelince offline en çok `OFF_GRACE` 4 sn beklenir,
  bitmeyen taraf `res.late` (pick → `late`, file=relPath) → `FalconScApply` `D.late(v,x)` yalnız `sc_doc_info` (+ sc_doc.read_by) günceller, alanlara dokunmaz, farkta toast.
  `skipWait`/`canSkip` («⏭ Beklemeden doldur»), `warm` (form açılınca masaüstü OCR işçileri). Mesajlar `mAiWait`/`mOffWait`. Test: `araclar/dekont-1672-e2e.js`.

- 1.68 TELEGRAM → SHAM CASH DEKONTU: `dist/assets/telegram-falcon.js` (masaüstü + telefon; Ayarlar kartı `.tgf-kart`, Bildirimler kartından sonra) Telegram «Kayıtlı Mesajlar»ı
  izler (açılışta, ekran açıkken dakikada bir, öne gelince, internet gelince + GramJS NewMessage). GramJS tarayıcı paketi `dist/assets/telegram-vendor.js` (telegram@2.26.22,
  esbuild; yalnız oturum varken yüklenir; `LICENSE-gramjs.txt`), WebSocket `wss://*.web.telegram.org` (iki CSP'de). Oturum `localStorage.tg_session` (yalnız bu cihaz, eşitlenmez);
  uygulama anahtarı `localStorage.tg_api` > `guncelleme/telegram.json` {api_id, api_hash} (raw GitHub, `tg_api_remote`) > koddaki sabit. Tetik (1.69.1) `tg_trigger` > `guncelleme/telegram.json` `trigger` (`tg_trigger_remote`) > «ekle»; mesaj tetikle BAŞLAMALI (ya da yalnız tetik), «sisteme ekle» her zaman geçerli, eski kayıtlı «sisteme ekle» yok sayılır;
  altyazıda ya da dekonttan hemen önce 30 dk / hemen sonra 5 dk; arkasındaki yazı Notum). İşlenen mesajlar `tg_done`; başka cihazın «🦅 Falcon Ofis» yanıtı olan tetik atlanır;
  bir haftadan eski tetik işlenmez. Kayıt `FalconShamDekont.autoImport` (shamcash-falcon.js): files.saveReceipt (telefon: `araclar/patch-srv-168.py`) → read, `tg_wait` sn
  (vars. 15) sonra `waiting.skip` (offline hazırsa) → yön benim adlarım > dekont türü > Çıkış(+review) → `saveItem`/importShamCashReceipt, açıklama «📨 Telegram»; tutar yoksa
  ERR_SC_AMOUNT (kayıt yok, dosya saklı). Günlük eşitlenen ayar `telegram_log` [{m,d,tx,dir,amt,cur,ref,src,rv,ok,u,…}]: `rv` kodları gözden geçir listesi; kaydın
  updated_at'i `u`'dan farklıysa (düzenlendi) ya da «✓ Gözden geçirdim» → kalkar; geç gelen okuma farklıysa `latediff`. Telegram'a yanıt + `falcon.notify`.
  Arapça Ayarlar'da Kullanım / Bildirimler kartları bulunamıyordu (başlık metni) → `مزامنة الهاتف والحاسوب` eklendi. Test: `araclar/telegram-168-e2e.js` (Telegram istemcisi taklit).

- 1.69 ÇEVRİMDIŞI YAPAY ZEKÂ (ortak-cekirdek `web/yerel-zeka`, kopya `cekirdek/electron/yerel-zeka/` + `dist/cekirdek/fc-yerel-zeka-ui.js`): ana süreç
  `fc-yerel-zeka-main.install` (main.js), preload `window.fcYerelZeka`, Ayarlar kartı `yerelZekaCard` (Arşiv'den sonra, Hakkında'dan önce; smoke testi sırayı denetler).
  Paketler `<userData>/yerel-zeka` (GitHub `ortak-cekirdek` sürümü `yerel-zeka-v1`): runtime (onnxruntime-node DirectML, transformers.js, tesseract.js,
  node-llama-cpp Vulkan) · ocr (PaddleOCR PP-OCRv5 + Tesseract) · llm (TranslateGemma 12B/4B) · mt (NLLB-200). `FalconDekont.ocr` paket kuruluysa
  `FCYZ.ocr` (yoksa Tesseract); `FalconFaturaPdf.translate` Gemini olmazsa `FCYZ.translate`, o da olmazsa TERMS. Sham Cash'in bölgesel okuyucusu değişmedi.

- 1.70.0 SHAM CASH + YEREL ZEKÂ: `read` offline yolunda `viaYz` (FCYZ.ocr, `quality:'hizli'` = PP-OCRv5 mobil algılama, ~2–10 sn) ve Tesseract bölge okuması (`viaOcr`/`textOcr`)
  paralel; `mergeOff`: yapay zekâ okuması esas, boş alanlar + geçerli `************dddd` hesapları Tesseract'tan. Paket yoksa eski yol aynen.
  Test: `YZ_PAKET=<kurulu yerel-zeka klasörü> … node araclar/dekont-1671-e2e.js` (paket kopyalanır; sham-goruntu.pdf'te farklı alan 2 → 1, teyitli 6 → 7).
- 1.70.0 TELEFON YEREL ZEKÂ: telefon www'sine `assets/yz/` (ortak-cekirdek `web/yerel-zeka/telefon` + fc-ocr/fc-mt), `cekirdek/fc-yerel-zeka-ui.js` ve `assets/yz-falcon.js`
  (Ayarlar'da Telegram kartından sonra «Çevrimdışı yapay zekâ» kartı; yalnız `fcYerelZeka.telefon`) — `telefon-yayinla.js` kopyalar, etiketleri ve CSP (`cdn.jsdelivr.net`) ekler.
  Paketler `ortak-cekirdek` `yerel-zeka-telefon` dalından (PP-OCRv5 mobil + Tesseract ~36 MB, NLLB-200 8 bit ~896 MB), IndexedDB. `FalconDekont.ocr` ve Sham Cash `viaYz` telefonda da çalışır.

- 1.71.0 BELGEDEN DOLDUR (PDF + FOTOĞRAF) + ÜRÜN KAYDI + ÖZEL DOSYALAR: `fatura-pdf.js` `read` dosya türünü baytlardan alır (PDF / JPEG / PNG / WEBP). Resim ve metinsiz (taranmış) PDF:
  Gemini'ye resmin kendisi (`inline_data` image/*), çevrimdışı `FalconDekont.docOcr` (dekont-falcon.js): yerel zekâ kuruluysa PP-OCRv5 kutuları, yoksa Tesseract **tur+eng**
  (`ocr/tur.traineddata.gz` tessdata_best; TSV sözcük kutuları, psm 6) — ön işlem `docCanvas`: izdüşümle eğiklik (≥0,4°), yerel uyarlamalı eşik, tablo çizgisi silme; `docClean`
  ile temiz görüntü önce 'soft', fotoğraf önce 'lat', tutarsızsa öteki. Ayrıştırma `parseBest` = e-Fatura `parseLayout` ile genel `parseGeneric` (TR/EN sütun başlıkları, çok
  sayfa, liste fiyatı + iskonto + net, dikey ortalı / alta taşan açıklamalar, iki para birimli toplamlar, belgedeki kur «doc_fx_rate» / TL karşılığı, teklif no / geçerlilik);
  başlık okunamazsa `gItemsLoose` («15 ADET 700,00 $ 10.500,00 $» kalıbı). `normalize` Model / P/N / S/N'yi addan ayrıca çıkarır (alan yalnız varsa). ABD tarihi (10/22/2026).
  Arayüz (fatura-falcon.js): «Belgeden doldur» seçim penceresi (dosya, kamera, sürükle-bırak, Ctrl+V), önizlemede «Aktarım» seçenekleri (`localStorage.fat_imp_opts`): ürün
  kayıtlarına işle (`saveProducts` → saveProductCard; aynı ürün kod > seçili eşleşme > ad; fiyat güncelle / dokunma), müşteriyi aktar, kalemleri ekle / yerine koy, okunan
  belgeyi özel dosya yap; «Yalnız ürünlere kaydet»; Ürünler sekmesinde «Belgeden ürün ekle». `confirmBox` fat-modal açıkken kendi onay penceresi (programınki arkada kalıyordu).
  ÖZEL DOSYALAR: tablo `invoice_files` (migration 31, eşitlenir; FILE_COLUMNS / FILE_REFS / lan-falcon.js), servis `addInvoiceFiles` / `deleteInvoiceFile` (Silinenler kutusu) /
  `setInvoiceFileNote`, IPC `files:saveFile` (her tür, ≤50 MB, `belgeler/`); telefon `araclar/patch-srv-171.py` (servis + schema + sync + `files.saveFile`). Listede 🔒 (sayı),
  düzenleyicide «🔒 Özel dosyalar» (yeni faturada kayıtta eklenir). Çıktıya / PDF'e girmez. Test: `araclar/fatura-171-e2e.js` (gerçek örnekler depoda YOK — açık depo; `FATURA_ORNEK=<klasör>`).

- 1.72.0 TAHSİL EDİLDİ (KASAYA EKLENMEZ): `openPay` üçüncü mod `nocash` («✓ Tahsil edildi (kasaya eklenmez)»; hatırlanmaz, kasa yoksa tek yol) → `addInvoicePayment { no_cash: true }`
  → `invoicePay` kasa hareketi yazmaz (invoice_payments.account_id / cash_transaction_id NULL), fatura paid / partial olur. Listede «✓ kasaya eklenmedi» etiketi. Servis yaması
  `araclar/patch-srv-172.py` (electron/services.js + telefon index; telefon-hazirla.sh'ta). Test: `araclar/fatura-172-e2e.js`.
