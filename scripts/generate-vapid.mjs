// Génère une paire de clés VAPID pour Web Push, en base64url.
// Utilisation : node scripts/generate-vapid.mjs
//
// Récupère les 2 valeurs et ajoute-les dans :
//   apps/client/.env.local :        NEXT_PUBLIC_VAPID_PUBLIC_KEY
//   apps/driver-portal/.env.local : NEXT_PUBLIC_VAPID_PUBLIC_KEY
//   supabase edge secrets :          VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_CONTACT
// Et sur Vercel : Settings → Environment Variables.

import { generateKeyPairSync, createHash } from 'node:crypto';

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

const { publicKey, privateKey } = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
});

// Public key : 65 bytes uncompressed EC point (04 || X || Y) en DER → export raw
const pubDer = publicKey.export({ type: 'spki', format: 'der' });
// Les 65 derniers octets du SPKI sont l'octet 04 + coordonnées X + Y
const pubRaw = pubDer.subarray(pubDer.length - 65);

// Private key : 32 bytes raw
const privDer = privateKey.export({ type: 'pkcs8', format: 'der' });
// Chercher l'OCTET STRING de 32 bytes dans le DER PKCS8
// Format habituel : ... 04 20 [32 bytes] ...
let offset = 0;
for (let i = 0; i < privDer.length - 34; i++) {
  if (privDer[i] === 0x04 && privDer[i + 1] === 0x20) {
    offset = i + 2;
    break;
  }
}
const privRaw = privDer.subarray(offset, offset + 32);

console.log('---- COPY BELOW ----');
console.log('VAPID_PUBLIC_KEY  =', b64url(pubRaw));
console.log('VAPID_PRIVATE_KEY =', b64url(privRaw));
console.log('VAPID_CONTACT     = mailto:terencebeniraphael@gmail.com');
console.log('--------------------');
console.log('SHA-256 pub  fingerprint:', createHash('sha256').update(pubRaw).digest('hex'));
