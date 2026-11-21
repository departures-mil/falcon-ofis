// v1.37: Yayın kutusu. Güncellemeler bu bilgisayardan yayınlanır:
//   "Falcon Ofis Veri/yayin/kuyruk/"  → buraya bırakılan paket (.fopk) ve yanındaki .json bilgi dosyası imzalanıp
//                                        bulut eşitlemesinin oturumuyla Firebase'deki guncellemeler/<platform> belgesine yüklenir.
//                                        Telefon ve diğer bilgisayarlar güncellemeyi oradan tek tıkla alır.
//   "Falcon Ofis Veri/yayin/anahtar/"  → ozel-anahtar.pem (imza anahtarı; yalnızca bu bilgisayarda durur, yedeğini alın)
//   "Falcon Ofis Veri/yayin/gorevler/" → {"islem":"indir","platform":"telefon"} gibi görevler: buluttaki paket "gelen/" klasörüne iner.
//   "Falcon Ofis Veri/yayin/gelen/"    → indirilen paketler ve durum.json (buluttaki güncelleme belgelerinin özeti)
//   "Falcon Ofis Veri/yayin/kayit.txt" → günlük
// Kuyruk ve görevler açılıştan 15 sn sonra ve sonra her dakika işlenir. Kayıtlara ve ayarlara dokunulmaz.
const fs = require('fs');
const path = require('path');
const pack = require('./update-pack');

const PART_SIZE = 700 * 1024;
const PLATFORMS = ['masaustu', 'telefon'];
const MAX_ATTEMPTS = 5;
const LOG_LIMIT = 300 * 1024;

