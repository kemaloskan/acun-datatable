import { isDecimal } from '@acunsoft/datatable-core';
import { ImportError, cellText } from './csv';
import { checkSheet, type Sheet, type SheetCell } from './sheet';
import { openZip, writeZip, type ZipLimits } from './zip';

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAX_ROWS = 1_048_576;
const MAX_COLUMNS = 16_384;
const MAX_TEXT = 32_767;
const DAY_MS = 86_400_000;
const EPOCH_1900 = Date.UTC(1899, 11, 30);
const EPOCH_1904 = Date.UTC(1904, 0, 1);

// ---------------------------------------------------------------------------
// Writing

/** Remove characters XML 1.0 cannot carry, then escape markup. */
function xmlText(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

/** Excel's serial day number for a local date and time (1900 date system). */
function serial(date: Date, dayOnly: boolean): number | undefined {
  const local = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(),
    dayOnly ? 0 : date.getHours(), dayOnly ? 0 : date.getMinutes(), dayOnly ? 0 : date.getSeconds(), dayOnly ? 0 : date.getMilliseconds());
  const value = (local - EPOCH_1900) / DAY_MS;
  return value >= 61 ? value : undefined; // before 1900-03-01 Excel's dates are not reliable: write text
}

function sheetName(name: string | undefined): string {
  const clean = (name ?? 'Sheet1').replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31);
  return clean === '' || clean.toLowerCase() === 'history' ? 'Sheet1' : clean;
}

export interface ToXlsxOptions {
  /** Worksheet name (max 31 characters; `[ ] : * ? / \` are replaced). Default `Sheet1`. */
  readonly sheetName?: string;
}

/**
 * Write a sheet as an Excel workbook (`.xlsx`, Office Open XML) without
 * dependencies. Numbers, decimals (with their scale), dates, date-times and
 * booleans become real spreadsheet values; text is stored as text and is
 * never a formula. The header row is bold and frozen; widths follow content.
 * Text longer than Excel's 32,767-character cell limit is cut.
 */
