import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = process.cwd(), out = resolve(root, 'dist');
await rm(out, { recursive: true, force: true }); await mkdir(out, { recursive: true });
for (const item of ['index.html','admin.html','config.js','manifest.webmanifest','service-worker.js','css','js','img','ads.txt']) { try { await cp(resolve(root,item), resolve(out,item), { recursive:true }); } catch(e) { if(e.code !== 'ENOENT') throw e; } }
console.log('Build estático completado: dist/');
