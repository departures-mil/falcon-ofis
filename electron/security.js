// Açılış PIN kodu ve pencere görünümü. Bu ayarlar yalnızca bu bilgisayara aittir:
// veritabanında değil, veri klasöründeki "cihaz-ayarlari.json" dosyasında tutulur, bu yüzden
// telefonla eşitlenmez ve yedekten geri yükleme yapılınca değişmez.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PIN_RE = /^\d{4,8}$/;
const MAX_TRIES = 5;
const LOCK_MS = 30 * 1000;

const hash = (secret, salt) => crypto.scryptSync(String(secret), Buffer.from(salt, 'hex'), 32).toString('hex');
const makeHash = (secret) => {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: hash(secret, salt) };
};
const matches = (secret, rec) => {
  if (!rec?.salt || !rec?.hash) return false;
  const a = Buffer.from(hash(secret, rec.salt), 'hex');
  const b = Buffer.from(rec.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
// Kurtarma kodu: karışmayan harf ve rakamlardan 12 karakter, XXXX-XXXX-XXXX
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newRecoveryCode() {
  const bytes = crypto.randomBytes(12);
  const s = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}
const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

class SecurityError extends Error {
  constructor(code, detail) {
    super(code);
    this.detail = detail;
  }
}

function createSecurity({ file, now = () => Date.now(), disabled = false }) {
  let unlocked = disabled;
  let tries = 0;
  let lockedUntil = 0;

  function read() {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return {};
    }
  }
  function write(data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2));
    fs.renameSync(`${file}.tmp`, file);
  }
  const update = (fn) => {
    const d = read();
    fn(d);
    write(d);
  };

  function checkPinFormat(pin) {
    if (!PIN_RE.test(String(pin ?? ''))) throw new SecurityError('ERR_PIN_FORMAT');
  }
  function throttle() {
    if (now() < lockedUntil) throw new SecurityError('ERR_PIN_WAIT', Math.ceil((lockedUntil - now()) / 1000));
  }
  function failed() {
    tries++;
    if (tries >= MAX_TRIES) {
      tries = 0;
      lockedUntil = now() + LOCK_MS;
      throw new SecurityError('ERR_PIN_WAIT', Math.ceil(LOCK_MS / 1000));
    }
    throw new SecurityError('ERR_PIN_WRONG', MAX_TRIES - tries);
  }

  return {
    isUnlocked: () => unlocked,
    // v1.45: pencere sistem tepsisine gizlenince kilitlenir (yeniden açılınca PIN sorulur)
    lock() {
      if (disabled || !read().pin) return false;
      unlocked = false;
      return true;
    },
    // v1.24: PIN'in hane sayısı bilinirse kilit ekranı doğru sayıda hane yazılınca kendiliğinden dener (Onayla gerekmez)
    status: () => { const d = read(); return { hasPin: disabled || !!d.pin, unlocked, pinLength: d.pinLength || null }; },
    windowMode: () => (read().windowMode === 'window' ? 'window' : 'fullscreen'),
    setWindowMode(mode) {
      if (!['window', 'fullscreen'].includes(mode)) throw new SecurityError('ERR_UNEXPECTED');
      update((d) => { d.windowMode = mode; });
      return mode;
    },
    // İlk açılış: PIN belirlenir, bir kez gösterilecek kurtarma kodu döner
    setup(pin) {
      if (read().pin) throw new SecurityError('ERR_PIN_EXISTS');
      checkPinFormat(pin);
      const code = newRecoveryCode();
      update((d) => { d.pin = makeHash(pin); d.pinLength = String(pin).length; d.recovery = makeHash(normCode(code)); });
      unlocked = true;
      return { recoveryCode: code };
    },
    unlock(pin) {
      if (unlocked) return true;
      throttle();
      const d = read();
      if (!matches(String(pin ?? ''), d.pin)) failed();
      tries = 0;
      unlocked = true;
      // v1.23 ve öncesinde kurulan PIN'in hane sayısı ilk doğru girişte öğrenilir
      if (d.pinLength !== String(pin).length) update((x) => { x.pinLength = String(pin).length; });
      return true;
    },
    // PIN unutulduysa: kurtarma kodu ile yeni PIN; eski kod geçersiz olur, yeni kod döner
    recover(code, newPin) {
      throttle();
      checkPinFormat(newPin);
      if (!matches(normCode(code), read().recovery)) failed();
      tries = 0;
      const next = newRecoveryCode();
      update((d) => { d.pin = makeHash(newPin); d.pinLength = String(newPin).length; d.recovery = makeHash(normCode(next)); });
      unlocked = true;
      return { recoveryCode: next };
    },
    changePin(oldPin, newPin) {
      if (!unlocked) throw new SecurityError('ERR_LOCKED');
      throttle();
      checkPinFormat(newPin);
      const d = read();
      if (d.pin && !matches(String(oldPin ?? ''), d.pin)) failed();
      tries = 0;
      update((x) => {
        x.pin = makeHash(newPin);
        x.pinLength = String(newPin).length;
        if (!x.recovery) x.recovery = makeHash(normCode(newRecoveryCode()));
      });
      return true;
    },
    newRecoveryCode(pin) {
      if (!unlocked) throw new SecurityError('ERR_LOCKED');
      throttle();
      if (!matches(String(pin ?? ''), read().pin)) failed();
      tries = 0;
      const code = newRecoveryCode();
      update((d) => { d.recovery = makeHash(normCode(code)); });
      return { recoveryCode: code };
    },
  };
}

module.exports = { createSecurity, PIN_RE };
