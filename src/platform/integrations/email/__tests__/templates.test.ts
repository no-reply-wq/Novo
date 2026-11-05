/**
 * Tests for renderEmailTemplate — {{fieldName}} substitution.
 */

import { renderEmailTemplate } from '../templates';

describe('renderEmailTemplate', () => {
  it('substitutes a single token in subject', () => {
    const result = renderEmailTemplate(
      { subject: 'Hello {{name}}!', html: '<p>Hi</p>' },
      { name: 'Alice' }
    );
    expect(result.subject).toBe('Hello Alice!');
  });

  it('substitutes multiple tokens in HTML', () => {
    const result = renderEmailTemplate(
      {
        subject: 'Order {{orderId}}',
        html: '<p>Dear {{customerName}}, your order {{orderId}} is ready.</p>',
      },
      { orderId: '#1234', customerName: 'Bob' }
    );
    expect(result.html).toBe('<p>Dear Bob, your order #1234 is ready.</p>');
  });

  it('replaces missing tokens with empty string', () => {
    const result = renderEmailTemplate(
      { subject: '{{greeting}} {{name}}', html: '<p>{{body}}</p>' },
      { name: 'Carol' }
    );
    expect(result.subject).toBe(' Carol');
    expect(result.html).toBe('<p></p>');
  });

  it('handles tokens with extra whitespace', () => {
    const result = renderEmailTemplate(
      { subject: '{{ name }}', html: '{{ value }}' },
      { name: 'Dave', value: '42' }
    );
    expect(result.subject).toBe('Dave');
    expect(result.html).toBe('42');
  });

  it('converts non-string values to string', () => {
    const result = renderEmailTemplate(
      { subject: 'Count: {{count}}', html: 'Active: {{active}}' },
      { count: 7, active: true }
    );
    expect(result.subject).toBe('Count: 7');
    expect(result.html).toBe('Active: true');
  });

  it('replaces null/undefined values with empty string', () => {
    const result = renderEmailTemplate(
      { subject: '{{a}}{{b}}{{c}}', html: '' },
      { a: null, b: undefined, c: 'ok' }
    );
    expect(result.subject).toBe('ok');
  });

  it('leaves template unchanged when data is empty', () => {
    const result = renderEmailTemplate(
      { subject: 'No tokens here', html: '<p>Static</p>' },
      {}
    );
    expect(result.subject).toBe('No tokens here');
    expect(result.html).toBe('<p>Static</p>');
  });

  it('replaces the same token multiple times', () => {
    const result = renderEmailTemplate(
      { subject: '{{x}} and {{x}}', html: '' },
      { x: 'hello' }
    );
    expect(result.subject).toBe('hello and hello');
  });
});
