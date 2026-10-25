// Minimal typings for the Node built-ins the tests use (avoids depending on @types/node,
// which is only an optional dependency of vitest and not installed everywhere).
declare module 'node:fs' {
  export function readdirSync(path: string | URL): string[];
  export function readFileSync(path: string | URL, encoding: 'utf8'): string;
  export function readFileSync(path: string | URL): Uint8Array;
}
