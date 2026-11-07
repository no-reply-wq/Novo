/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BarcodeScanner } from '../BarcodeScanner';

// Mock getUserMedia
const mockStream = {
  getTracks: () => [{ stop: jest.fn() }],
};

const mockDetect = jest.fn();

// Mock BarcodeDetector
const MockBarcodeDetector = jest.fn().mockImplementation(() => ({
  detect: mockDetect,
}));
(MockBarcodeDetector as unknown as { getSupportedFormats: () => Promise<string[]> }).getSupportedFormats =
  jest.fn().mockResolvedValue(['qr_code', 'code_128', 'ean_13']);

Object.defineProperty(window, 'BarcodeDetector', {
  writable: true,
  value: MockBarcodeDetector,
});

Object.defineProperty(navigator, 'mediaDevices', {
  writable: true,
  value: {
    getUserMedia: jest.fn().mockResolvedValue(mockStream),
    enumerateDevices: jest.fn().mockResolvedValue([
      { kind: 'videoinput', deviceId: 'cam1', label: 'Back Camera' },
    ]),
  },
});

Object.defineProperty(navigator, 'vibrate', {
  writable: true,
  value: jest.fn(),
});

// Mock HTMLVideoElement.play
HTMLVideoElement.prototype.play = jest.fn().mockResolvedValue(undefined);

beforeEach(() => {
  jest.clearAllMocks();
  mockDetect.mockResolvedValue([]);
});

describe('BarcodeScanner', () => {
  it('renders Start Scanning button', () => {
    render(<BarcodeScanner onScan={jest.fn()} />);
    expect(screen.getByRole('button', { name: /start scanning/i })).toBeInTheDocument();
  });

  it('calls onScan with decoded value when barcode detected', async () => {
    const onScan = jest.fn();
    mockDetect.mockResolvedValueOnce([{ rawValue: '123456789', format: 'code_128' }]);

    render(<BarcodeScanner onScan={onScan} />);
    fireEvent.click(screen.getByRole('button', { name: /start scanning/i }));

    await waitFor(() => {
      expect(onScan).toHaveBeenCalledWith('123456789', 'code_128');
    }, { timeout: 3000 });
  });

  it('shows last scan result after successful scan', async () => {
    mockDetect.mockResolvedValueOnce([{ rawValue: 'QR-DATA-XYZ', format: 'qr_code' }]);

    render(<BarcodeScanner onScan={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /start scanning/i }));

    await waitFor(() => {
      expect(screen.getByText('QR-DATA-XYZ')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('shows error message when getUserMedia fails', async () => {
    jest.spyOn(navigator.mediaDevices, 'getUserMedia').mockRejectedValueOnce(
      new Error('Permission denied')
    );

    render(<BarcodeScanner onScan={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /start scanning/i }));

    await waitFor(() => {
      expect(screen.getByText(/permission denied/i)).toBeInTheDocument();
    });
  });
});
