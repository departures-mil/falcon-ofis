# Falcon Ofis

Ofis / kasa programı: Windows masaüstü (Electron) + Android. Kayıtlar Firebase ve aynı Wi‑Fi üzerinden eşitlenir;
**kayıtlar bu depoda bulunmaz**.

- `electron/` ana süreç kodu, `dist/` derlenmiş arayüz, `build/` simge, `package.json` (sürüm).
- `guncelleme/masaustu.json` + `masaustu-<sürüm>.fopk` — ECDSA imzalı masaüstü güncellemesi. Program buradan indirir,
  imzası tutmayanı kurmaz.
- Telefon uygulaması güncellemeyi henüz Firebase'den alır (programdaki `yayin\kuyruk` klasörü üzerinden yayınlanır).
- İmza anahtarı depoda yoktur (`Falcon Ofis Veri\yayin\anahtar`).

## Yeni masaüstü sürümü
1. `package.json` içindeki sürümü artır.
2. `OZEL_ANAHTAR=... node araclar/yayinla.js "notlar"` → `git add -A && git commit && git push`
