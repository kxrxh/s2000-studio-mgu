import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Run with the patched idv7lol checkout as the working directory.
const compiler = pathToFileURL(resolve('packages/theme-compiler/src/font/bake.ts'));
const { bakeS2000Lcd } = await import(compiler.href);
const font = new URL('./s2000-lcd.ttf', import.meta.url);
const { pixels, metrics } = bakeS2000Lcd(readFileSync(font));
const out = resolve('apps/studio/public/fonts');
mkdirSync(out, { recursive: true });
copyFileSync(font, resolve(out, 's2000-lcd.ttf'));
writeFileSync(resolve(out, 's2000-lcd.r8'), pixels);
writeFileSync(resolve(out, 's2000-lcd.json'), JSON.stringify(metrics));
