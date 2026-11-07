/**
 * File importer tests — CSV parse, Excel parse, row count, type detection.
 */

import { parseUploadedFile } from '../../platform/connectors/file-importer';

describe('parseUploadedFile — CSV', () => {
  const csvContent = `name,age,city
Alice,30,London
Bob,25,Paris
Charlie,,Berlin`;

  it('parses headers and rows', async () => {
    const buffer = Buffer.from(csvContent, 'utf-8');
    const result = await parseUploadedFile(buffer, 'text/csv');
    expect(result.headers).toEqual(['name', 'age', 'city']);
    expect(result.totalRows).toBe(3);
    expect(result.rows[0]).toMatchObject({ name: 'Alice', age: '30', city: 'London' });
  });

  it('handles empty cell as empty string', async () => {
    const buffer = Buffer.from(csvContent, 'utf-8');
    const result = await parseUploadedFile(buffer, 'text/csv');
    expect(result.rows[2]['age']).toBe('');
  });

  it('returns correct row count', async () => {
    const csv = 'a,b\n1,2\n3,4\n5,6\n7,8\n9,10';
    const buffer = Buffer.from(csv, 'utf-8');
    const result = await parseUploadedFile(buffer, 'text/csv');
    expect(result.totalRows).toBe(5);
  });
});

describe('parseUploadedFile — unsupported type', () => {
  it('throws for unsupported mime type', async () => {
    const buffer = Buffer.from('data', 'utf-8');
    await expect(parseUploadedFile(buffer, 'application/pdf')).rejects.toThrow('Unsupported file type');
  });
});
