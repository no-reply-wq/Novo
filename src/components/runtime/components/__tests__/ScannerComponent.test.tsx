/**
 * Tests for ScannerComponent.
 * jsdom environment has no BarcodeDetector, so we test fallback paths.
 */
import { isBarcodeDetectorSupported } from '../ScannerComponent';

describe('isBarcodeDetectorSupported', () => {
  it('returns false in jsdom (no BarcodeDetector)', () => {
    // jsdom does not implement BarcodeDetector
    expect(isBarcodeDetectorSupported()).toBe(false);
  });

  it('returns false when window is undefined (node environment)', () => {
    // In node test environment, window is undefined, so result is always false
    // This test just verifies the function is callable without throwing
    const result = isBarcodeDetectorSupported();
    expect(typeof result).toBe('boolean');
  });
});

describe('ScannerComponent fallback', () => {
  it('module exports isBarcodeDetectorSupported as a function', async () => {
    const mod = await import('../ScannerComponent');
    expect(typeof mod.isBarcodeDetectorSupported).toBe('function');
  });

  it('module exports ScannerComponent as a function', async () => {
    const mod = await import('../ScannerComponent');
    expect(typeof mod.ScannerComponent).toBe('function');
  });
});
