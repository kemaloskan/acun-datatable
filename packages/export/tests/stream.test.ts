import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCsv, readXlsx, toXlsx, type Sheet } from '../src/index';
import { streamCsv, streamXlsx, type SheetStream } from '../src/stream';
import { writeZip } from '../src/zip';

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const encode = (text: string) => new TextEncoder().encode(text);

/** Read a whole stream back into a sheet, checking the chunk sizes on the way. */
async function collect(stream: SheetStream | Promise<SheetStream>, size = 1_000): Promise<Sheet> {
  const sheet = await stream;
  const rows: (readonly unknown[])[] = [];
  let short = false;
  for await (const chunk of sheet.chunks) {
    expect(short).toBe(false); // only the last chunk may be smaller
    expect(chunk.length).toBeGreaterThan(0);
    expect(chunk.length).toBeLessThanOrEqual(size);
    short = chunk.length < size;
    rows.push(...chunk);
  }
  return { headers: [...sheet.headers], rows: rows as Sheet['rows'] };
}
/** The bytes in pieces of `size`, so every boundary (quotes, \r\n, UTF-8 sequences) is crossed. */
const pieces = (bytes: Uint8Array, size: number): Uint8Array[] =>
  Array.from({ length: Math.ceil(bytes.length / size) }, (_, index) => bytes.subarray(index * size, (index + 1) * size));
const outcome = async <T>(run: () => T | Promise<T>): Promise<T | string> => {
  try { return await run(); } catch (error) { return `error: ${(error as Error).message}`; }
};
/** What a back end read before: the bytes decoded (a byte order mark removed), then parseCsv. */
const decoded = (text: string) => new TextDecoder().decode(encode(text));
const plain = (sheet: Sheet) => ({ headers: [...sheet.headers], rows: sheet.rows.map(row => [...row]) });

describe('streamCsv reads what parseCsv reads', () => {
  const samples = [
    '', 'a', 'a,b\n1,2', 'a;b\r\n1;2\r\n\r\n3;4', 'a\tb\n1\t2\n', 'a,b\r1,2\r', '"x;y",z\n1,2',
    'a,b,c\n1\n1,2,3,4\n,,x', '\uFEFFMüşteri;Tutar\nAyşe;1.250,50', '\uFEFF\uFEFFa\n1',
    'a,b\n"line\r\nbreak","say ""hi"""\n"ab"cd,e"f', 'a\n""\n"" \n" "', '\n\na,b\n1,2', 'a,b\n"open,1',
    'h\n"a\rb"\r\n"c\r\r"\r', 'a,"b\n', 'İ,ı,ğ\nş,ç,ö',
  ];
  it('for edge cases, in any piece size', async () => {
    for (const text of samples) {
      const expected = await outcome(() => plain(parseCsv(decoded(text), { maxRows: 100 })));
      for (const size of [1, 2, 3, 7, 1 << 20]) {
        const got = await outcome(async () => plain(await collect(streamCsv(pieces(encode(text), size), { maxRows: 100, chunkSize: 2 }), 2)));
        expect(got, `${JSON.stringify(text)} in pieces of ${size}`).toEqual(expected);
      }
    }
  });

  it('for random files', async () => {
    const alphabet = ['a', 'b', ',', ';', '\t', '"', '"', '\r', '\n', ' ', 'ş', '€'];
    let seed = 42;
    const random = (n: number) => { seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648; return Math.floor(seed / 65_536) % n; };
    for (let run = 0; run < 2_000; run += 1) {
      const text = Array.from({ length: random(40) }, () => alphabet[random(alphabet.length)]).join('');
      const expected = await outcome(() => plain(parseCsv(decoded(text), { maxRows: 8, maxColumns: 12 })));
      const got = await outcome(async () => plain(await collect(streamCsv(pieces(encode(text), 1 + random(5)), { maxRows: 8, maxColumns: 12, chunkSize: 3 }), 3)));
      expect(got, JSON.stringify(text)).toEqual(expected);
    }
  });

  it('decodes another encoding, takes a given delimiter, and refuses limits like parseCsv', async () => {
    const windows1254 = new Uint8Array([0x4d, 0xfc, 0xfe, 0x74, 0x65, 0x72, 0x69, 0x0a, 0xdd, 0x7a, 0x6d, 0x69, 0x72]); // Müşteri\nİzmir
    expect(await collect(streamCsv(windows1254, { encoding: 'windows-1254' }))).toEqual({ headers: ['Müşteri'], rows: [['İzmir']] });
    expect(await collect(streamCsv(encode('a;b,c\n1;2,3'), { delimiter: ',' }))).toEqual({ headers: ['a;b', 'c'], rows: [['1;2', '3']] });
    await expect(collect(streamCsv(encode('a\n1\n2\n3'), { maxRows: 2 }))).rejects.toThrow('more than 2 rows');
    await expect(streamCsv(encode('a,b,c'), { maxColumns: 2 })).rejects.toThrow('more than 2 columns');
    await expect(collect(streamCsv(encode('a,b\n"open,1')))).rejects.toThrow('a quoted field is not closed (line 2)');
  });

  it('gives many rows in chunks, and stops early when asked', async () => {
    const big = encode(`id,name\n${Array.from({ length: 100_000 }, (_, i) => `${i},n${i}`).join('\n')}`);
    const stream = await streamCsv(big, { maxRows: 100_000, chunkSize: 1_000 });
    let rows = 0;
    for await (const chunk of stream.chunks) { rows += chunk.length; if (rows === 5_000) break; }
    expect(rows).toBe(5_000);
    expect(() => stream.chunks[Symbol.asyncIterator]()).toThrow('read once');
    const whole = await collect(streamCsv(big, { maxRows: 100_000, chunkSize: 1_000 }));
    expect(whole).toEqual(plain(parseCsv(new TextDecoder().decode(big), { maxRows: 100_000 })));
  });
});

