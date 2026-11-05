/**
 * Tests for ApprovalChainEditor (approvals page).
 */

jest.mock('next/navigation', () => ({
  useParams: () => ({ appId: 'app1' }),
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/platform/expr/parser', () => ({ parseExpression: jest.fn() }));
jest.mock('@/platform/expr/index', () => ({
  ExprParseError: class ExprParseError extends Error {
    errors: unknown[];
    constructor(msg: string, errors: unknown[]) { super(msg); this.errors = errors; }
  },
}));

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ApprovalsPage from '../app/(builder)/apps/[appId]/approvals/page';

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ chains: [] }),
    text: () => Promise.resolve(''),
  }) as jest.Mock;
});

describe('ApprovalsPage', () => {
  it('renders page heading', () => {
    render(<ApprovalsPage />);
    expect(screen.getByText('Approval Chains')).toBeInTheDocument();
  });

  it('shows New Chain button', () => {
    render(<ApprovalsPage />);
    expect(screen.getByText('+ New Chain')).toBeInTheDocument();
  });

  it('opens chain editor when New Chain is clicked', () => {
    render(<ApprovalsPage />);
    fireEvent.click(screen.getByText('+ New Chain'));
    expect(screen.getByText('New chain')).toBeInTheDocument();
  });

  it('shows Add level button in editor', () => {
    render(<ApprovalsPage />);
    fireEvent.click(screen.getByText('+ New Chain'));
    expect(screen.getByText('+ Add level')).toBeInTheDocument();
  });

  it('adds a level when Add level is clicked', () => {
    render(<ApprovalsPage />);
    fireEvent.click(screen.getByText('+ New Chain'));
    fireEvent.click(screen.getByText('+ Add level'));
    // A level row should appear with an approver type selector
    const selects = screen.getAllByDisplayValue('Role');
    expect(selects.length).toBeGreaterThan(0);
  });

  it('removes a level when × is clicked', () => {
    render(<ApprovalsPage />);
    fireEvent.click(screen.getByText('+ New Chain'));
    fireEvent.click(screen.getByText('+ Add level'));
    expect(screen.getAllByDisplayValue('Role').length).toBe(1);
    const deleteBtn = screen.getByTitle('Remove level');
    fireEvent.click(deleteBtn);
    expect(screen.queryAllByDisplayValue('Role').length).toBe(0);
  });

  it('closes editor when Cancel is clicked', () => {
    render(<ApprovalsPage />);
    fireEvent.click(screen.getByText('+ New Chain'));
    expect(screen.getByText('New chain')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('New chain')).not.toBeInTheDocument();
  });

  it('shows existing chains from API after loading', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          chains: [
            {
              id: 'chain1',
              appId: 'app1',
              name: 'PO Approval',
              tableId: 'purchase_orders',
              levels: [{ rank: 1, approverType: 'role', mode: 'sequential' }],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        }),
      text: () => Promise.resolve(''),
    });

    render(<ApprovalsPage />);
    await screen.findByText('PO Approval');
    expect(screen.getByText('PO Approval')).toBeInTheDocument();
    expect(screen.getByText(/1 level/)).toBeInTheDocument();
  });
});
