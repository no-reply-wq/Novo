/**
 * Tests for WorkflowDetailPage (workflow visual editor).
 */

jest.mock('next/navigation', () => ({
  useParams: () => ({ appId: 'app1', workflowId: 'wf1' }),
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
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import WorkflowDetailPage from '../app/(builder)/apps/[appId]/workflows/[workflowId]/page';

const mockWorkflow = {
  id: 'wf1',
  appId: 'app1',
  name: 'Test Workflow',
  trigger: {
    id: 'trig1',
    workflowId: 'wf1',
    event: 'record_created',
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  actions: [],
  enabled: true,
  version: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/workflows/wf1')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ workflow: mockWorkflow }),
        text: () => Promise.resolve(''),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
  }) as jest.Mock;
});

describe('WorkflowDetailPage', () => {
  it('renders loading state initially', () => {
    render(<WorkflowDetailPage />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('renders trigger block after load', async () => {
    render(<WorkflowDetailPage />);
    await screen.findByText('Trigger');
    expect(screen.getByText('Trigger')).toBeInTheDocument();
  });

  it('renders add step button', async () => {
    render(<WorkflowDetailPage />);
    await screen.findByText('Trigger');
    const addButtons = screen.getAllByTitle('Add step');
    expect(addButtons.length).toBeGreaterThan(0);
  });

  it('opens action picker when + is clicked', async () => {
    render(<WorkflowDetailPage />);
    await screen.findByText('Trigger');
    const addBtn = screen.getAllByTitle('Add step')[0];
    fireEvent.click(addBtn);
    expect(screen.getByRole('dialog', { name: /pick an action/i })).toBeInTheDocument();
  });

  it('closes action picker on close button click', async () => {
    render(<WorkflowDetailPage />);
    await screen.findByText('Trigger');
    fireEvent.click(screen.getAllByTitle('Add step')[0]);
    // Close button (×) in the modal
    fireEvent.click(screen.getByLabelText('Close'));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /pick an action/i })).not.toBeInTheDocument();
    });
  });

  it('shows workflow name in header', async () => {
    render(<WorkflowDetailPage />);
    await screen.findByText('Test Workflow');
    expect(screen.getByText('Test Workflow')).toBeInTheDocument();
  });

  it('adding a step calls fetch and shows step card', async () => {
    render(<WorkflowDetailPage />);
    await screen.findByText('Trigger');
    fireEvent.click(screen.getAllByTitle('Add step')[0]);
    // Click Create Record action
    const createRecordBtn = screen.getByText('Create Record');
    fireEvent.click(createRecordBtn);
    // Should show step card and open drawer
    await waitFor(() => {
      expect(screen.getByText('create_record')).toBeInTheDocument();
    });
  });
});
