/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SignaturePad } from '../SignaturePad';

// Mock canvas methods
const mockGetContext = jest.fn(() => ({
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 0,
  lineCap: '',
  lineJoin: '',
  fillRect: jest.fn(),
  beginPath: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  stroke: jest.fn(),
}));

HTMLCanvasElement.prototype.getContext = mockGetContext as unknown as typeof HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.toDataURL = jest.fn(() => 'data:image/png;base64,ABC123XYZ==');

describe('SignaturePad', () => {
  it('renders clear and save buttons', () => {
    render(<SignaturePad onCapture={jest.fn()} />);
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save signature/i })).toBeInTheDocument();
  });

  it('save button is disabled when pad is empty', () => {
    render(<SignaturePad onCapture={jest.fn()} />);
    expect(screen.getByRole('button', { name: /save signature/i })).toBeDisabled();
  });

  it('save button is enabled after drawing', () => {
    render(<SignaturePad onCapture={jest.fn()} />);
    const canvas = screen.getByRole('img', { name: /signature pad/i });

    // Simulate a touch drawing
    fireEvent.touchStart(canvas, {
      touches: [{ clientX: 10, clientY: 10 }],
    });
    fireEvent.touchMove(canvas, {
      touches: [{ clientX: 20, clientY: 20 }],
    });
    fireEvent.touchEnd(canvas);

    expect(screen.getByRole('button', { name: /save signature/i })).not.toBeDisabled();
  });

  it('clear resets the pad to empty state', () => {
    render(<SignaturePad onCapture={jest.fn()} />);
    const canvas = screen.getByRole('img', { name: /signature pad/i });

    fireEvent.touchStart(canvas, { touches: [{ clientX: 10, clientY: 10 }] });
    fireEvent.touchEnd(canvas);

    fireEvent.click(screen.getByRole('button', { name: /clear/i }));

    expect(screen.getByRole('button', { name: /save signature/i })).toBeDisabled();
    expect(screen.getByText(/sign here/i)).toBeInTheDocument();
  });

  it('calls onCapture with a non-empty dataUrl when saved', () => {
    const onCapture = jest.fn();
    render(<SignaturePad onCapture={onCapture} />);
    const canvas = screen.getByRole('img', { name: /signature pad/i });

    fireEvent.touchStart(canvas, { touches: [{ clientX: 5, clientY: 5 }] });
    fireEvent.touchEnd(canvas);

    fireEvent.click(screen.getByRole('button', { name: /save signature/i }));

    expect(onCapture).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/png/));
    const dataUrl: string = onCapture.mock.calls[0][0];
    expect(dataUrl.length).toBeGreaterThan(20);
  });
});
