# Falcon Ofis

Ofis / kasa / stok programı. Windows masaüstü (Electron 44, `electron/`) + Android (telefon kabuğunun kaynağı bu depoda YOK).
React kaynağı yok: arayüz derlenmiş `dist/assets/index-*.js/css`; özellikler yama betikleriyle (`araclar/patch-ui-*.py`) ya da
paketin yanındaki düz JS eklentileriyle (`dist/assets/*-falcon.js`) eklenir. Görünüm ortak çekirdeğin tasarım kaynağıdır (Falcon).

## Ortak çekirdek (v1.58.0'dan beri)
- `departures-mil/ortak-cekirdek` gömülü kopya: `cekirdek/electron/` (fc-electron-main, fc-preload, fcd1) + `dist/cekirdek/`
  (fc-core.js, css, yazı tipleri). Commit `cekirdek/VERSION`'da. Çekirdek deposunu buradan değiştirme.
  Yerel düzeltme: `dist/cekirdek/fc-core.js` → kabuk indirmesinde `latest.json` 404 = "güncel" ("falcon-ofis yerel düzeltmesi").
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

## Kurallar (Milen)
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
  `C:\Claude Programlarım\_Anahtarlar\FalconOfis\ozel-anahtar.pem`). Eski kabukta yeni sürüm "Yeni kurulum gerekli" der ve
  GitHub sürümünden program dosyalarını yeniler (yazılabilir klasör: app.asar takası; değilse kurulum). Yeni sürümler köprüye konmaz.
- Android: APK yalnızca Milen isteyince; telefon kabuğu kaynağı burada olmadığından `android` kanalı yok.
- İmza anahtarları / şifreler depoya girmez.

## Test
- `npm test`: `test/app.test.js` (sürüm, çekirdek kopyası, CSP, güncelleme kanalı, paketleme, Wi‑Fi arşiv kuralı sql.js ile, FOPK) +
  `test/electron-smoke.test.js` (gerçek Electron + xvfb, `FALCON_SMOKE=1`: açılış, üst çubuk, Ayarlar sırası; eski 1.57.0 kabuğunda
  overlay ile açılan yeni sürüm → "Yeni kurulum gerekli").
- Ekran görüntüleri: `PLAYWRIGHT_CORE=/opt/npm-tools/node_modules/playwright-core xvfb-run -a -s "-screen 0 1600x1000x24" node araclar/ekran.js <klasör>`.
- Test ortam değişkenleri: `FALCON_TEST_NO_PIN`, `FALCON_TEST_OLD_DATA_CHOICE`, `FALCON_TEST_NO_UPDATE`, `FALCON_TEST_DOCS_DIR`, `FALCON_TEST_UPDATE_DIR`.
