/**
 * Tests for ExpressionEditor component.
 *
 * CodeMirror is replaced by moduleNameMapper in jest.config.js.
 * parseExpression is mocked here.
 */

// These jest.mock calls are hoisted to the top by babel-jest/ts-jest
jest.mock('@/platform/expr/parser', () => ({
  parseExpression: jest.fn(),
}));

jest.mock('@/platform/expr/index', () => ({
  ExprParseError: class ExprParseError extends Error {
    errors: Array<{ message: string; position?: number }>;
    constructor(msg: string, errors: Array<{ message: string; position?: number }>) {
      super(msg);
      this.name = 'ExprParseError';
      this.errors = errors;
    }
  },
}));

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ExpressionEditor, type FieldHint } from '../components/builder/ExpressionEditor';

const mockParseExpression = jest.requireMock('@/platform/expr/parser').parseExpression as jest.Mock;
const { ExprParseError } = jest.requireMock('@/platform/expr/index') as {
  ExprParseError: new (msg: string, errors: Array<{ message: string; position?: number }>) => Error & {
    errors: Array<{ message: string; position?: number }>;
  };
};

const fieldHints: FieldHint[] = [
  { apiKey: 'amount', label: 'Amount', type: 'number' },
  { apiKey: 'name', label: 'Name', type: 'text' },
];

describe('ExpressionEditor', () => {
  beforeEach(() => {
    mockParseExpression.mockReturnValue({});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<ExpressionEditor value="" onChange={jest.fn()} fieldHints={fieldHints} />);
    expect(screen.getByTestId('expression-editor')).toBeInTheDocument();
  });

  it('renders the editor container', () => {
    render(<ExpressionEditor value="amount > 100" onChange={jest.fn()} fieldHints={fieldHints} />);
    expect(screen.getByTestId('expression-editor')).toBeTruthy();
  });

  it('shows external error prop when provided', () => {
    render(
      <ExpressionEditor
        value=""
        onChange={jest.fn()}
        fieldHints={fieldHints}
        error="Unexpected token at position 5"
      />,
    );
    const errorEl = screen.getByTestId('expr-error');
    expect(errorEl).toBeInTheDocument();
    expect(errorEl.textContent).toContain('Unexpected token at position 5');
  });

  it('does not show error element when no error', () => {
    render(<ExpressionEditor value="amount" onChange={jest.fn()} fieldHints={fieldHints} />);
    expect(screen.queryByTestId('expr-error')).not.toBeInTheDocument();
  });

  it('shows parse error from ExprParseError thrown by parseExpression', () => {
    mockParseExpression.mockImplementation(() => {
      throw new ExprParseError('Parse failed', [{ message: 'Unexpected token', position: 7 }]);
    });

    render(
      <ExpressionEditor value="bad expr !!!" onChange={jest.fn()} fieldHints={fieldHints} />,
    );

    const errorEl = screen.getByTestId('expr-error');
    expect(errorEl).toBeInTheDocument();
    expect(errorEl.textContent).toContain('Unexpected token');
  });

  it('renders with readOnly prop', () => {
    render(
      <ExpressionEditor value="amount * 2" onChange={jest.fn()} fieldHints={fieldHints} readOnly />,
    );
    expect(screen.getByTestId('expression-editor')).toBeTruthy();
  });

  it('applies className prop', () => {
    render(
      <ExpressionEditor value="" onChange={jest.fn()} fieldHints={fieldHints} className="my-editor" />,
    );
    const wrapper = screen.getByTestId('expression-editor');
    expect(wrapper.classList.contains('my-editor')).toBe(true);
  });
});
