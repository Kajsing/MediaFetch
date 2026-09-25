import { generateKeyPairSync } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const file = new URL('../extension/manifest.json', import.meta.url);
const manifest = JSON.parse(readFileSync(file, 'utf8'));
if (manifest.key === 'GENERATED_DURING_INITIAL_SETUP') {
  // Only the public key is stored. This is an unpacked development identity, not a signing key.
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  manifest.key = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
  console.log('Created stable public extension identity.');
} else console.log('Existing extension identity preserved.');
