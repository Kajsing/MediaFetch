import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'extension', 'dist');
await mkdir(out, { recursive: true });
await build({
  entryPoints: ['background/service-worker', 'ui/app', 'content/index'].map(name => ({
    in: path.join(root, 'extension/src', `${name}.ts`), out: name.split('/').at(-1),
  })),
  outdir: out, bundle: true, format: 'iife', target: 'chrome123', sourcemap: true,
});
for (const name of ['popup.html', 'downloads.html', 'options.html', 'app.css', 'logo.svg']) {
  await copyFile(path.join(root, 'extension/assets', name), path.join(out, name));
}
await mkdir(path.join(out, 'icons'), { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await copyFile(path.join(root, `extension/assets/icons/${size}.png`), path.join(out, `icons/${size}.png`));
}
const manifest = JSON.parse(await readFile(path.join(root, 'extension/manifest.json'), 'utf8'));
await writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const id = [...createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest().subarray(0, 16)]
  .map(byte => String.fromCharCode(97 + (byte >> 4), 97 + (byte & 15))).join('');
await writeFile(path.join(out, 'extension-id.txt'), id + '\n');
console.log(`Built MediaFetch ${manifest.version}\nExtension ID: ${id}\nLoad unpacked: ${out}`);
