// Minimal typings for the Node built-ins used by hygiene.test.ts (avoids @types/node).
declare module 'node:fs' {
  export function readdirSync(path: string): string[];
  export function readFileSync(path: string, encoding: 'utf8'): string;
}
declare module 'node:url' {
  export function fileURLToPath(url: URL | string): string;
}