export function toXlsx(sheet: Sheet, options: ToXlsxOptions = {}): Uint8Array {
  checkSheet(sheet);
  if (sheet.rows.length + 1 > MAX_ROWS) throw new RangeError(`xlsx holds at most ${MAX_ROWS - 1} data rows`);
  if (sheet.headers.length > MAX_COLUMNS) throw new RangeError(`xlsx holds at most ${MAX_COLUMNS} columns`);

  // Styles: 0 default, 1 header (bold), 2 date, 3 date-time, 4+ decimals by scale.
  const scales = new Map<number, number>();
  for (const row of sheet.rows) {
    for (const cell of row) {
      if (isDecimal(cell) && cell.scale > 0 && !scales.has(cell.scale)) scales.set(cell.scale, 4 + scales.size);
    }
  }
  const widths = sheet.headers.map(header => header.length);
  const cellXml = (cell: SheetCell, ref: string, column: number, header: boolean): string => {
    const note = (text: string): void => { widths[column] = Math.max(widths[column] ?? 0, Math.min(text.length, 60)); };
    if (cell === null) return '';
    if (typeof cell === 'number') {
      note(String(cell));
      return `<c r="${ref}"><v>${cell}</v></c>`;
    }
    if (typeof cell === 'boolean') return `<c r="${ref}" t="b"><v>${cell ? 1 : 0}</v></c>`;
    if (isDecimal(cell)) {
      note(cell.text);
      const style = cell.scale > 0 ? ` s="${scales.get(cell.scale)}"` : '';
      return `<c r="${ref}"${style}><v>${cell.text}</v></c>`;
    }
    if (cell instanceof Date) {
      const dayOnly = sheet.types?.[column] === 'date';
      const value = serial(cell, dayOnly);
      if (value !== undefined) {
        note(dayOnly ? '0000-00-00' : '0000-00-00 00:00');
        return `<c r="${ref}" s="${dayOnly ? 2 : 3}"><v>${value}</v></c>`;
      }
      cell = cellText(cell, sheet.types?.[column]);
    }
    const text = cell.length > MAX_TEXT ? cell.slice(0, MAX_TEXT) : cell;
    note(text);
    return `<c r="${ref}" t="inlineStr"${header ? ' s="1"' : ''}><is><t xml:space="preserve">${xmlText(text)}</t></is></c>`;
  };

  const rowsXml: string[] = [];
  const rowXml = (cells: readonly SheetCell[], index: number, header: boolean): string =>
    `<row r="${index + 1}">${cells.map((cell, column) => cellXml(cell, `${columnName(column)}${index + 1}`, column, header)).join('')}</row>`;
  rowsXml.push(rowXml(sheet.headers, 0, true));
  sheet.rows.forEach((row, index) => rowsXml.push(rowXml(row, index + 1, false)));
  const cols = widths.length === 0 ? '' : `<cols>${widths.map((width, index) =>
    `<col min="${index + 1}" max="${index + 1}" width="${Math.max(8, width + 2)}" customWidth="1"/>`).join('')}</cols>`;
  const worksheet = `${XML_HEAD}<worksheet xmlns="${MAIN}" xmlns:r="${REL}">` +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${rowsXml.join('')}</sheetData></worksheet>`;

  const numFmts = [...scales.keys()].map((scale, index) =>
    `<numFmt numFmtId="${164 + index}" formatCode="#,##0.${'0'.repeat(scale)}"/>`).join('');
  const decimalXfs = [...scales.keys()].map((_, index) =>
    `<xf numFmtId="${164 + index}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`).join('');
  const styles = `${XML_HEAD}<styleSheet xmlns="${MAIN}">` +
    (scales.size > 0 ? `<numFmts count="${scales.size}">${numFmts}</numFmts>` : '') +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    `<cellXfs count="${4 + scales.size}">` +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="22" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    `${decimalXfs}</cellXfs>` +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  const encoder = new TextEncoder();
  const file = (name: string, text: string) => ({ name, data: encoder.encode(text) });
  return writeZip([
    file('[Content_Types].xml', `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>'),
    file('_rels/.rels', `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    file('xl/workbook.xml', `${XML_HEAD}<workbook xmlns="${MAIN}" xmlns:r="${REL}">` +
      `<sheets><sheet name="${xmlText(sheetName(options.sheetName))}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    file('xl/_rels/workbook.xml.rels', `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/></Relationships>`),
    file('xl/styles.xml', styles),
    file('xl/worksheets/sheet1.xml', worksheet),
  ]);
}

// ---------------------------------------------------------------------------
// Reading

const ENTITY: Readonly<Record<string, string>> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

/** Decode the predefined XML entities, character references and OOXML `_xHHHH_` escapes. */
function decode(text: string): string {
  return text
    .replace(/&(?:#x([0-9a-fA-F]+)|#(\d+)|(lt|gt|amp|quot|apos));/g, (match, hex: string, dec: string, name: string) => {
      if (name) return ENTITY[name]!;
      const code = hex ? parseInt(hex, 16) : Number(dec);
      return code <= 0x10ffff ? String.fromCodePoint(code) : match;
    })
    .replace(/_x([0-9a-fA-F]{4})_/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

function attributes(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of source.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    out[match[1]!] = decode(match[2] ?? match[3] ?? '');
  }
  return out;
}

/** The text runs of a shared or inline string, without phonetic hints. */
function runs(xml: string): string {
  const visible = xml.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, '');
  let text = '';
  for (const match of visible.matchAll(/<(?:\w+:)?t\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?t>)/g)) text += decode(match[1] ?? '');
  return text;
}

const BUILTIN_DATES = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

function isDateFormat(code: string): boolean {
  const bare = code.replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/\[(?!h\]|m\]|s\])[^\]]*\]/gi, '');
  return /[dmyhs]/i.test(bare) && !/^general$/i.test(bare.trim());
}

function columnIndex(ref: string): number | undefined {
  const letters = /^([A-Z]+)\d*$/i.exec(ref)?.[1];
  if (!letters) return undefined;
  let index = 0;
  for (const char of letters.toUpperCase()) index = index * 26 + (char.charCodeAt(0) - 64);
  return index - 1;
}

function fromSerial(value: number, date1904: boolean): Date {
  const ms = Math.round(value * 86_400) * 1000 + (date1904 ? EPOCH_1904 : EPOCH_1900);
  const utc = new Date(ms);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), utc.getUTCHours(), utc.getUTCMinutes(), utc.getUTCSeconds());
}

export interface ReadXlsxOptions extends ZipLimits {
  /** Worksheet name or zero-based index. Default: the first sheet. */
  readonly sheet?: string | number;
  /** Data rows to read at most (the header is not counted). Default 10,000. */
  readonly maxRows?: number;
  /** Default 1,000. */
  readonly maxColumns?: number;
}

/**
 * Read one worksheet of an `.xlsx` file into a sheet: the first non-empty
 * row is the header, empty rows are skipped. Cached values are read; formulas
 * are never evaluated. Numbers formatted as dates become `Date`s (local
 * time). Archive sizes, rows and columns are limited (zip-bomb safe).
 */
export async function readXlsx(input: Uint8Array | ArrayBuffer, options: ReadXlsxOptions = {}): Promise<Sheet> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const maxRows = options.maxRows ?? 10_000;
  const maxColumns = options.maxColumns ?? 1_000;
  const zip = openZip(bytes, options);
  const decoder = new TextDecoder();
  const text = async (name: string): Promise<string | undefined> => {
    const data = await zip.read(name);
    return data === undefined ? undefined : decoder.decode(data);
  };
  const workbook = await text('xl/workbook.xml');
  if (workbook === undefined) throw new ImportError('not an xlsx file (no workbook)');
  const date1904 = /<(?:\w+:)?workbookPr\b[^>]*\bdate1904\s*=\s*["'](?:1|true)["']/.test(workbook);
  const sheets = [...workbook.matchAll(/<(?:\w+:)?sheet\b([^>]*?)\/?>/g)].map(match => {
    const attrs = attributes(match[1]!);
    const relation = Object.entries(attrs).find(([key]) => /(^|:)id$/.test(key) && key !== 'sheetId')?.[1];
    return { name: attrs['name'] ?? '', relation };
  });
  const wanted = options.sheet ?? 0;
  const chosen = typeof wanted === 'number' ? sheets[wanted] : sheets.find(sheet => sheet.name === wanted);
  if (!chosen) throw new ImportError(`worksheet ${JSON.stringify(wanted)} not found`);

  const relations = new Map<string, { target: string; type: string }>();
  for (const match of ((await text('xl/_rels/workbook.xml.rels')) ?? '').matchAll(/<(?:\w+:)?Relationship\b([^>]*?)\/?>/g)) {
    const attrs = attributes(match[1]!);
    if (attrs['Id'] && attrs['Target']) relations.set(attrs['Id'], { target: attrs['Target'], type: attrs['Type'] ?? '' });
  }
  const resolve = (target: string): string => {
    const parts = (target.startsWith('/') ? target.slice(1) : `xl/${target}`).split('/');
    const out: string[] = [];
    for (const part of parts) {
      if (part === '..') out.pop();
      else if (part !== '.' && part !== '') out.push(part);
    }
    return out.join('/');
  };
  const sheetPath = chosen.relation && relations.get(chosen.relation)
    ? resolve(relations.get(chosen.relation)!.target)
    : 'xl/worksheets/sheet1.xml';
  const byType = (suffix: string, fallback: string): string => {
    const found = [...relations.values()].find(relation => relation.type.endsWith(suffix));
    return found ? resolve(found.target) : fallback;
  };

  const shared: string[] = [];
  const sharedXml = await text(byType('/sharedStrings', 'xl/sharedStrings.xml'));
  for (const match of (sharedXml ?? '').matchAll(/<(?:\w+:)?si\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?si>)/g)) {
    shared.push(runs(match[1] ?? ''));
  }

  const dateStyles = new Set<number>();
  const stylesXml = (await text(byType('/styles', 'xl/styles.xml'))) ?? '';
  const custom = new Map<number, string>();
  for (const match of stylesXml.matchAll(/<(?:\w+:)?numFmt\b([^>]*?)\/?>/g)) {
    const attrs = attributes(match[1]!);
    custom.set(Number(attrs['numFmtId']), attrs['formatCode'] ?? '');
  }
  const xfs = /<(?:\w+:)?cellXfs\b[^>]*>([\s\S]*?)<\/(?:\w+:)?cellXfs>/.exec(stylesXml)?.[1] ?? '';
  [...xfs.matchAll(/<(?:\w+:)?xf\b([^>]*?)\/?>/g)].forEach((match, index) => {
    const id = Number(attributes(match[1]!)['numFmtId'] ?? 0);
    if (BUILTIN_DATES.has(id) || (custom.has(id) && isDateFormat(custom.get(id)!))) dateStyles.add(index);
  });

  const worksheet = await text(sheetPath);
  if (worksheet === undefined) throw new ImportError('the worksheet is missing from the file');
  const data = /<(?:\w+:)?sheetData\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?sheetData>)/.exec(worksheet)?.[1] ?? '';
  const table: SheetCell[][] = [];
  for (const rowMatch of data.matchAll(/<(?:\w+:)?row\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
    const cells: SheetCell[] = [];
    let next = 0;
    for (const cellMatch of (rowMatch[1] ?? '').matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const attrs = attributes(cellMatch[1]!);
      const index = attrs['r'] !== undefined ? columnIndex(attrs['r']) ?? next : next;
      next = index + 1;
      if (index >= maxColumns) throw new ImportError(`more than ${maxColumns} columns`);
      const inner = cellMatch[2] ?? '';
      const raw = /<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/.exec(inner)?.[1];
      const value = raw === undefined ? undefined : decode(raw);
      let cell: SheetCell = null;
      switch (attrs['t']) {
        case 's': cell = value === undefined ? null : shared[Number(value)] ?? null; break;
        case 'inlineStr': cell = runs(/<(?:\w+:)?is\b[^>]*>([\s\S]*?)<\/(?:\w+:)?is>/.exec(inner)?.[1] ?? ''); break;
        case 'str': cell = value ?? null; break;
        case 'b': cell = value === undefined ? null : value === '1' || value === 'true'; break;
        case 'e': cell = null; break; // #N/A, #DIV/0!: no value
        case 'd': cell = value === undefined || Number.isNaN(Date.parse(value)) ? null : new Date(value); break;
        default: {
          if (value === undefined || value.trim() === '') break;
          const number = Number(value);
          if (!Number.isFinite(number)) { cell = value; break; }
          cell = dateStyles.has(Number(attrs['s'] ?? 0)) ? fromSerial(number, date1904) : number;
        }
      }
      while (cells.length < index) cells.push(null);
      cells[index] = cell;
    }
    if (cells.every(cell => cell === null || cell === '')) continue;
    table.push(cells);
    if (table.length > maxRows + 1) throw new ImportError(`more than ${maxRows} rows`);
  }

  const [headerRow = [], ...rows] = table;
  const headers = headerRow.map(cell => (cell === null ? '' : cellText(cell).trim()));
  while (headers.length > 0 && headers[headers.length - 1] === '') headers.pop();
  const width = headers.length;
  return Object.freeze({
    headers: Object.freeze(headers),
    rows: Object.freeze(rows.map(row => Object.freeze(Array.from({ length: width }, (_, index) => row[index] ?? null)))),
  });
}
