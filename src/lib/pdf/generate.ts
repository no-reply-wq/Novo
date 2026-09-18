/**
 * PDF Generation via docxtemplater
 *
 * Flow:
 * 1. Fetch the .docx template from storage (URL stored in form_configs.pdf_template_url)
 * 2. Merge with data (header fields + line items as a table loop)
 * 3. Convert to PDF via LibreOffice (server-side) or return .docx for client download
 * 4. Upload the output to storage
 * 5. Return a signed URL
 *
 * Template syntax (docxtemplater tags):
 *   {field_key}               → header field value
 *   {#items}{qty}{/items}     → line items loop
 *   {today}                   → current date
 *   {number}                  → auto-generated document number
 */

import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

export interface PDFGenerationInput {
  templateUrl: string;         // URL to the .docx template file
  headerData: Record<string, unknown>;
  lineItems?: Record<string, unknown>[];
  extraContext?: Record<string, unknown>;  // e.g. { number: 'Q-0001', today: '2026-09-09' }
}

export interface PDFGenerationResult {
  buffer: Buffer;
  filename: string;
}

/**
 * Merge a docx template with data and return the filled .docx as a Buffer.
 * Call this from an API route; never import in browser code.
 */
export async function generateDocx(input: PDFGenerationInput): Promise<PDFGenerationResult> {
  // Fetch the template
  const templateRes = await fetch(input.templateUrl);
  if (!templateRes.ok) {
    throw new Error(`Failed to fetch template: ${input.templateUrl} (${templateRes.status})`);
  }
  const templateBuffer = Buffer.from(await templateRes.arrayBuffer());

  // Load into PizZip → docxtemplater
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    // Error handler — surface tag errors clearly
    errorLogging: process.env.NODE_ENV !== 'production',
  });

  // Build the merge context
  const context: Record<string, unknown> = {
    ...input.extraContext,
    ...input.headerData,
    items: input.lineItems ?? [],
    today: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    now: new Date().toISOString(),
  };

  // Render
  doc.render(context);

  const outputBuffer = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });

  const number = (input.extraContext?.number as string) ?? 'document';
  const filename = `${number.replace(/[^a-zA-Z0-9-_]/g, '_')}.docx`;

  return { buffer: Buffer.from(outputBuffer), filename };
}

/**
 * Upload a buffer to cloud storage and return the public URL.
 * Uses Cloudflare R2 (S3-compatible) via the AWS SDK.
 * Falls back to a local /tmp path in dev.
 */
export async function uploadToStorage(
  buffer: Buffer,
  path: string,
  contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
): Promise<string> {
  const endpoint = process.env.STORAGE_ENDPOINT;
  const bucket = process.env.STORAGE_BUCKET;
  const publicUrl = process.env.STORAGE_PUBLIC_URL;

  if (!endpoint || !bucket) {
    // Dev fallback: write to /tmp and return a data URL
    const { writeFileSync } = await import('fs');
    const tmpPath = `/tmp/${path.replace(/\//g, '_')}`;
    writeFileSync(tmpPath, buffer);
    return `file://${tmpPath}`;
  }

  // Dynamic import to avoid bundling issues (AWS SDK is large)
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');

  const client = new S3Client({
    endpoint,
    region: 'auto',
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY ?? '',
      secretAccessKey: process.env.STORAGE_SECRET_KEY ?? '',
    },
  });

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: path,
    Body: buffer,
    ContentType: contentType,
  }));

  return `${publicUrl}/${path}`;
}
