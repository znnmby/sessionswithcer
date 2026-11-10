import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.(?:ts|mjs|js|json)$/i.test(specifier)) {
    try { return await next(specifier + '.ts', context); } catch {}
  }
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url.endsWith('.ts')) return { format: 'module', shortCircuit: true,
    source: stripTypeScriptTypes(await readFile(new URL(url), 'utf8')) };
  return next(url, context);
}
