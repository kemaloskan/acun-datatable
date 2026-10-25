/**
 * Streaming readers for back ends (`@acunsoft/datatable-export/stream`): the
 * rows of a CSV or xlsx file in chunks, so memory follows the chunk, not the
 * file. They read exactly what `parseCsv` and `readXlsx` read, with the same
 * limits; those two stay the readers for the browser.
 */
import { ImportError, type ParseCsvOptions } from './csv';
import type { SheetCell } from './sheet';
import { headerTexts, rowCells, sharedString, workbookParts, type ReadXlsxOptions } from './xlsx';
import { openZip, type StoredEntry } from './zip';

/** A file being read: its headers at once, its data rows as they are read. */
export interface SheetStream {
  readonly headers: readonly string[];
  /**
   * The data rows in chunks of `chunkSize` (the last one may be smaller),
   * each row as wide as the headers. Read it once; stopping early (`break`)
   * releases the file.
   */
  readonly chunks: AsyncIterable<readonly (readonly SheetCell[])[]>;
}

export interface StreamCsvOptions extends ParseCsvOptions {
  /** A `TextDecoder` label. Default `utf-8` (a byte order mark is removed). */
  readonly encoding?: string;
  /** Rows per chunk. Default 1,000. */
  readonly chunkSize?: number;
}

export interface StreamXlsxOptions extends ReadXlsxOptions {
  /** Rows per chunk. Default 1,000. */
  readonly chunkSize?: number;
}

type Bytes = Uint8Array | ArrayBuffer | Iterable<Uint8Array> | AsyncIterable<Uint8Array>;
const PIECE = 1 << 20;

async function* byteChunks(input: Bytes): AsyncGenerator<Uint8Array> {
  if (input instanceof ArrayBuffer) input = new Uint8Array(input);
  if (input instanceof Uint8Array) {
    for (let at = 0; at < input.length; at += PIECE) yield input.subarray(at, at + PIECE);
  } else {
    yield* input;
  }
}

async function* textChunks(input: Bytes | AsyncIterable<Uint8Array>, encoding = 'utf-8'): AsyncGenerator<string> {
  const decoder = new TextDecoder(encoding);
  for await (const bytes of byteChunks(input)) {
    const text = decoder.decode(bytes, { stream: true });
    if (text !== '') yield text;
  }
  const rest = decoder.decode();
  if (rest !== '') yield rest;
}

/** The delimiter of the header line (as `parseCsv` detects it), or `undefined` until the line is complete. */
function detect(text: string, final: boolean): ',' | ';' | '\t' | undefined {
  let quoted = false;
  let complete = final;
  const counts = { ',': 0, ';': 0, '\t': 0 };
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === '\n' || char === '\r')) { complete = true; break; }
    else if (!quoted && char in counts) counts[char as keyof typeof counts] += 1;
  }
  if (!complete) return undefined;
  const best = (Object.entries(counts) as [',' | ';' | '\t', number][]).sort((a, b) => b[1] - a[1])[0]!;
  return best[1] === 0 ? ',' : best[0];
}

/**
 * The CSV state machine of `parseCsv`, fed piece by piece: `feed` adds the
 * finished records to `out` and gives back the characters it must see again
 * with the next piece (a quote or `\r` at the very end).
 */
function csvParser(delimiter: string, maxColumns: number, maxRows: number) {
  const DELIMITER = delimiter.charCodeAt(0);
  let record: string[] = [];
  let value = '';
  let quoted = false;
  let started = false; // the current field began with a quote
  let line = 1;
  let recordLine = 1;
  let records = 0;
  const endField = (): void => {
    record.push(value);
    if (record.length > maxColumns) throw new ImportError(`more than ${maxColumns} columns`, recordLine);
    value = '';
    started = false;
  };
  const endRecord = (out: string[][]): void => {
    endField();
    if (!(record.length === 1 && record[0] === '')) {
      out.push(record);
      records += 1;
      if (records > maxRows + 1) throw new ImportError(`more than ${maxRows} rows`, recordLine);
    }
    record = [];
    recordLine = line;
  };
  const feed = (text: string, final: boolean, out: string[][]): string => {
    const n = text.length;
    let i = 0;
    while (i < n) {
      const char = text.charCodeAt(i);
      if (quoted) {
        let end = text.indexOf('"', i);
        if (end < 0) end = text.charCodeAt(n - 1) === 13 && !final ? n - 1 : n;
        for (let k = i; k < end; k += 1) {
          const c = text.charCodeAt(k);
          if (c === 10 || (c === 13 && text.charCodeAt(k + 1) !== 10)) line += 1;
        }
        value += text.slice(i, end);
        i = end;
        if (i >= n) break;
        if (text.charCodeAt(i) === 13) return text.slice(i); // a \r at the end: is \n next?
        if (i + 1 >= n && !final) return text.slice(i); // a quote at the end: is it doubled?
        if (text.charCodeAt(i + 1) === 34) { value += '"'; i += 2; } else { quoted = false; i += 1; }
      } else if (char === 34 && value === '' && !started) {
        quoted = true;
        started = true;
        i += 1;
      } else if (char === DELIMITER) {
        endField();
        i += 1;
      } else if (char === 13 || char === 10) {
        if (char === 13) {
          if (i + 1 >= n && !final) return text.slice(i);
          if (text.charCodeAt(i + 1) === 10) i += 1;
        }
        i += 1;
        line += 1;
        endRecord(out);
      } else {
        let end = i + 1;
        while (end < n) {
          const c = text.charCodeAt(end);
          if (c === DELIMITER || c === 13 || c === 10 || c === 34) break;
          end += 1;
        }
        value += text.slice(i, end);
        i = end;
      }
    }
    if (final) {
      if (quoted) throw new ImportError('a quoted field is not closed', recordLine);
      if (value !== '' || record.length > 0) endRecord(out);
    }
    return '';
  };
  return feed;
}

