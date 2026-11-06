import type { PDFTemplate } from './types';
import type { PDFRenderData } from './html-renderer';
import { renderPDFTemplate } from './html-renderer';

// Lazy import puppeteer to avoid issues in test environments
// eslint-disable-next-line @typescript-eslint/no-require-imports
const puppeteerModule = () => import('puppeteer') as Promise<typeof import('puppeteer')>;

type Browser = import('puppeteer').Browser;

let browserInstance: Browser | null = null;
let browserLaunchPromise: Promise<Browser> | null = null;

const PAGE_FORMAT_MAP: Record<string, string> = {
  A4: 'A4',
  A5: 'A5',
  Letter: 'Letter',
};

async function getBrowser(): Promise<Browser> {
  if (browserInstance) return browserInstance;
  if (browserLaunchPromise) return browserLaunchPromise;

  browserLaunchPromise = (async () => {
    const puppeteer = await puppeteerModule();
    const browser = await puppeteer.default.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
      timeout: 30000,
    });
    browserInstance = browser;
    return browser;
  })();

  return browserLaunchPromise;
}

export async function generatePDF(
  template: PDFTemplate,
  data: PDFRenderData
): Promise<Buffer> {
  const html = renderPDFTemplate(template, data);
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });

    const format = PAGE_FORMAT_MAP[template.pageSize] ?? 'A4';

    const pdfBuffer = await page.pdf({
      format: format as 'A4' | 'A5' | 'Letter',
      landscape: template.orientation === 'landscape',
      margin: {
        top: `${template.margins.top}mm`,
        right: `${template.margins.right}mm`,
        bottom: `${template.margins.bottom}mm`,
        left: `${template.margins.left}mm`,
      },
      printBackground: true,
      displayHeaderFooter: false,
      timeout: 30000,
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await page.close();
  }
}

export async function generatePDFToFile(
  template: PDFTemplate,
  data: PDFRenderData,
  outputPath: string
): Promise<void> {
  const { writeFile } = await import('fs/promises');
  const pdfBuffer = await generatePDF(template, data);
  await writeFile(outputPath, pdfBuffer);
}

/** Close the shared browser — call on graceful shutdown */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
    browserLaunchPromise = null;
  }
}