function createPublisher({ root, getClient, currentVersion = () => '', intervalMs = 60000, firstDelayMs = 15000 }) {
  let timer = null;
  let first = null;
  let running = null;
  let statusDone = false;

  const dirs = () => ({
    root,
    queue: path.join(root, 'kuyruk'),
    done: path.join(root, 'yayinlandi'),
    incoming: path.join(root, 'gelen'),
    keys: path.join(root, 'anahtar'),
    tasks: path.join(root, 'gorevler'),
  });

  function ensureDirs() {
    for (const d of Object.values(dirs())) fs.mkdirSync(d, { recursive: true });
  }

  function log(msg) {
    try {
      const file = path.join(root, 'kayit.txt');
      try {
        if (fs.statSync(file).size > LOG_LIMIT) fs.renameSync(file, path.join(root, 'kayit-eski.txt'));
      } catch {
        // dosya yok
      }
      fs.appendFileSync(file, `${new Date().toISOString()} ${msg}\n`);
    } catch {
      // günlük yazılamadı, önemli değil
    }
  }

  const readJson = (file) => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return null;
    }
  };
  const writeJson = (file, data) => {
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2));
    fs.renameSync(`${file}.tmp`, file);
  };
  const errText = (err) => `${err?.code || err?.message || err}${err?.detail ? ` (${err.detail})` : ''}`;

  function privateKey() {
    const file = path.join(dirs().keys, 'ozel-anahtar.pem');
    if (!fs.existsSync(file)) return null;
    return fs.readFileSync(file, 'utf8');
  }

  // ---------- Firestore yardımcıları ----------
  const docName = (client, platform) => `${client.docsRoot}/guncellemeler/${platform}`;
  const docUrl = (client, name) => `${client.ep.firestore}/${name.split('/').map(encodeURIComponent).join('/')}`;
  const field = (doc, name) => {
    const f = doc?.fields?.[name];
    if (!f) return null;
    return f.stringValue ?? f.integerValue ?? f.bytesValue ?? f.booleanValue ?? null;
  };
  const docSummary = (doc) => (doc ? {
    version: field(doc, 'version'), notes: field(doc, 'notes'), size: Number(field(doc, 'size')) || 0, parts: Number(field(doc, 'parts')) || 0,
    sha256: field(doc, 'sha256'), electron: field(doc, 'electron'), publishedAt: field(doc, 'publishedAt'), updateTime: doc.updateTime || null,
    minShell: Number(field(doc, 'minShell')) || 0, apkVersion: field(doc, 'apkVersion'), apkParts: Number(field(doc, 'apkParts')) || 0, apkSize: Number(field(doc, 'apkSize')) || 0,
  } : null);

  async function setDoc(client, name, fields) {
    return client.request(docUrl(client, name), { method: 'PATCH', body: { fields } });
  }

  async function listParts(client, platform) {
    const out = [];
    let pageToken = '';
    do {
      const url = `${docUrl(client, `${docName(client, platform)}/parcalar`)}?pageSize=300&mask.fieldPaths=yok${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
      const r = await client.request(url);
      for (const d of r?.documents || []) out.push(d.name);
      pageToken = r?.nextPageToken || '';
    } while (pageToken);
    return out;
  }

  async function downloadPack(client, platform) {
    const doc = await client.getDoc(docName(client, platform));
    if (!doc) return null;
    const info = docSummary(doc);
    info.sig = field(doc, 'sig');
    const bufs = [];
    for (let i = 0; i < info.parts; i++) {
      const part = await client.getDoc(`${docName(client, platform)}/parcalar/${info.version}-${i}`);
      const b64 = part?.fields?.b?.bytesValue;
      if (!b64) throw new Error('ERR_UPDATE_DOWNLOAD');
      bufs.push(Buffer.from(b64, 'base64'));
    }
    const gz = Buffer.concat(bufs);
    info.downloadedSha256 = pack.sha256(gz);
    info.hashOk = info.downloadedSha256 === info.sha256;
    info.signedWithCurrentKey = pack.verify(platform, info.version, info.sha256, info.sig);
    return { info, gz };
  }

  // ---------- Yayınlama ----------
  async function publish(client, manifestFile) {
    const d = dirs();
    const name = path.basename(manifestFile, '.json');
    const m = readJson(manifestFile);
    if (!m || !PLATFORMS.includes(m.platform) || !/^\d+(\.\d+)*$/.test(String(m.version || ''))) throw new Error('ERR_YAYIN_BAD_MANIFEST');
    const packFile = path.join(d.queue, path.basename(String(m.file || `${name}.fopk`)));
    if (!fs.existsSync(packFile)) throw new Error('ERR_YAYIN_NO_PACK');
    const pem = privateKey();
    if (!pem) throw new Error('ERR_YAYIN_NO_KEY');
    const gz = fs.readFileSync(packFile);
    const parsed = pack.readPack(gz);
    if (parsed.version !== m.version) throw new Error('ERR_YAYIN_VERSION_MISMATCH');
    const hash = pack.sha256(gz);
    const sig = pack.sign(pem, m.platform, m.version, hash);
    if (!pack.verify(m.platform, m.version, hash, sig)) throw new Error('ERR_YAYIN_KEY_MISMATCH');

    const split = (buf) => {
      const out = [];
      for (let off = 0; off < buf.length; off += PART_SIZE) out.push(buf.subarray(off, off + PART_SIZE));
      return out;
    };
    const parts = split(gz);
    log(`yayın başlıyor: ${m.platform} ${m.version} (${gz.length} bayt, ${parts.length} parça)`);
    for (let i = 0; i < parts.length; i++) {
      await setDoc(client, `${docName(client, m.platform)}/parcalar/${m.version}-${i}`, { b: { bytesValue: parts[i].toString('base64') } });
    }
    const fields = {
      version: { stringValue: m.version },
      notes: { stringValue: String(m.notes || '') },
      size: { integerValue: String(gz.length) },
      sha256: { stringValue: hash },
      sig: { stringValue: sig },
      parts: { integerValue: String(parts.length) },
      publishedAt: { stringValue: new Date().toISOString() },
    };
    if (m.electron) fields.electron = { stringValue: String(m.electron) };
    // Telefon: Java sarmalayıcısı (APK) da değiştiyse manifest'te apk: { file, version, minShell } verilir.
    // Kabuk seviyesi minShell'den düşük telefonlar "Güncelle"ye basınca APK'yı indirip Android kurulum ekranını açar;
    // yeni kabuktakiler yalnızca www paketini alır. APK imzası "telefon-apk\nsürüm\nsha256" üzerindedir.
    let apkKeep = null;
    if (m.platform === 'telefon' && m.apk && m.apk.file) {
      const apkFile = path.join(d.queue, path.basename(String(m.apk.file)));
      if (!fs.existsSync(apkFile)) throw new Error('ERR_YAYIN_NO_APK');
      const apkVersion = String(m.apk.version || m.version);
      const apk = fs.readFileSync(apkFile);
      if (apk.subarray(0, 2).toString('latin1') !== 'PK') throw new Error('ERR_YAYIN_BAD_APK');
      const apkHash = pack.sha256(apk);
      const apkSig = pack.sign(pem, 'telefon-apk', apkVersion, apkHash);
      const apkParts = split(apk);
      log(`APK yükleniyor: ${apkVersion} (${apk.length} bayt, ${apkParts.length} parça, minShell ${m.apk.minShell})`);
      for (let i = 0; i < apkParts.length; i++) {
        await setDoc(client, `${docName(client, m.platform)}/parcalar/apk-${apkVersion}-${i}`, { b: { bytesValue: apkParts[i].toString('base64') } });
      }
      fields.minShell = { integerValue: String(Number(m.apk.minShell) || 0) };
      fields.apkVersion = { stringValue: apkVersion };
      fields.apkSize = { integerValue: String(apk.length) };
      fields.apkSha256 = { stringValue: apkHash };
      fields.apkSig = { stringValue: apkSig };
      fields.apkParts = { integerValue: String(apkParts.length) };
      apkKeep = { file: apkFile, prefix: `apk-${apkVersion}-` };
    } else if (m.platform === 'telefon' && m.minShell) {
      fields.minShell = { integerValue: String(Number(m.minShell) || 0) };
    }
    await setDoc(client, docName(client, m.platform), fields);

    // Eski sürümlerin parçaları silinir (başarısız olursa önemli değil)
    let removed = 0;
    try {
      for (const full of await listParts(client, m.platform)) {
        const id = full.split('/').pop();
        if (id.startsWith(`${m.version}-`) || (apkKeep && id.startsWith(apkKeep.prefix))) continue;
        await client.request(docUrl(client, full), { method: 'DELETE' });
        removed++;
      }
    } catch (err) {
      log(`eski parçalar silinemedi: ${errText(err)}`);
    }

    fs.renameSync(packFile, path.join(d.done, path.basename(packFile)));
    if (apkKeep) fs.renameSync(apkKeep.file, path.join(d.done, path.basename(apkKeep.file)));
    fs.renameSync(manifestFile, path.join(d.done, `${name}.json`));
    fs.rmSync(path.join(d.queue, `${name}.deneme.json`), { force: true });
    writeJson(path.join(d.done, `${name}.sonuc.json`), { ok: true, platform: m.platform, version: m.version, size: gz.length, parts: parts.length, sha256: hash, publishedAt: fields.publishedAt.stringValue, removedOldParts: removed });
    log(`yayınlandı: ${m.platform} ${m.version}`);
  }

  async function processQueue(client) {
    const d = dirs();
    const manifests = fs.readdirSync(d.queue).filter((n) => n.endsWith('.json') && !n.endsWith('.deneme.json') && !n.endsWith('.hata.json')).sort();
    for (const n of manifests) {
      const file = path.join(d.queue, n);
      const attemptFile = path.join(d.queue, `${path.basename(n, '.json')}.deneme.json`);
      const attempt = readJson(attemptFile) || { count: 0 };
      try {
        await publish(client, file);
      } catch (err) {
        attempt.count += 1;
        attempt.last = new Date().toISOString();
        attempt.error = errText(err);
        writeJson(attemptFile, attempt);
        log(`yayın hatası (${attempt.count}/${MAX_ATTEMPTS}) ${n}: ${attempt.error}`);
        // Anahtar yoksa deneme sayılmaz; anahtar konunca kendiliğinden devam eder
        if (err?.message === 'ERR_YAYIN_NO_KEY') attempt.count -= 1;
        if (attempt.count >= MAX_ATTEMPTS) fs.renameSync(file, path.join(d.queue, `${path.basename(n, '.json')}.hata.json`));
      }
    }
  }

  // ---------- Görevler ----------
  async function runTask(client, task) {
    const d = dirs();
    if (task.islem === 'indir') {
      if (!PLATFORMS.includes(task.platform)) throw new Error('ERR_YAYIN_BAD_TASK');
      const r = await downloadPack(client, task.platform);
      if (!r) return { ok: false, error: 'bulutta paket yok' };
      const base = path.join(d.incoming, `${task.platform}-${r.info.version}`);
      fs.writeFileSync(`${base}.fopk`, r.gz);
      writeJson(`${base}.json`, r.info);
      return { ok: true, file: `${base}.fopk`, ...r.info, sig: undefined };
    }
    if (task.islem === 'durum') return { ok: true, ...(await status(client)) };
    throw new Error('ERR_YAYIN_BAD_TASK');
  }

  async function processTasks(client) {
    const d = dirs();
    const tasks = fs.readdirSync(d.tasks).filter((n) => n.endsWith('.json') && !n.endsWith('.bitti.json') && !n.endsWith('.sonuc.json')).sort();
    for (const n of tasks) {
      const file = path.join(d.tasks, n);
      const base = path.basename(n, '.json');
      let result;
      try {
        result = await runTask(client, readJson(file) || {});
      } catch (err) {
        result = { ok: false, error: errText(err) };
      }
      writeJson(path.join(d.tasks, `${base}.sonuc.json`), { ...result, at: new Date().toISOString() });
      fs.renameSync(file, path.join(d.tasks, `${base}.bitti.json`));
      log(`görev ${n}: ${result.ok ? 'tamam' : `hata: ${result.error}`}`);
    }
  }

  async function status(client) {
    const out = { at: new Date().toISOString(), projectId: client.projectId, uid: client.uid, currentDesktopVersion: currentVersion(), publicKey: pack.PUBLIC_KEY_B64, hasPrivateKey: !!privateKey() };
    for (const p of PLATFORMS) {
      try {
        const doc = await client.getDoc(docName(client, p));
        out[p] = docSummary(doc);
        if (doc) out[p].signedWithCurrentKey = pack.verify(p, out[p].version, out[p].sha256, field(doc, 'sig'));
      } catch (err) {
        out[p] = { error: errText(err) };
      }
    }
    return out;
  }

  async function tick() {
    if (running) return running;
    running = (async () => {
      try {
        ensureDirs();
        const d = dirs();
        const hasWork = fs.readdirSync(d.queue).some((n) => n.endsWith('.json') && !n.endsWith('.deneme.json') && !n.endsWith('.hata.json'))
          || fs.readdirSync(d.tasks).some((n) => n.endsWith('.json') && !n.endsWith('.bitti.json') && !n.endsWith('.sonuc.json'));
        if (!hasWork && statusDone) return;
        const client = await getClient();
        if (!client) {
          if (hasWork) log('bekleniyor: bulut eşitlemesi bağlı değil');
          return;
        }
        if (!statusDone) {
          statusDone = true;
          try {
            writeJson(path.join(d.incoming, 'durum.json'), await status(client));
          } catch (err) {
            log(`durum alınamadı: ${errText(err)}`);
          }
        }
        if (hasWork) {
          await processTasks(client);
          await processQueue(client);
        }
      } catch (err) {
        log(`yayın kutusu hatası: ${errText(err)}`);
      }
    })().finally(() => { running = null; });
    return running;
  }

  function start() {
    stop();
    first = setTimeout(() => { tick(); }, firstDelayMs);
    timer = setInterval(() => { tick(); }, intervalMs);
  }

  function stop() {
    if (first) clearTimeout(first);
    if (timer) clearInterval(timer);
    first = null;
    timer = null;
  }

  return { start, stop, tick, status, dirs, log };
}

module.exports = { createPublisher, PART_SIZE };
