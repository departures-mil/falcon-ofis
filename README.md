# Falcon Ofis

Ofis / kasa programı: Windows masaüstü (Electron) + Android. Kayıtlar Firebase ve aynı Wi‑Fi üzerinden eşitlenir;
**kayıtlar bu depoda bulunmaz**.

- `electron/` ana süreç kodu, `dist/` derlenmiş arayüz, `build/` simge, `package.json` (sürüm).
- **Güncellemeler (v1.58.0'dan beri): yalnız GitHub Releases** — ortak çekirdek (`departures-mil/ortak-cekirdek`) `latest.json` +
  FCD1 yamalar; kanallar `win-app` (app.asar) ve `win-setup` (NSIS kurulum). Ayrıntı: `CLAUDE.md`.
- `guncelleme/masaustu.json` + `.fopk` yalnızca **eski kurulumlar için köprü** (1.51–1.57 buraya bakar; ≤1.50 Firebase'e bakardı,
  oraya son bir kez köprü konuldu). Yeni sürümler buraya konmaz. Telefon dosyaları (`telefon.json`) değişmedi; telefon kabuğunun kaynağı bu depoda yok.
- İmza anahtarı depoda yoktur (`Falcon Ofis Veri\yayin\anahtar`, `C:\Claude Programlarım\_Anahtarlar\FalconOfis`).

## Yeni masaüstü sürümü (v1.58.0'dan beri)
1. `package.json` sürümünü yükselt, `dist/assets/fc-falcon.js` içindeki `NEWS`'e ve `release-notes.json`'a notları yaz (tr/en/ar).
2. `npm test` → main'e birleştir → `gh api -X POST repos/departures-mil/falcon-ofis/actions/workflows/release.yml/dispatches -f ref=main`.
   CI: test (node + Electron/xvfb) → Windows derlemesi (NSIS + app.asar) → ortak release (latest.json, son 5 sürümden yama).

## Yeni telefon sürümü (GitHub)
`OZEL_ANAHTAR=... node araclar/telefon-yayinla.js <sürüm> <www klasörü> "notlar" [apk] [minShell]` → commit + push.

**DİKKAT (telefon arayüzünü yeniden derleyenler):** telefon arayüzünün kaynağı bu depoda değil; 1.53.1'deki GitHub
desteği derlenmiş `index-*.js`'e eklendi (`__fgU` / `__fgD` yardımcıları, güncelleme `check` + `install` içinde) ve
`index.html` CSP `connect-src`'ye `https://raw.githubusercontent.com` eklendi. Kaynaktan yeni derleme yapan, bu ikisini
kaynağa da taşımalı; yoksa telefon yine yalnızca Firebase'den alır.

## Kullanım Limitleri (v1.54)
Ayarlar'da eşitleme kartının altında kullanıcının kendi Firebase hesabındaki günlük okuma/yazma/silme sayacı.
Ortak istemci `departures-mil/duyurular/istemci/kullanim.js` → `dist/assets/kullanim.js` ve `electron/kullanim.js` (aynı dosya).
Masaüstünde sayım ana süreçte (`main.js` → `Kullanim.fetchSar`, dosya `kullanim-limit.json`), pencereye `Kullanim.ice` ile aktarılır.
Telefonda `window.fetch` doğrudan izlenir; `araclar/telefon-yayinla.js` iki dosyayı www klasörüne kendisi ekler.

## Asistan Agent
v1.58.0'dan beri masaüstünde ortak çekirdeğin `FC.agent`'ı kullanılır (bağımsız `fc-agent.js` kaldırıldı): üst çubukta ✦, Ayarlar'da kart.
Telefon 1.57.0 www'si hâlâ bağımsız `fc-agent.js` taşır (telefon kaynağı bu depoda değil).
