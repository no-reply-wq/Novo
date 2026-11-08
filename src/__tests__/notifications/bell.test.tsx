/**
 * @jest-environment jsdom
 */
/**
 * Tests for NotificationBell — Agent W2
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { NotificationBell } from '@/components/notifications/NotificationBell';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock EventSource
class MockEventSource {
  static OPEN = 1;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  close = jest.fn();
  constructor(public url: string) {
    // Store instance so tests can trigger events
    (global as unknown as Record<string, unknown>).__mockEventSource = this;
  }
}
global.EventSource = MockEventSource as unknown as typeof EventSource;

const mockNotifications = [
  {
    id: 'n1',
    tenantSlug: 'acme',
    recipientUserId: 'u1',
    type: 'approval_requested',
    title: 'Approve this',
    body: 'Please review the request',
    read: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'n2',
    tenantSlug: 'acme',
    recipientUserId: 'u1',
    type: 'mention',
    title: 'You were mentioned',
    body: 'In a comment',
    read: true,
    createdAt: new Date(Date.now() - 60_000).toISOString(),
  },
];

function setupFetch(notifications = mockNotifications) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ notifications }),
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('NotificationBell', () => {
  it('renders bell icon', () => {
    setupFetch([]);
    render(<NotificationBell />);
    expect(screen.getByRole('button', { name: /notifications/i })).toBeTruthy();
  });

  it('shows unread count badge when there are unread notifications', async () => {
    setupFetch(mockNotifications);
    render(<NotificationBell />);
    await waitFor(() => {
      expect(screen.getByText('1')).toBeTruthy();
    });
  });

  it('opens dropdown on click and shows notifications', async () => {
    setupFetch(mockNotifications);
    render(<NotificationBell />);

    // Wait for initial fetch
    await waitFor(() => expect(screen.getByText('1')).toBeTruthy());

    const bell = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(bell);

    await waitFor(() => {
      expect(screen.getByText('Approve this')).toBeTruthy();
      expect(screen.getByText('You were mentioned')).toBeTruthy();
    });
  });

  it('shows "No notifications yet" when list is empty', async () => {
    setupFetch([]);
    render(<NotificationBell />);

    const bell = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(bell);

    await waitFor(() => {
      expect(screen.getByText('No notifications yet')).toBeTruthy();
    });
  });

  it('calls mark-all-read on button click and clears count', async () => {
    setupFetch(mockNotifications);
    // Second fetch call returns read notifications
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ notifications: mockNotifications }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ notifications: mockNotifications }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

    render(<NotificationBell />);
    await waitFor(() => expect(screen.getByText('1')).toBeTruthy());

    // Open dropdown
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    await waitFor(() => screen.getByText('Mark all read'));

    fireEvent.click(screen.getByText('Mark all read'));

    await waitFor(() => {
      // After marking all read the count badge should be gone
      expect(screen.queryByText('1')).toBeNull();
    });

    const markAllCall = mockFetch.mock.calls.find(
      ([url]: [string]) => url === '/api/notifications/read-all',
    );
    expect(markAllCall).toBeDefined();
  });
});
