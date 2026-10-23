import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isDecimal, normalizeValue } from '@acunsoft/datatable-core';
import { ImportError, readXlsx, toXlsx, type Sheet } from '../src/index';
import { openZip, writeZip } from '../src/zip';

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const decimal = (text: string) => normalizeValue(text, 'decimal') as Sheet['rows'][number][number];
const unzipText = async (bytes: Uint8Array, name: string): Promise<string> =>
  new TextDecoder().decode(await openZip(bytes).read(name));

/** Build an xlsx from parts, deflating them like Excel does. */
async function workbook(parts: Record<string, string>): Promise<Uint8Array> {
  const entries = await Promise.all(Object.entries(parts).map(async ([name, xml]) => ({ name, data: new TextEncoder().encode(xml) })));
  return writeZip(entries);
}
const MAIN = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
const REL = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const basic = (sheetXml: string, extra: Record<string, string> = {}) => workbook({
  'xl/workbook.xml': `<workbook ${MAIN} ${REL}><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>',
  'xl/worksheets/sheet1.xml': `<worksheet ${MAIN}><sheetData>${sheetXml}</sheetData></worksheet>`,
  ...extra,
});

describe('toXlsx → readXlsx', () => {
  it('round-trips text, numbers, decimals, dates, date-times, booleans and empty cells', async () => {
    const sheet: Sheet = {
      headers: ['Müşteri', 'Tutar', 'Tarih', 'Zaman', 'Aktif', 'Not', 'Adet'],
      types: ['text', 'decimal', 'date', 'datetime', 'boolean', undefined, 'number'],
      rows: [
        ['Ayşe <&> "Yılmaz"', decimal('1250.50'), new Date(2026, 9, 23), new Date(2026, 9, 23, 14, 5, 9), true, '=SUM(A1)', 3],
        ['İğdır\u0001 bell', decimal('-0.125'), null, new Date(2000, 1, 29, 23, 59, 59), false, null, -2.5],
      ],
    };
    const bytes = toXlsx(sheet, { sheetName: 'Siparişler: 2026/10' });
    expect([...bytes.subarray(0, 2)]).toEqual([0x50, 0x4b]); // a ZIP file
    const back = await readXlsx(bytes);
    expect(back.headers).toEqual(sheet.headers);
    const [first, second] = back.rows;
    expect(first!.slice(0, 2)).toEqual(['Ayşe <&> "Yılmaz"', 1250.5]);
    expect(first![2]).toEqual(new Date(2026, 9, 23));
    expect(first![3]).toEqual(new Date(2026, 9, 23, 14, 5, 9));
    expect(first!.slice(4)).toEqual([true, '=SUM(A1)', 3]); // text stays text, never a formula
    expect(second).toEqual(['İğdır bell', -0.125, null, new Date(2000, 1, 29, 23, 59, 59), false, null, -2.5]);
  });

  it('writes a bold frozen header, column widths, scale formats and a clean sheet name', async () => {
    const bytes = toXlsx({ headers: ['A', 'B'], rows: [[decimal('1.50'), decimal('2.125')]] }, { sheetName: 'a[b]:c' });
    const sheetXml = await unzipText(bytes, 'xl/worksheets/sheet1.xml');
    expect(sheetXml).toContain('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>');
    expect(sheetXml).toContain('<c r="A1" t="inlineStr" s="1">');
    expect(sheetXml).toContain('<col min="1" max="1" width="8" customWidth="1"/>');
    expect(sheetXml).toContain('<c r="A2" s="4"><v>1.50</v></c><c r="B2" s="5"><v>2.125</v></c>');
    const styles = await unzipText(bytes, 'xl/styles.xml');
    expect(styles).toContain('<numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="#,##0.000"/>');
    expect(await unzipText(bytes, 'xl/workbook.xml')).toContain('<sheet name="a b  c" sheetId="1"');
  });

  it('writes dates before March 1900 as text and refuses oversized sheets', async () => {
    const back = await readXlsx(toXlsx({ headers: ['d'], types: ['date'], rows: [[new Date(1899, 0, 1)]] }));
    expect(back.rows[0]).toEqual(['1899-01-01']);
    expect(() => toXlsx({ headers: Array.from({ length: 16_385 }, (_, i) => `c${i}`), rows: [] })).toThrow('at most 16384 columns');
  });
});

describe('readXlsx with files from other programs', () => {
  it('reads an openpyxl workbook: compressed parts, number and date formats, empty rows', async () => {
    const sheet = await readXlsx(fixture('openpyxl.xlsx'));
    expect(sheet.headers).toEqual(['Müşteri', 'Tutar', 'Tarih', 'Zaman', 'Aktif', 'Not']);
    expect(sheet.rows).toEqual([
      ['Ayşe Yılmaz', 1250.5, new Date(2026, 9, 23), new Date(2026, 9, 23, 14, 5), true, 'VIP <müşteri> & "özel"'],
      ['Iğdır Ticaret', 5000, new Date(2026, 0, 2), new Date(2026, 0, 2, 9), false, null],
      ['İSTANBUL Şube', 99.9, new Date(1999, 11, 31), new Date(2000, 1, 29, 23, 59, 59), true, 'satır1\nsatır2'],
    ]);
  });

  it('chooses a sheet by name or index and reads the 1904 date system', async () => {
    expect((await readXlsx(fixture('openpyxl.xlsx'), { sheet: 'İkinci' })).rows).toEqual([['A-1']]);
    expect((await readXlsx(fixture('openpyxl.xlsx'), { sheet: 1 })).headers).toEqual(['Kod']);
    await expect(readXlsx(fixture('openpyxl.xlsx'), { sheet: 'Yok' })).rejects.toThrow('worksheet "Yok" not found');
    expect((await readXlsx(fixture('mac1904.xlsx'))).rows).toEqual([[new Date(2026, 9, 23)]]);
  });

  it('reads Excel-style shared strings, rich text, phonetic hints, errors, formulas and escapes', async () => {
    const bytes = await basic(
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>' +
      '<row r="3"><c r="A3" t="s"><v>4</v></c><c r="B3" t="e"><v>#DIV/0!</v></c><c r="C3" t="str"><f>A3&amp;"!"</f><v>Ayşe!</v></c>' +
      '<c r="D3" t="s"><v>5</v></c></row><row r="4"><c r="C4"><f>1+1</f><v>2</v></c></row>',
      { 'xl/sharedStrings.xml': `<sst ${MAIN} count="6" uniqueCount="6"><si><t>Müşteri</t></si><si><r><rPr><b/></rPr><t>Tu</t></r><r><t xml:space="preserve">tar</t></r></si>` +
        '<si><t>Hesap</t><rPh sb="0" eb="1"><t>ケイ</t></rPh></si><si><t>Not</t></si><si><t>Ayşe &amp; Co</t></si><si><t>_x0041__x000D_</t></si></sst>' },
    );
    const sheet = await readXlsx(bytes);
    expect(sheet.headers).toEqual(['Müşteri', 'Tutar', 'Hesap', 'Not']);
    expect(sheet.rows).toEqual([['Ayşe & Co', null, 'Ayşe!', 'A\r'], [null, null, 2, null]]);
  });

  it('accepts prefixed XML, cells without references and self-closing parts', async () => {
    const bytes = await workbook({
      'xl/workbook.xml': `<x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ${REL}><x:sheets><x:sheet name="S" sheetId="1" r:id="rId1"/></x:sheets></x:workbook>`,
      'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="worksheet" Target="/xl/worksheets/data.xml"/></Relationships>',
      'xl/worksheets/data.xml': '<x:worksheet xmlns:x="m"><x:sheetData><x:row><x:c t="inlineStr"><x:is><x:t>a</x:t></x:is></x:c><x:c t="inlineStr"><x:is><x:t>b</x:t></x:is></x:c></x:row>' +
        '<x:row><x:c><x:v>1</x:v></x:c><x:c/></x:row><x:row/></x:sheetData></x:worksheet>',
    });
    expect(await readXlsx(bytes)).toEqual({ headers: ['a', 'b'], rows: [[1, null]] });
  });
});

describe('readXlsx safety', () => {
  it('rejects files that are not xlsx', async () => {
    await expect(readXlsx(new TextEncoder().encode('Müşteri,Tutar'))).rejects.toThrow(ImportError);
    await expect(readXlsx(writeZip([{ name: 'a.txt', data: new Uint8Array([1]) }]))).rejects.toThrow('no workbook');
    const truncated = toXlsx({ headers: ['a'], rows: [] }).subarray(0, 200);
    await expect(readXlsx(truncated)).rejects.toThrow(ImportError);
  });

  it('limits rows, columns and inflated sizes (zip bombs)', async () => {
    const many = toXlsx({ headers: ['a'], rows: Array.from({ length: 5 }, (_, i) => [i]) });
    await expect(readXlsx(many, { maxRows: 4 })).rejects.toThrow('more than 4 rows');
    expect((await readXlsx(many, { maxRows: 5 })).rows).toHaveLength(5);
    await expect(readXlsx(toXlsx({ headers: ['a', 'b', 'c'], rows: [] }), { maxColumns: 2 })).rejects.toThrow('more than 2 columns');
    await expect(readXlsx(many, { maxEntryBytes: 100 })).rejects.toThrow('larger than 100 bytes');

    // A deflated entry whose header claims 10 bytes but inflates to 100 kB.
    const big = new TextEncoder().encode(`<workbook>${' '.repeat(100_000)}</workbook>`);
    const deflated = new Uint8Array(await new Response(new Blob([big]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    const zip = writeZip([{ name: 'xl/workbook.xml', data: deflated }]);
    const view = new DataView(zip.buffer);
    view.setUint16(8, 8, true); // local header: deflate
    const central = zip.length - 22 - 46 - 'xl/workbook.xml'.length;
    view.setUint16(central + 10, 8, true); // central directory: deflate
    view.setUint32(central + 24, 10, true); // declared size: a lie
    await expect(readXlsx(zip, { maxEntryBytes: 50_000 })).rejects.toThrow('larger than 50000 bytes');
  });

  it('refuses encrypted entries', async () => {
    const zip = toXlsx({ headers: ['a'], rows: [] });
    const view = new DataView(zip.buffer);
    let at = zip.length - 22;
    const count = view.getUint16(at + 10, true);
    at = view.getUint32(at + 16, true);
    for (let i = 0; i < count; i += 1) {
      view.setUint16(at + 8, view.getUint16(at + 8, true) | 1, true);
      at += 46 + view.getUint16(at + 28, true);
    }
    await expect(readXlsx(zip)).rejects.toThrow('encrypted files are not supported');
  });

  it('keeps decimals readable as numbers', async () => {
    const back = await readXlsx(toXlsx({ headers: ['n'], rows: [[decimal('0.10')]] }));
    expect(back.rows[0]![0]).toBe(0.1);
    expect(isDecimal(back.rows[0]![0])).toBe(false);
  });
});