/** Regroup batches of rows into chunks of `size`, each row as wide as the headers. */
async function* rechunk(
  batches: AsyncIterator<SheetCell[][]>, first: SheetCell[][], width: number, size: number,
): AsyncGenerator<SheetCell[][]> {
  let chunk: SheetCell[][] = [];
  let batch: SheetCell[][] | undefined = first;
  try {
    while (batch) {
      for (const row of batch) {
        chunk.push(Array.from({ length: width }, (_, index) => row[index] ?? null));
        if (chunk.length === size) {
          yield chunk;
          chunk = [];
        }
      }
      const step = await batches.next();
      batch = step.done ? undefined : step.value;
    }
    if (chunk.length > 0) yield chunk;
  } finally {
    await batches.return?.();
  }
}

/** Take the header row off the first non-empty batch. */
async function sheetStream(
  batches: AsyncIterator<SheetCell[][]>, headersOf: (row: SheetCell[]) => string[], size: number,
): Promise<SheetStream> {
  let first: SheetCell[][] = [];
  for (;;) {
    const step = await batches.next();
    if (step.done) break;
    if (step.value.length > 0) { first = step.value; break; }
  }
  const header = first.shift();
  const headers = Object.freeze(header ? headersOf(header) : []);
  let used = false;
  return Object.freeze({
    headers,
    chunks: {
      [Symbol.asyncIterator]: () => {
        if (used) throw new Error('the rows of a SheetStream can be read once');
        used = true;
        return rechunk(batches, first, headers.length, size);
      },
    },
  });
}

/**
 * Read CSV bytes as `parseCsv` reads text (delimiter detection, quotes, line
 * breaks in fields, a byte order mark, fully empty lines skipped), decoding
 * and parsing piece by piece. Values stay text.
 */
export async function streamCsv(input: Bytes, options: StreamCsvOptions = {}): Promise<SheetStream> {
  const maxRows = options.maxRows ?? 10_000;
  const maxColumns = options.maxColumns ?? 1_000;
  const size = Math.max(1, options.chunkSize ?? 1_000);
  async function* batches(): AsyncGenerator<SheetCell[][]> {
    let feed: ReturnType<typeof csvParser> | undefined;
    let head = '';
    let carry = '';
    let started = false;
    const source = textChunks(input, options.encoding);
    for (let step = await source.next(); ; step = await source.next()) {
      const final = step.done === true;
      let text = final ? '' : step.value;
      if (!started) {
        if (!final && text === '') continue;
        started = true;
        if (text.startsWith('\uFEFF')) text = text.slice(1);
      }
      if (!feed) {
        head += text;
        const delimiter = options.delimiter ?? detect(head, final);
        if (delimiter === undefined) continue;
        feed = csvParser(delimiter, maxColumns, maxRows);
        text = head;
        head = '';
      }
      const out: string[][] = [];
      carry = feed(carry + text, final, out);
      yield out;
      if (final) return;
    }
  }
  return sheetStream(batches(), header => header.map(cell => String(cell).trim()), size);
}

/**
 * The inner XML of each `<name>` element of streamed XML text, in order
 * (`undefined` for an empty `<name/>`), matched as `readXlsx` matches them.
 * With a `container`, only the elements inside its first occurrence count;
 * one that opens and never closes makes the file damaged.
 */
