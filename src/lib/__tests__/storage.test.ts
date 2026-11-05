/**
 * Tests for src/lib/storage.ts — validateFileType()
 *
 * Covers magic-byte detection of SVG and HTML regardless of the MIME type
 * the client claims, and that legitimate files pass through.
 */

import { validateFileType } from '../storage';

function buf(s: string): Buffer {
  return Buffer.from(s, 'utf8');
}

describe('validateFileType — MIME-type block-list', () => {
  const cases: [string, string][] = [
    ['image/svg+xml', 'icon.svg'],
    ['text/html', 'page.html'],
    ['application/xhtml+xml', 'doc.xhtml'],
    ['text/xml', 'data.xml'],
    ['application/xml', 'feed.xml'],
  ];

  it.each(cases)('blocks %s regardless of content', (mime, filename) => {
    const data = buf('benign content');
    expect(() => validateFileType(mime, data, filename)).toThrow();
  });
});

describe('validateFileType — SVG magic bytes (regardless of MIME type)', () => {
  it('blocks buffer that starts with <svg', () => {
    const data = buf('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(() => validateFileType('image/png', data, 'fake.png')).toThrow(/SVG/i);
  });

  it('blocks buffer that starts with <?xml (SVG pattern)', () => {
    const data = buf('<?xml version="1.0"?><svg>...</svg>');
    expect(() => validateFileType('image/jpeg', data, 'fake.jpg')).toThrow(/SVG/i);
  });

  it('blocks SVG with leading whitespace', () => {
    const data = buf('  \n  <svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(() => validateFileType('image/webp', data, 'img.webp')).toThrow(/SVG/i);
  });
});

describe('validateFileType — HTML magic bytes (regardless of MIME type)', () => {
  it('blocks buffer starting with <!DOCTYPE html>', () => {
    const data = buf('<!DOCTYPE html><html><body>xss</body></html>');
    expect(() => validateFileType('image/png', data, 'fake.png')).toThrow(/HTML/i);
  });

  it('blocks buffer starting with <html>', () => {
    const data = buf('<html><head></head><body>xss</body></html>');
    expect(() => validateFileType('application/octet-stream', data, 'file.bin')).toThrow(/HTML/i);
  });

  it('blocks HTML with leading whitespace', () => {
    const data = buf('\n\n<!doctype html><html/>');
    expect(() => validateFileType('image/gif', data, 'img.gif')).toThrow(/HTML/i);
  });
});

describe('validateFileType — legitimate files pass through', () => {
  it('allows a PNG (magic bytes: 89 50 4E 47)', () => {
    const data = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(() => validateFileType('image/png', data, 'photo.png')).not.toThrow();
  });

  it('allows a JPEG (magic bytes: FF D8)', () => {
    const data = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(() => validateFileType('image/jpeg', data, 'photo.jpg')).not.toThrow();
  });

  it('allows a PDF (magic bytes: %PDF-)', () => {
    const data = buf('%PDF-1.4 ...');
    expect(() => validateFileType('application/pdf', data, 'doc.pdf')).not.toThrow();
  });

  it('allows a plain text file', () => {
    const data = buf('hello world');
    expect(() => validateFileType('text/plain', data, 'notes.txt')).not.toThrow();
  });

  it('allows a ZIP (magic bytes: PK)', () => {
    const data = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    expect(() => validateFileType('application/zip', data, 'archive.zip')).not.toThrow();
  });
});
