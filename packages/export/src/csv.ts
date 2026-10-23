import { isDecimal } from '@acunsoft/datatable-core';
import { checkSheet, type Sheet, type SheetCell } from './sheet';

export interface ToCsvOptions {
  /** Default `','`. Turkish Excel opens `';'`-separated files directly. */
  readonly delimiter?: ',' | ';' | '\t';
  /** Byte order mark so Excel reads UTF-8 (ş, ğ, İ). Default `true`. */
  readonly bom?: boolean;
  /** Default `'\r\n'` (RFC 4180). */
  readonly newline?: '\r\n' | '\n';
  /**
   * Prefix text that starts with `=`, `+`, `-`, `@`, tab or carriage return
   * with `'`, so a spreadsheet shows it instead of running it as a formula
   * (CSV injection). Default `true`; turn off only for machine consumers.
   */
  readonly guardFormulas?: boolean;
}

const RISKY = /^[=+\-@\t\r]/;
const pad = (value: number): string => String(value).padStart(2, '0');

/** Machine-readable text for a cell: `.` decimals, ISO-like local dates. */
export function cellText(cell: SheetCell, type?: string): string {
  if (cell === null) return '';
  if (typeof cell === 'string') return cell;
  if (typeof cell === 'number') return String(cell);
  if (typeof cell === 'boolean') return cell ? 'true' : 'false';
  if (isDecimal(cell)) return cell.text;
  const day = `${String(cell.getFullYear()).padStart(4, '0')}-${pad(cell.getMonth() + 1)}-${pad(cell.getDate())}`;
  if (type === 'date') return day;
  return `${day} ${pad(cell.getHours())}:${pad(cell.getMinutes())}:${pad(cell.getSeconds())}`;
}

/**
 * Write a sheet as CSV (RFC 4180): fields with the delimiter, quotes or line
 * breaks are quoted, quotes are doubled. Numbers use `.`, dates are local
 * `YYYY-MM-DD` (and `HH:mm:ss` for instants), so the file reads back exactly.
 */
export function toCsv(sheet: Sheet, options: ToCsvOptions = {}): string {
  checkSheet(sheet);
  const delimiter = options.delimiter ?? ',';
  if (![',', ';', '\t'].includes(delimiter)) throw new TypeError('delimiter must be ",", ";" or a tab');
  const newline = options.newline ?? '\r\n';
  const guard = options.guardFormulas ?? true;
  const field = (text: string, isText: boolean): string => {
    const safe = guard && isText && RISKY.test(text) ? `'${text}` : text;
    return /[",;\t\r\n]/.test(safe) || safe.includes(delimiter) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [sheet.headers.map(header => field(header, true)).join(delimiter)];
  for (const row of sheet.rows) {
    lines.push(row.map((cell, index) => field(cellText(cell, sheet.types?.[index]), typeof cell === 'string')).join(delimiter));
  }
  return (options.bom ?? true ? '\uFEFF' : '') + lines.join(newline) + newline;
}

export interface ParseCsvOptions {
  /** Default: detected from the header line (`,`, `;` or tab). */
  readonly delimiter?: ',' | ';' | '\t';
  /** Data rows to read at most (the header is not counted). Default 10,000. */
  readonly maxRows?: number;
  /** Default 1,000. */
  readonly maxColumns?: number;
}

/** Thrown for files that cannot be read: broken quotes, too many rows or columns. */
export class ImportError extends Error {
  constructor(message: string, readonly line?: number) {
    super(line === undefined ? message : `${message} (line ${line})`);
    this.name = 'ImportError';
  }
}

function detect(text: string): ',' | ';' | '\t' {
  let quoted = false;
  const counts = { ',': 0, ';': 0, '\t': 0 };
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === '\n' || char === '\r')) break;
    else if (!quoted && char in counts) counts[char as keyof typeof counts] += 1;
  }
  const best = (Object.entries(counts) as [',' | ';' | '\t', number][]).sort((a, b) => b[1] - a[1])[0]!;
  return best[1] === 0 ? ',' : best[0];
}

/**
 * Read CSV text into a sheet of strings (first line = headers). Handles a
 * byte order mark, quoted fields with line breaks and doubled quotes, and
 * `\r\n`, `\n` or `\r` line ends. Fully empty lines are skipped. Values stay
 * text: `importRows` reads them as the columns' types.
 */
export function parseCsv(text: string, options: ParseCsvOptions = {}): Sheet {
  if (typeof text !== 'string') throw new TypeError('CSV input must be a string');
  const maxRows = options.maxRows ?? 10_000;
  const maxColumns = options.maxColumns ?? 1_000;
  const source = text.startsWith('\uFEFF') ? text.slice(1) : text;
  const delimiter = options.delimiter ?? detect(source);
  const records: string[][] = [];
  let record: string[] = [];
  let value = '';
  let quoted = false;
  let started = false; // the current field began with a quote
  let line = 1;
  let recordLine = 1;
  const endField = (): void => {
    record.push(value);
    if (record.length > maxColumns) throw new ImportError(`more than ${maxColumns} columns`, recordLine);
    value = '';
    started = false;
  };
  const endRecord = (): void => {
    endField();
    if (!(record.length === 1 && record[0] === '')) {
      records.push(record);
      if (records.length > maxRows + 1) throw new ImportError(`more than ${maxRows} rows`, recordLine);
    }
    record = [];
    recordLine = line;
  };
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]!;
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') { value += '"'; i += 1; } else quoted = false;
      } else {
        if (char === '\n' || (char === '\r' && source[i + 1] !== '\n')) line += 1;
        value += char;
      }
    } else if (char === '"' && value === '' && !started) {
      quoted = true;
      started = true;
    } else if (char === delimiter) {
      endField();
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      line += 1;
      endRecord();
    } else {
      value += char;
    }
  }
  if (quoted) throw new ImportError('a quoted field is not closed', recordLine);
  if (value !== '' || record.length > 0) endRecord();
  const [headers = [], ...rows] = records;
  const width = headers.length;
  return Object.freeze({
    headers: Object.freeze(headers.map(header => header.trim())),
    rows: Object.freeze(rows.map(row => Object.freeze(
      Array.from({ length: Math.max(width, row.length) }, (_, index) => row[index] ?? null).slice(0, width),
    ))),
  });
}