async function* elements(source: AsyncIterator<string>, name: string, container?: string): AsyncGenerator<string | undefined> {
  const begin = container ? new RegExp(`<(?:\\w+:)?${container}\\b[^>]*?(\\/?)>`, 'g') : undefined;
  const next = new RegExp(`<(?:\\w+:)?${name}\\b${container ? `|<\\/(?:\\w+:)?${container}>` : ''}`, 'g');
  const close = new RegExp(`<\\/(?:\\w+:)?(${name}${container ? `|${container}` : ''})>`, 'g');
  let buffer = '';
  let inside = !container;
  let scanned = 0; // where the search for the end of an incomplete element goes on
  let final = false;
  for (;;) {
    if (!inside && begin) {
      begin.lastIndex = 0;
      const found = begin.exec(buffer);
      if (found?.[1] === '/') return; // <sheetData/>: no rows
      if (found) {
        inside = true;
        buffer = buffer.slice(begin.lastIndex);
      } else {
        // Keep only a tag that may still be arriving.
        const tag = buffer.lastIndexOf('<');
        buffer = tag < 0 ? '' : buffer.slice(tag);
      }
    }
    while (inside) {
      next.lastIndex = 0;
      const found = next.exec(buffer);
      if (!found) {
        const tag = buffer.lastIndexOf('<');
        buffer = tag < 0 ? '' : buffer.slice(tag);
        scanned = 0;
        break;
      }
      if (found[0][1] === '/') return; // the container closes
      if (found.index > 0) { buffer = buffer.slice(found.index); scanned = 0; }
      const tagEnd = buffer.indexOf('>');
      if (tagEnd < 0) break;
      if (buffer[tagEnd - 1] === '/') {
        yield undefined;
        buffer = buffer.slice(tagEnd + 1);
        scanned = 0;
        continue;
      }
      close.lastIndex = Math.max(tagEnd + 1, scanned);
      const end = close.exec(buffer);
      if (!end) {
        if (final) { buffer = buffer.slice(1); scanned = 0; continue; } // never closed: not an element
        scanned = Math.max(0, buffer.length - 128); // its end can only be in what comes next
        break;
      }
      if (end[1] === name) yield buffer.slice(tagEnd + 1, end.index);
      // else the container closes inside it: as in `readXlsx`, not an element; the container ends next.
      buffer = buffer.slice(end[1] === name ? close.lastIndex : 1);
      scanned = 0;
    }
    if (final) {
      if (inside && container) throw new ImportError('the file is damaged (the worksheet is not complete)');
      return;
    }
    const step = await source.next();
    if (step.done) final = true;
    else buffer += step.value;
  }
}

/** Inflate in pieces, counting what comes out against the limit. */
async function* inflating(data: Uint8Array, limit: number): AsyncGenerator<Uint8Array> {
  if (typeof DecompressionStream !== 'function') throw new ImportError('this environment cannot read compressed xlsx files');
  let at = 0;
  const source = new ReadableStream<BufferSource>({
    pull(controller) {
      if (at >= data.length) controller.close();
      else controller.enqueue(data.subarray(at, (at += 65_536)) as Uint8Array<ArrayBuffer>);
    },
  });
  const reader = source.pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  let total = 0;
  try {
    for (;;) {
      let step: ReadableStreamReadResult<Uint8Array>;
      try {
        step = await reader.read();
      } catch {
        throw new ImportError('the file is damaged (an archive entry cannot be inflated)');
      }
      if (step.done) return;
      total += step.value.length;
      // The declared size can lie (zip bombs): count what actually comes out.
      if (total > limit) throw new ImportError(`an archive entry is larger than ${limit} bytes`);
      yield step.value;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/** An archive entry in pieces: a stored one without copying, a deflated one as it inflates. */
function entryPieces(entry: StoredEntry | undefined): AsyncIterable<Uint8Array> | undefined {
  if (!entry) return undefined;
  if (entry.method === 8) return inflating(entry.data, entry.maxBytes);
  if (entry.data.length > entry.maxBytes) throw new ImportError(`an archive entry is larger than ${entry.maxBytes} bytes`);
  return byteChunks(entry.data);
}


/** Batches of the non-empty rows of a worksheet, as `readXlsx` reads them. */
async function* xlsxBatches(bytes: Uint8Array, options: StreamXlsxOptions): AsyncGenerator<SheetCell[][]> {
  const maxRows = options.maxRows ?? 10_000;
  const maxColumns = options.maxColumns ?? 1_000;
  const zip = openZip(bytes, options);
  const parts = await workbookParts(zip, options.sheet);
  const shared: string[] = [];
  const strings = entryPieces(zip.stored(parts.sharedPath));
  if (strings) {
    for await (const inner of elements(textChunks(strings), 'si')) shared.push(sharedString(inner ?? ''));
  }
  const sheet = entryPieces(zip.stored(parts.sheetPath));
  if (!sheet) throw new ImportError('the worksheet is missing from the file');
  let batch: SheetCell[][] = [];
  let count = 0;
  for await (const inner of elements(textChunks(sheet), 'row', 'sheetData')) {
    const cells = rowCells(inner ?? '', shared, parts, maxColumns);
    if (cells.every(cell => cell === null || cell === '')) continue;
    batch.push(cells);
    count += 1;
    if (count > maxRows + 1) throw new ImportError(`more than ${maxRows} rows`);
    if (batch.length === 1_000) {
      yield batch;
      batch = [];
    }
  }
  yield batch;
}

/**
 * Read one worksheet of an `.xlsx` file as `readXlsx` reads it, inflating
 * and scanning the worksheet piece by piece. Shared strings are kept (cells
 * point into them); the archive limits are counted while inflating.
 */
export async function streamXlsx(input: Uint8Array | ArrayBuffer, options: StreamXlsxOptions = {}): Promise<SheetStream> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  return sheetStream(xlsxBatches(bytes, options), headerTexts, Math.max(1, options.chunkSize ?? 1_000));
}
