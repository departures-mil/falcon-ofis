# Falcon Ofis

Ofis / kasa programı: Windows masaüstü (Electron) + Android. Kayıtlar Firebase ve aynı Wi‑Fi üzerinden eşitlenir;
**kayıtlar bu depoda bulunmaz**.

- `electron/` ana süreç kodu, `dist/` derlenmiş arayüz, `build/` simge, `package.json` (sürüm).
- `guncelleme/masaustu.json` + `masaustu-<sürüm>.fopk` — ECDSA imzalı masaüstü güncellemesi. Program buradan indirir,
  imzası tutmayanı kurmaz.
- `guncelleme/telefon.json` + `telefon-<sürüm>.fopk` (+ `Falcon-Ofis-v<sürüm>.apk`) — telefon güncellemesi. Telefon 1.54'ten beri
  yalnızca GitHub'a bakar; Firebase'e yalnızca GitHub'a hiç ulaşılamazsa bakılır. **Güncellemeler artık Firebase'e yüklenmez**
  (Firebase yalnızca canlı kayıtlar içindir; kotası korunur).
- İmza anahtarı depoda yoktur (`Falcon Ofis Veri\yayin\anahtar`).

## Yeni masaüstü sürümü
1. `package.json` içindeki sürümü artır.
2. `OZEL_ANAHTAR=... node araclar/yayinla.js "notlar"` → `git add -A && git commit && git push`

## Yeni telefon sürümü (GitHub)
`OZEL_ANAHTAR=... node araclar/telefon-yayinla.js <sürüm> <www klasörü> "notlar" [apk] [minShell]` → commit + push.

**DİKKAT (telefon arayüzünü yeniden derleyenler):** telefon arayüzünün kaynağı bu depoda değil; 1.53.1'deki GitHub
desteği derlenmiş `index-*.js`'e eklendi (`__fgU` / `__fgD` yardımcıları, güncelleme `check` + `install` içinde) ve
`index.html` CSP `connect-src`'ye `https://raw.githubusercontent.com` eklendi. Kaynaktan yeni derleme yapan, bu ikisini
kaynağa da taşımalı; yoksa telefon yine yalnızca Firebase'den alır.
