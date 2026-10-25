// Builds the zip-bomb.xlsx test fixtures (run after npm run build): a real workbook whose sheet is 200 MB of spaces,
// deflated to a few hundred KB, with a central directory that claims 1 KB.
import { writeFileSync } from 'node:fs';
import { crc32, deflateRawSync } from 'node:zlib';
const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { toXlsx } = await import(`${root}/packages/export/dist/index.js`);
const source = toXlsx({ headers: ['Customer'], rows: [['A']] });
const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
// Read the stored entries of the small workbook.
const entries = [];
for (let offset = 0; view.getUint32(offset, true) === 0x04034b50;) {
  const size = view.getUint32(offset + 18, true);
  const nameLength = view.getUint16(offset + 26, true);
  const extra = view.getUint16(offset + 28, true);
  const name = new TextDecoder().decode(source.subarray(offset + 30, offset + 30 + nameLength));
  entries.push({ name, data: source.subarray(offset + 30 + nameLength + extra, offset + 30 + nameLength + extra + size) });
  offset += 30 + nameLength + extra + size;
}
const sheet = entries.find(entry => entry.name.startsWith('xl/worksheets/'));
const filler = Buffer.alloc(200 * 1024 * 1024, 0x20);
const xml = Buffer.concat([Buffer.from('<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'), filler, Buffer.from('</sheetData></worksheet>')]);
const parts = [];
const central = [];
let offset = 0;
for (const entry of entries) {
  const bomb = entry === sheet;
  const data = bomb ? deflateRawSync(xml, { level: 9 }) : Buffer.from(entry.data);
  const crc = crc32(bomb ? xml : data);
  const claimed = bomb ? 1024 : data.length; // the lie: a small uncompressed size
  const name = Buffer.from(entry.name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(bomb ? 8 : 0, 8);
  local.writeUInt32LE(crc >>> 0, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(claimed, 22);
  local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
  const record = Buffer.alloc(46);
  record.writeUInt32LE(0x02014b50, 0); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6); record.writeUInt16LE(0, 8); record.writeUInt16LE(bomb ? 8 : 0, 10);
  record.writeUInt32LE(crc >>> 0, 16); record.writeUInt32LE(data.length, 20); record.writeUInt32LE(claimed, 24);
  record.writeUInt16LE(name.length, 28); record.writeUInt32LE(offset, 42);
  parts.push(local, name, data);
  central.push(record, name);
  offset += 30 + name.length + data.length;
}
const directory = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
const file = Buffer.concat([...parts, directory, end]);
for (const target of ['packages/server/tests/fixtures/zip-bomb.xlsx', 'packages/adapter-laravel/tests/Fixtures/zip-bomb.xlsx']) writeFileSync(new URL(`../${target}`, import.meta.url), file);
console.log(`${file.length} bytes, sheet inflates to ${xml.length} bytes, claims 1024`);
