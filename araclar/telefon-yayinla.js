// Falcon Ofis — telefon güncellemesini GitHub'a yayınlar (depo kökünden):
//   OZEL_ANAHTAR=<ozel-anahtar.pem> node araclar/telefon-yayinla.js <sürüm> <www klasörü> "notlar" [apk dosyası] [minShell]
// www klasörü = APK'daki assets/www (index.html + assets/). Telefon (1.53.1 ve sonrası) önce guncelleme/telefon.json'a bakar,
// Firebase'deki sürüm daha yeniyse onu alır (eski yol yedek olarak çalışır). APK verilirse kabuk seviyesi minShell'den düşük
// telefonlar APK'yı indirip kurar. İmza metinleri programla aynı: "telefon\nsürüm\nsha256", "telefon-apk\nsürüm\nsha256".
const fs = require('fs');
const path = require('path');
const pack = require('../electron/update-pack');

const [version, www, notes = '', apkPath, minShell] = process.argv.slice(2);
if (!version || !www) throw new Error('kullanım: sürüm www-klasörü "notlar" [apk] [minShell]');
const G = path.join(__dirname, '..', 'guncelleme');
const pem = fs.readFileSync(process.env.OZEL_ANAHTAR || '', 'utf8');
// v1.54: Ayarlar > Kullanım Limitleri kartı telefona da girer (masaüstündeki dist/assets kopyaları kullanılır)
// v1.59: Fatura sekmesi eklentisi de (dist/assets/fatura-falcon.js) telefona girer
// v1.59.1: duyuru-falcon.js (yüzen 🔔 gizli, Ayarlar'da "Bildirimler ve Duyurular" kartı) da masaüstü kopyasından gelir
// v1.60: PDF'den doldur (fatura-pdf.js + pdf.js çevrimdışı okuyucu) ve karekod (qrcode-gen.js)
for (const f of ['kullanim.js', 'kullanim-falcon.js', 'fatura-falcon.js', 'duyuru-falcon.js', 'fatura-pdf.js', 'qrcode-gen.js', 'pdfjs/pdf.min.mjs', 'pdfjs/pdf.worker.min.mjs', 'pdfjs/LICENSE.txt', 'shamcash-falcon.js',
  // v1.66: fatura tahsilatı dekont okuyucu (Sham Cash / genel; çevrimdışı OCR ana iş parçacığında: Tesseract çekirdeği + Arapça / İngilizce)
  'dekont-falcon.js', 'ocr/tesseract-core-simd-lstm.wasm.js', 'ocr/ara.traineddata.gz', 'ocr/eng.traineddata.gz', 'ocr/LICENSE-tesseract-core.txt',
  // v1.71: belge (fatura / teklif fotoğrafı) OCR'ı için Türkçe model; faturaya özel dosyalar Wi‑Fi eşitlemesinde de (lan-falcon.js FILE_COLUMNS)
  'ocr/tur.traineddata.gz', 'ocr/LICENSE-tessdata.txt', 'lan-falcon.js',
  // v1.68: Telegram «Kayıtlı Mesajlar» → Sham Cash dekontu otomatik kayıt (GramJS tarayıcı paketi yalnız açılınca yüklenir)
  'telegram-falcon.js', 'telegram-vendor.js', 'LICENSE-gramjs.txt',
  // v1.70: çevrimdışı yapay zekâ (telefon çalışma zamanı + kart): PP-OCRv5 + Tesseract OCR, NLLB-200 çeviri; paketler GitHub'dan bir kez iner
  'yz-falcon.js', ...fs.readdirSync(path.join(__dirname, '..', 'dist', 'assets', 'yz'), { recursive: true }).filter((f) => !fs.statSync(path.join(__dirname, '..', 'dist', 'assets', 'yz', f)).isDirectory()).map((f) => 'yz/' + f.split(path.sep).join('/')),
  '../cekirdek/fc-yerel-zeka-ui.js'].map((f) => f.replace(/^\.\.\/cekirdek\//, '../cekirdek/'))) {
  fs.mkdirSync(path.dirname(path.join(www, 'assets', f)), { recursive: true });
  fs.copyFileSync(path.join(__dirname, '..', 'dist', 'assets', f), path.join(www, 'assets', f));
}
{
  const ih = path.join(www, 'index.html');
  let h = fs.readFileSync(ih, 'utf8');
  if (!h.includes('kullanim.js')) {
    h = h.replace(/(<script type="module")/, '<script src="./assets/kullanim.js"></script>\n    <script src="./assets/kullanim-falcon.js"></script>\n    $1');
    fs.writeFileSync(ih, h);
  }
  if (!h.includes('fatura-falcon.js')) {
    h = h.replace(/(<script src="\.\/assets\/kullanim-falcon\.js"><\/script>)/, '$1\n    <script src="./assets/fatura-falcon.js"></script>');
    fs.writeFileSync(ih, h);
  }
  // v1.65: Sham Cash dekontu (telefonda çevrimiçi yapay zekâ ile okur; çevrimdışı okuyucu dosyaları telefona konmaz)
  if (!h.includes('shamcash-falcon.js')) {
    h = h.replace(/(<script type="module")/, '<script src="./assets/shamcash-falcon.js"></script>\n    $1');
    fs.writeFileSync(ih, h);
  }
  if (!h.includes('fatura-pdf.js')) {
    h = h.replace(/(<script src="\.\/assets\/fatura-falcon\.js"><\/script>)/, '<script src="./assets/qrcode-gen.js"></script>\n    $1\n    <script src="./assets/fatura-pdf.js"></script>');
    fs.writeFileSync(ih, h);
  }
  if (!h.includes('telegram-falcon.js')) {
    h = h.replace(/(<script src="\.\/assets\/shamcash-falcon\.js"><\/script>)/, '$1\n    <script src="./assets/telegram-falcon.js"></script>');
    fs.writeFileSync(ih, h);
  }
  if (!h.includes('wss://*.web.telegram.org')) {
    h = h.replace(/(connect-src 'self')/, "$1 wss://*.web.telegram.org");
    fs.writeFileSync(ih, h);
  }
  if (!h.includes('yz-falcon.js')) { // v1.70: çevrimdışı yapay zekâ (önce çalışma zamanı, sonra arayüz, sonra kart; dekont okuyucusundan önce)
    h = h.replace(/(<script type="module")/, '<script src="./assets/yz/fc-yerel-zeka-web.js"></script>\n    <script src="./cekirdek/fc-yerel-zeka-ui.js"></script>\n    <script src="./assets/yz-falcon.js"></script>\n    $1');
    fs.writeFileSync(ih, h);
  }
  if (!h.includes('cdn.jsdelivr.net')) { // telefon paketleri raw.githubusercontent.com + jsDelivr'dan iner
    h = h.replace(/(connect-src 'self')/, "$1 https://raw.githubusercontent.com https://cdn.jsdelivr.net");
    fs.writeFileSync(ih, h);
  }
  if (!h.includes('dekont-falcon.js')) {
    h = h.replace(/(<script src="\.\/assets\/fatura-pdf\.js"><\/script>)/, '$1\n    <script src="./assets/dekont-falcon.js"></script>');
    fs.writeFileSync(ih, h);
  }
}
const files = pack.listFiles(www).map((r) => ({ path: r, file: path.join(www, r) }));
const gz = pack.createPack(version, files);
const sha256 = pack.sha256(gz);
const sig = pack.sign(pem, 'telefon', version, sha256);
if (!pack.verify('telefon', version, sha256, sig)) throw new Error('anahtar uyuşmuyor');
for (const f of fs.readdirSync(G)) if (/^telefon-.*\.fopk$|^Falcon-Ofis-.*\.apk$/.test(f)) fs.rmSync(path.join(G, f));
const file = `telefon-${version}.fopk`;
fs.writeFileSync(path.join(G, file), gz);
const m = { version, notes, size: gz.length, sha256, sig, file, minShell: Number(minShell) || 0, publishedAt: new Date().toISOString() };
if (apkPath) {
  const apk = fs.readFileSync(apkPath);
  const apkVersion = process.env.APK_VERSION || version; // APK'nın kendi sürümü (ör. 1.53.0) verilebilir
  m.apkFile = `Falcon-Ofis-v${apkVersion}.apk`;
  m.apkVersion = apkVersion;
  m.apkSize = apk.length;
  m.apkSha256 = pack.sha256(apk);
  m.apkSig = pack.sign(pem, 'telefon-apk', apkVersion, m.apkSha256);
  fs.writeFileSync(path.join(G, m.apkFile), apk);
}
fs.writeFileSync(path.join(G, 'telefon.json'), JSON.stringify(m, null, 1));
console.log('hazır telefon', version, gz.length, 'bayt', apkPath ? '+ APK' : '');
