import { ImportError } from './csv';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  readonly name: string;
  readonly data: Uint8Array;
}

/**
 * Write a ZIP archive with stored (uncompressed) entries. Enough for xlsx:
 * spreadsheet programs read stored entries, and writing stays synchronous and
 * dependency-free. Timestamps are fixed (1980-01-01) so output is reproducible.
 */
export function writeZip(entries: readonly ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;
    if (size > 0xfffffffe || offset > 0xfffffffe) throw new RangeError('archive too large (ZIP64 is not supported)');
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, 0, true); // time
    local.setUint16(12, 0x21, true); // date: 1980-01-01
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    locals.push(new Uint8Array(local.buffer), name, entry.data);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, 0, true);
    central.setUint16(14, 0x21, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, size, true);
    central.setUint32(24, size, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);
    centrals.push(new Uint8Array(central.buffer), name);
    offset += 30 + name.length + size;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export interface ZipLimits {
  /** Largest uncompressed entry. Default 50 MB. */
  readonly maxEntryBytes?: number;
  /** Largest archive entry count. Default 2,000. */
  readonly maxEntries?: number;
}

interface CentralEntry {
  readonly method: number;
  readonly flags: number;
  readonly compressedSize: number;
  readonly size: number;
  readonly offset: number;
}

/** A read-only view of a ZIP archive; entries are inflated on demand. */
export interface ZipReader {
  has(name: string): boolean;
  /** The entry's bytes, or `undefined` when it does not exist. */
  read(name: string): Promise<Uint8Array | undefined>;
}

async function inflate(data: Uint8Array, limit: number): Promise<Uint8Array> {
  if (typeof DecompressionStream !== 'function') throw new ImportError('this environment cannot read compressed xlsx files');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      // The declared size can lie (zip bombs): count what actually comes out.
      if (total > limit) throw new ImportError(`an archive entry is larger than ${limit} bytes`);
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof ImportError) throw error;
    throw new ImportError('the file is damaged (an archive entry cannot be inflated)');
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/** Open a ZIP archive (no ZIP64, no encryption) with size limits. */
export function openZip(bytes: Uint8Array, limits: ZipLimits = {}): ZipReader {
  const maxEntryBytes = limits.maxEntryBytes ?? 50 * 1024 * 1024;
  const maxEntries = limits.maxEntries ?? 2_000;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new ImportError('not an xlsx file (no ZIP directory found)');
  const count = view.getUint16(end + 10, true);
  const directorySize = view.getUint32(end + 12, true);
  const directoryOffset = view.getUint32(end + 16, true);
  if (count === 0xffff || directoryOffset === 0xffffffff) throw new ImportError('ZIP64 archives are not supported');
  if (count > maxEntries) throw new ImportError(`the archive has more than ${maxEntries} entries`);
  if (directoryOffset + directorySize > end) throw new ImportError('the file is damaged (bad ZIP directory)');
  const decoder = new TextDecoder();
  const entries = new Map<string, CentralEntry>();
  let at = directoryOffset;
  for (let i = 0; i < count; i += 1) {
    if (at + 46 > end || view.getUint32(at, true) !== 0x02014b50) throw new ImportError('the file is damaged (bad ZIP entry)');
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    entries.set(name, {
      flags: view.getUint16(at + 8, true),
      method: view.getUint16(at + 10, true),
      compressedSize: view.getUint32(at + 20, true),
      size: view.getUint32(at + 24, true),
      offset: view.getUint32(at + 42, true),
    });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return {
    has: name => entries.has(name),
    read: async name => {
      const entry = entries.get(name);
      if (!entry) return undefined;
      if (entry.flags & 1) throw new ImportError('encrypted files are not supported');
      if (entry.size > maxEntryBytes) throw new ImportError(`an archive entry is larger than ${maxEntryBytes} bytes`);
      const header = entry.offset;
      if (header + 30 > bytes.length || view.getUint32(header, true) !== 0x04034b50) {
        throw new ImportError('the file is damaged (bad local header)');
      }
      const start = header + 30 + view.getUint16(header + 26, true) + view.getUint16(header + 28, true);
      if (start + entry.compressedSize > bytes.length) throw new ImportError('the file is damaged (entry outside the file)');
      const data = bytes.subarray(start, start + entry.compressedSize);
      if (entry.method === 0) return data;
      if (entry.method === 8) return inflate(data, maxEntryBytes);
      throw new ImportError(`unsupported ZIP compression method ${entry.method}`);
    },
  };
}