describe('streamXlsx reads what readXlsx reads', () => {
  const MAIN = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const REL = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const workbook = (sheetXml: string, shared?: string) => writeZip([
    { name: 'xl/workbook.xml', data: encode(`<workbook ${MAIN} ${REL}><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`) },
    { name: 'xl/_rels/workbook.xml.rels', data: encode('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>') },
    { name: 'xl/worksheets/sheet1.xml', data: encode(sheetXml) },
    ...(shared === undefined ? [] : [{ name: 'xl/sharedStrings.xml', data: encode(shared) }]),
  ]);
  const same = async (bytes: Uint8Array, options: Record<string, unknown> = {}) => {
    const expected = await outcome(async () => plain(await readXlsx(bytes, options)));
    const got = await outcome(async () => plain(await collect(streamXlsx(bytes, { ...options, chunkSize: 2 }), 2)));
    expect(got).toEqual(expected);
    return got;
  };

  it('for real workbooks, sheets by name and index, and the 1904 date system', async () => {
    expect(await same(fixture('openpyxl.xlsx'))).toMatchObject({ headers: ['Müşteri', 'Tutar', 'Tarih', 'Zaman', 'Aktif', 'Not'] });
    await same(fixture('openpyxl.xlsx'), { sheet: 'İkinci' });
    await same(fixture('openpyxl.xlsx'), { sheet: 1 });
    expect(await same(fixture('openpyxl.xlsx'), { sheet: 'Yok' })).toBe('error: worksheet "Yok" not found');
    await same(fixture('mac1904.xlsx'));
  });

  it('for what toXlsx writes, with every type, and the limits', async () => {
    const rows = Array.from({ length: 2_345 }, (_, i) => [`Ayşe <${i}> & "co"`, i * 1.5, new Date(2026, i % 12, 1 + (i % 28)), i % 2 === 0, i % 7 === 0 ? null : 'x']);
    const bytes = toXlsx({ headers: ['Ad', 'Tutar', 'Tarih', 'Aktif', 'Not'], rows, types: [undefined, 'number', 'date', 'boolean', undefined] });
    expect((await same(bytes, { maxRows: 5_000 }) as Sheet).rows).toHaveLength(2_345);
    expect(await same(bytes, { maxRows: 2_000 })).toBe('error: more than 2000 rows');
    expect(await same(bytes, { maxColumns: 3 })).toBe('error: more than 3 columns');
    expect(await same(bytes, { maxEntryBytes: 1_000 })).toMatch(/larger than 1000 bytes/);
  });

  it('for shared strings, prefixes, self-closing and odd parts', async () => {
    const shared = `<sst ${MAIN}><si><t>Müşteri</t></si><si><r><t>Tu</t></r><r><t xml:space="preserve">tar</t></r></si>` +
      '<si><t>Hesap</t><rPh sb="0" eb="1"><t>ケイ</t></rPh></si><si/><si><t>Ayşe &amp; Co</t></si><si><t>_x0041__x000D_</t></si></sst>';
    await same(workbook(`<worksheet ${MAIN}><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>` +
      '<row r="3"><c r="A3" t="s"><v>4</v></c><c r="B3" t="e"><v>#DIV/0!</v></c><c r="C3" t="s"><v>5</v></c></row><row/><row r="5"><c r="A5" t="s"><v>3</v></c></row>' +
      '<row r="6"><c r="B6"><f>1+1</f><v>2</v></c></row></sheetData></worksheet>', shared));
    await same(workbook('<x:worksheet xmlns:x="m"><x:sheetData><x:row><x:c t="inlineStr"><x:is><x:t>a</x:t></x:is></x:c><x:c t="inlineStr"><x:is><x:t>b</x:t></x:is></x:c></x:row>' +
      '<x:row><x:c><x:v>1</x:v></x:c><x:c/></x:row><x:row/></x:sheetData></x:worksheet>'));
    await same(workbook(`<worksheet ${MAIN}><sheetData/></worksheet>`));
    await same(workbook(`<worksheet ${MAIN}><cols/></worksheet>`));
    await same(workbook(`<worksheet ${MAIN}><sheetData><rowBreaks/><row><c t="inlineStr"><is><t>h</t></is></c></row>${' '.repeat(200_000)}<row><c><v>1</v></c></row></sheetData></worksheet>`));
    expect(await outcome(() => collect(streamXlsx(workbook(`<worksheet ${MAIN}><sheetData><row><c><v>1</v></c></row>`))))).toMatch(/damaged/);
  });

  it('counts the inflated size of a zip bomb while inflating, whatever the archive claims', async () => {
    const bomb = new Uint8Array(readFileSync(new URL('../../server/tests/fixtures/zip-bomb.xlsx', import.meta.url)));
    const before = process.memoryUsage().rss;
    await expect(collect(streamXlsx(bomb))).rejects.toThrow(/larger than 52428800 bytes/);
    expect(process.memoryUsage().rss - before).toBeLessThan(100 * 1024 * 1024);
  });
});
