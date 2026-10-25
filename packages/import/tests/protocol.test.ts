import { describe, expect, it } from 'vitest';
import {
  checkImportStart, ImportProtocolError, readImportCapabilities, readImportProblem, readImportState, safeImportUrl,
} from '../src/index';

const mapping = {
  protocol: 'acun-import/1', id: 'imp_1', status: 'mapping',
  headers: ['E-posta', 'Ad', ''],
  columns: [{ id: 'email', title: 'E-mail', required: true }, { id: 'name' }],
  mapping: ['email', 'name', null],
  preview: [{ line: 2, cells: ['a@b.c', 'Ayşe', null] }],
  modes: ['insert', 'upsert'], mode: 'upsert',
  extraField: 'ignored',
};

describe('readImportState', () => {
  it('reads an upload answer and fills the defaults', () => {
    const state = readImportState(mapping, { requireProtocol: true });
    expect(state).toMatchObject({ id: 'imp_1', status: 'mapping', mapping: ['email', 'name', null], inserted: 0, failed: 0, errors: [], cancellable: true, errorReport: null });
    expect(state).not.toHaveProperty('extraField'); // unknown fields are left out
  });

  it.each([
    [{ ...mapping, protocol: 'acun-import/2' }, 'protocol: must be "acun-import/1"'],
    [{ ...mapping, protocol: undefined }, 'protocol: must be "acun-import/1"'],
    [{ ...mapping, id: '../etc/passwd' }, 'id: must be 1–200'],
    [{ ...mapping, status: 'waiting' }, 'status: must be one of'],
    [{ ...mapping, headers: undefined }, 'headers: is required while the status is "mapping"'],
    [{ ...mapping, mapping: ['email'] }, 'mapping: must have one entry per header'],
    [{ ...mapping, mapping: ['email', 'city', null] }, 'mapping[1]: names no column ("city")'],
    [{ ...mapping, preview: [{ line: 2, cells: ['a'] }] }, 'preview[0].cells: must have one cell per header'],
    [{ ...mapping, mode: 'update' }, 'mode: must be one of "modes"'],
    [{ ...mapping, columns: [{ id: '' }] }, 'columns[0].id: must not be empty'],
  ])('refuses an answer that breaks the protocol (%#)', (answer, message) => {
    expect(() => readImportState(answer, { requireProtocol: true })).toThrow(ImportProtocolError);
    expect(() => readImportState(answer, { requireProtocol: true })).toThrow(message);
  });

  it('reads progress and results, with counts that must be whole numbers', () => {
    const state = readImportState({
      id: 'imp_1', status: 'running', processed: 10, total: null, inserted: 7, updated: 2, failed: 1,
      errors: [{ line: 14, column: 'email', value: 'x@', code: 'invalid', message: 'Not an e-mail.' }],
      errorsTruncated: true, retryAfter: 500, cancellable: false,
    });
    expect(state).toMatchObject({ total: null, processed: 10, errorsTruncated: true, retryAfter: 500, cancellable: false });
    expect(() => readImportState({ id: 'a', status: 'done', inserted: -1 })).toThrow('inserted: must be a whole number of at least 0');
    expect(() => readImportState({ id: 'a', status: 'done', inserted: 1.5 })).toThrow('inserted');
    expect(() => readImportState({ id: 'a', status: 'done', errors: [{ line: 2 }] })).toThrow('errors[0].message: must be a string');
    expect(() => readImportState({ id: 'a', status: 'done', expiresAt: 'tomorrow' })).toThrow('expiresAt');
  });
});

describe('readImportCapabilities and readImportProblem', () => {
  it('reads hints and refuses wrong ones', () => {
    expect(readImportCapabilities({ protocol: 'acun-import/1', accept: ['.csv'], maxBytes: 10, modes: ['insert'] }))
      .toEqual({ protocol: 'acun-import/1', accept: ['.csv'], maxBytes: 10, modes: ['insert'] });
    expect(() => readImportCapabilities({ protocol: 'acun-import/1', maxBytes: 0 })).toThrow('maxBytes');
    expect(() => readImportCapabilities({ protocol: 'acun-import/1', modes: ['merge'] })).toThrow('modes[0]');
  });

  it('always gives a text to show', () => {
    expect(readImportProblem(422, { message: 'Bad file.', errors: { file: ['Too big.', 7], mapping: 'No e-mail.' } }))
      .toEqual({ status: 422, message: 'Bad file.', errors: { file: ['Too big.'], mapping: ['No e-mail.'] } });
    expect(readImportProblem(422, { errors: { file: 'Too big.' } }).message).toBe('Too big.');
    expect(readImportProblem(500, '<html>oops</html>').message).toBe('The request failed (HTTP 500).');
  });
});

describe('safeImportUrl', () => {
  it('resolves paths against the import url and refuses other schemes', () => {
    expect(safeImportUrl('imp_1/errors.csv', 'https://app.test/api/import')).toBe('https://app.test/api/import/imp_1/errors.csv');
    expect(safeImportUrl('/files/template.xlsx', 'https://app.test/api/import')).toBe('https://app.test/files/template.xlsx');
    expect(safeImportUrl('https://cdn.test/t.xlsx', '/api/import')).toBe('https://cdn.test/t.xlsx');
    expect(safeImportUrl('javascript:alert(1)', '/api/import')).toBeNull();
    expect(safeImportUrl('data:text/html,x', '/api/import')).toBeNull();
  });
});

describe('checkImportStart (the back end check)', () => {
  const against = { headers: ['E-posta', 'Ad', 'Not'], columns: [{ id: 'email', title: 'E-mail', required: true }, { id: 'name' }], modes: ['insert', 'upsert'] as const };
  it.each([
    [{ mapping: ['email', 'name', null], mode: 'upsert' }, {}],
    [{ mapping: ['email', 'name'], mode: 'upsert' }, { mapping: 'The mapping needs one entry per file column (3).' }],
    [{ mapping: ['email', 'city', null], mode: 'upsert' }, { mapping: 'Unknown column: city.' }],
    [{ mapping: ['email', 'email', null], mode: 'upsert' }, { mapping: 'A column is mapped twice: E-mail.' }],
    [{ mapping: [null, 'name', null], mode: 'upsert' }, { mapping: 'Required columns are not mapped: E-mail.' }],
    [{ mapping: ['email', 'name', null] }, { mode: 'Choose a mode: insert, upsert.' }],
    [{ mapping: ['email', 'name', null], mode: 'update' }, { mode: 'This mode is not offered: update.' }],
    ['nonsense', { mapping: 'The mapping is missing.' }],
  ])('%#', (request, problems) => {
    expect(checkImportStart(request, against)).toEqual(problems);
  });
});
