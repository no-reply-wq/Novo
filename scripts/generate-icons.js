#!/usr/bin/env node
/**
 * Generates placeholder PWA icons (blue squares) for Novo.
 * Run: node scripts/generate-icons.js
 * Output: public/icons/icon-192.png, public/icons/icon-512.png
 */

const fs = require('fs');
const path = require('path');

// Minimal valid PNG: 1x1 blue pixel, then we scale via raw PNG data construction.
// We generate a proper PNG using raw Buffer manipulation — no external deps.

function createPng(size, r, g, b) {
  const { createHash } = require('crypto');

  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk: width, height, bit depth (8), color type (2=RGB), compression, filter, interlace
  function chunk(type, data) {
    const typeBytes = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crcInput = Buffer.concat([typeBytes, data]);
    const crc = crc32(crcInput);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc >>> 0, 0);
    return Buffer.concat([len, typeBytes, data, crcBuf]);
  }

  // CRC-32 implementation
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      t[n] = c;
    }
    return t;
  })();

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 2;  // color type RGB
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdr = chunk('IHDR', ihdrData);

  // IDAT chunk: scanlines with filter byte 0 (None) + RGB pixels
  const scanlineSize = 1 + size * 3; // filter byte + RGB per pixel
  const rawData = Buffer.alloc(size * scanlineSize, 0);
  for (let y = 0; y < size; y++) {
    const offset = y * scanlineSize;
    rawData[offset] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const pixelOffset = offset + 1 + x * 3;
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
    }
  }

  // Compress with zlib (Node built-in)
  const zlib = require('zlib');
  const compressed = zlib.deflateSync(rawData, { level: 9 });
  const idat = chunk('IDAT', compressed);

  // IEND chunk
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

const outDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

// Blue: #2563eb = rgb(37, 99, 235)
const r = 37, g = 99, b = 235;

fs.writeFileSync(path.join(outDir, 'icon-192.png'), createPng(192, r, g, b));
console.log('Written: public/icons/icon-192.png');

fs.writeFileSync(path.join(outDir, 'icon-512.png'), createPng(512, r, g, b));
console.log('Written: public/icons/icon-512.png');
