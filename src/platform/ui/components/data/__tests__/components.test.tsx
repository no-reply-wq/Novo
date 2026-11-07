/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { StatusPill } from '../StatusPill';
import { ProgressBar } from '../ProgressBar';
import { ActivityTimeline } from '../ActivityTimeline';
import { CardGrid } from '../CardGrid';
import { DateRelativeFilter } from '../DateRelativeFilter';
import { ChartComponent } from '../ChartComponent';

describe('StatusPill', () => {
  it('renders label for known status', () => {
    render(<StatusPill value="active" />);
    expect(screen.getByText('Active')).toBeTruthy();
  });
  it('falls back to raw value for unknown status', () => {
    render(<StatusPill value="foobar" />);
    expect(screen.getByText('foobar')).toBeTruthy();
  });
  it('uses custom config', () => {
    render(<StatusPill value="vip" config={{ vip: { label: 'VIP', color: '#gold', bgColor: '#fff' } }} />);
    expect(screen.getByText('VIP')).toBeTruthy();
  });
});

describe('ProgressBar', () => {
  it('renders without crashing', () => {
    render(<ProgressBar value={50} />);
    expect(screen.getByText('50%')).toBeTruthy();
  });
  it('clamps over 100', () => {
    render(<ProgressBar value={120} />);
    expect(screen.getByText('100%')).toBeTruthy();
  });
  it('clamps below 0', () => {
    render(<ProgressBar value={-10} />);
    expect(screen.getByText('0%')).toBeTruthy();
  });
  it('hides label when showLabel=false', () => {
    render(<ProgressBar value={50} showLabel={false} />);
    expect(screen.queryByText('50%')).toBeNull();
  });
});

describe('ActivityTimeline', () => {
  it('renders items', () => {
    const items = [
      { text: 'Created invoice', user: 'Alice', timestamp: new Date() },
      { text: 'Approved', user: 'Bob', timestamp: new Date() },
    ];
    render(<ActivityTimeline items={items} />);
    expect(screen.getByText('Created invoice')).toBeTruthy();
    expect(screen.getByText('Approved')).toBeTruthy();
  });
});

describe('CardGrid', () => {
  it('renders cards using template', () => {
    const items = [{ id: 1, name: 'Item A' }, { id: 2, name: 'Item B' }];
    render(<CardGrid items={items} cardTemplate={(item) => <div>{String(item.name)}</div>} />);
    expect(screen.getByText('Item A')).toBeTruthy();
    expect(screen.getByText('Item B')).toBeTruthy();
  });
  it('shows skeleton when loading', () => {
    render(<CardGrid items={[]} cardTemplate={() => <div />} loading={true} />);
    // No real items rendered
    expect(screen.queryByText('Item A')).toBeNull();
  });
});

describe('DateRelativeFilter', () => {
  it('renders preset buttons', () => {
    render(<DateRelativeFilter onChange={() => {}} />);
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Yesterday')).toBeTruthy();
    expect(screen.getByText('This month')).toBeTruthy();
  });
});

describe('ChartComponent - number type', () => {
  it('renders a big number', () => {
    render(<ChartComponent type="number" data={[{ label: 'Revenue', value: 42000 }]} title="Revenue" />);
    expect(screen.getByText(/42.*K/)).toBeTruthy();
    expect(screen.getByText('Revenue')).toBeTruthy();
  });
});
