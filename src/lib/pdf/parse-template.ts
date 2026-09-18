import PizZip from 'pizzip';

interface ParsedField {
  key: string;
  label: string;
  field_type: 'text' | 'number' | 'date' | 'textarea';
  is_line_item: boolean;
}

function guessFieldType(key: string): ParsedField['field_type'] {
  const k = key.toLowerCase();
  if (/qty|quantity|count|units|pieces|pcs|nos|no_of|num_|number_of/.test(k)) return 'number';
  if (/rate|price|amount|total|subtotal|tax|gst|igst|cgst|sgst|discount|value|cost|charge|freight|advance|balance|due|paid/.test(k)) return 'number';
  if (/percent|percentage|margin|markup/.test(k)) return 'number';
  if (/date|dt$/.test(k)) return 'date';
  if (/note|notes|remark|remarks|description|desc|comment|terms|condition|address|detail/.test(k)) return 'textarea';
  return 'text';
}

function toLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

export function parseDocxTemplate(buffer: Buffer): ParsedField[] {
  const zip = new PizZip(buffer);
  const xmlFile = zip.files['word/document.xml'];
  if (!xmlFile) throw new Error('Not a valid .docx file');
  const text = xmlFile.asText().replace(/<[^>]+>/g, '');

  const lineItemMatch = text.match(/\{#items\}([\s\S]*?)\{\/items\}/);
  const lineItemText = lineItemMatch ? lineItemMatch[1] : '';

  const lineItemKeys = new Set<string>();
  const lineItemRe = /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = lineItemRe.exec(lineItemText)) !== null) lineItemKeys.add(m[1]);

  const allKeys = new Set<string>();
  const allRe = /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g;
  while ((m = allRe.exec(text)) !== null) {
    if (!m[1].startsWith('#') && !m[1].startsWith('/')) allKeys.add(m[1]);
  }
  allKeys.delete('items');
  lineItemKeys.delete('items');

  const fields: ParsedField[] = [];
  for (const key of allKeys) {
    if (!lineItemKeys.has(key)) fields.push({ key, label: toLabel(key), field_type: guessFieldType(key), is_line_item: false });
  }
  for (const key of lineItemKeys) {
    fields.push({ key, label: toLabel(key), field_type: guessFieldType(key), is_line_item: true });
  }
  return fields;
}
