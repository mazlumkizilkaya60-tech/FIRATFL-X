import { mkdir, cp, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('..', import.meta.url);
const dist = new URL('../dist', import.meta.url);

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(new URL('../public', import.meta.url), dist, { recursive: true });
await cp(new URL('../src', import.meta.url), new URL('../dist/src', import.meta.url), { recursive: true });

const indexPath = new URL('../dist/index.html', import.meta.url);
const indexHtml = await readFile(indexPath, 'utf8');
await writeFile(indexPath, indexHtml.replaceAll('__BUILD_TIME__', new Date().toISOString()));

console.log('Build completed:', join(dist.pathname));
