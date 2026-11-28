#!/usr/bin/env python3
# v1.78.0: kişi ulaşım bilgileri — her program için ayrı numara + @kullanıcı adı (people.contacts JSON'unda `_d`).
#   python3 araclar/patch-srv-178.py <electron/services.js | telefon index-*.js>
# cleanContacts eskiden yalnız açık/kapalı bayraklarını tutuyordu; şimdi `_d: { whatsapp: { no, user }, … }` de temizlenip saklanır.
import sys

p = sys.argv[1]
s = open(p, encoding='utf8').read()
if 'falcon-178-reach' in s:
    print('atlandı (zaten yamalı):', p); sys.exit(0)
old = """  function cleanContacts(c) {
    const out = {};
    for (const k of CONTACT_KEYS) if (c && c[k]) out[k] = 1;
    return JSON.stringify(out);
  }"""
new = """  function cleanContacts(c) {
    const out = {};
    for (const k of CONTACT_KEYS) if (c && c[k]) out[k] = 1;
    // falcon-178-reach: programa özel numara ve @kullanıcı adı (boşsa kişinin genel telefonu kullanılır)
    const d = c && c._d && typeof c._d === 'object' ? c._d : null;
    if (d) {
      const od = {};
      for (const k of CONTACT_KEYS) {
        const x = d[k]; if (!x || typeof x !== 'object') continue;
        const no = String(x.no == null ? '' : x.no).trim().slice(0, 40);
        let user = String(x.user == null ? '' : x.user).trim().replace(/\\s+/g, '').slice(0, 64);
        if (user && user[0] !== '@') user = '@' + user;
        if (user === '@') user = '';
        if (no || user) { od[k] = {}; if (no) od[k].no = no; if (user) od[k].user = user; }
      }
      if (Object.keys(od).length) out._d = od;
    }
    return JSON.stringify(out);
  }"""
if old not in s:
    sys.exit('cleanContacts bulunamadı: ' + p)
s = s.replace(old, new)
open(p, 'w', encoding='utf8').write(s)
print('tamam', p)
