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

## Test
- `npm test`: `test/app.test.js` (sürüm, çekirdek kopyası, CSP, güncelleme kanalı, paketleme, Wi‑Fi arşiv kuralı sql.js ile, FOPK) +
  `test/electron-smoke.test.js` (gerçek Electron + xvfb, `FALCON_SMOKE=1`: açılış, üst çubuk, Ayarlar sırası; eski 1.57.0 kabuğunda
  overlay ile açılan yeni sürüm → "Yeni kurulum gerekli").
- Ekran görüntüleri: `PLAYWRIGHT_CORE=/opt/npm-tools/node_modules/playwright-core xvfb-run -a -s "-screen 0 1600x1000x24" node araclar/ekran.js <klasör>`.
- Test ortam değişkenleri: `FALCON_TEST_NO_PIN`, `FALCON_TEST_OLD_DATA_CHOICE`, `FALCON_TEST_NO_UPDATE`, `FALCON_TEST_DOCS_DIR`, `FALCON_TEST_UPDATE_DIR`.
