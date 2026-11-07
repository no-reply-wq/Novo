'use client';

import React, { useState } from 'react';
import { Package, Zap, Database, Bell, Navigation2, Users, Calendar, Star } from 'lucide-react';

// Components
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Spinner } from '@/components/ui/spinner';
import { Divider } from '@/components/ui/divider';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Tabs, TabPanel } from '@/components/ui/tabs';
import { Accordion } from '@/components/ui/accordion';
import { Modal } from '@/components/ui/modal';
import { Drawer } from '@/components/ui/drawer';
import { Tooltip } from '@/components/ui/tooltip';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup } from '@/components/ui/radio';
import { Switch } from '@/components/ui/switch';
import { MultiSelect } from '@/components/ui/multi-select';
import { DatePicker } from '@/components/ui/date-picker';
import { FileUpload } from '@/components/ui/file-upload';
import { Rating } from '@/components/ui/rating';
import { ColorPicker } from '@/components/ui/color-picker';
import { Table } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCard } from '@/components/ui/stat-card';
import { Progress } from '@/components/ui/progress';
import { Timeline } from '@/components/ui/timeline';
import { Skeleton, SkeletonCard } from '@/components/ui/skeleton';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Pagination } from '@/components/ui/pagination';
import { ToastProvider, useToast } from '@/components/ui/toast';
import { DropdownMenu } from '@/components/ui/dropdown-menu';
import { Popover } from '@/components/ui/popover';

import { Label } from '@/components/ui/label';
import { FormField } from '@/components/ui/form-field';
import { Stepper } from '@/components/ui/stepper';
import { CommandPalette, useCommandPalette } from '@/components/ui/command';
import { Moon, Sun, Search as SearchIcon, Settings, FileText } from 'lucide-react';

// ─── Section wrapper ───────────────────────────────────────────

function Section({ title, description, children }: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-16">
      <div className="mb-6 pb-4 border-b border-[var(--color-border)]">
        <h2 className="text-lg font-semibold text-[var(--color-fg-base)]">{title}</h2>
        {description && (
          <p className="text-sm text-[var(--color-fg-muted)] mt-1">{description}</p>
        )}
      </div>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-[var(--color-fg-muted)] uppercase tracking-wide mb-2">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}


// ─── Dark mode hook ─────────────────────────────────────────────

function useDarkMode() {
  const [dark, setDark] = React.useState(false);
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }, [dark]);
  return { dark, toggle: () => setDark((p) => !p) };
}

// ─── Toast demo (needs context) ────────────────────────────────

function ToastDemo() {
  const toast = useToast();
  return (
    <Row label="Toast notifications">
      <Button size="sm" onClick={() => toast.success('File saved successfully', { title: 'Saved' })}>
        Success
      </Button>
      <Button size="sm" variant="secondary" onClick={() => toast.error('Something went wrong', { title: 'Error' })}>
        Error
      </Button>
      <Button size="sm" variant="ghost" onClick={() => toast.warning('Your session expires soon', { title: 'Warning' })}>
        Warning
      </Button>
      <Button size="sm" variant="ghost" onClick={() => toast.info('3 new messages received', { title: 'Info' })}>
        Info
      </Button>
    </Row>
  );
}


function DarkModeToggle() {
  const { dark, toggle } = useDarkMode();
  return (
    <button
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="ml-2 p-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-base)] text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-muted)] transition-colors"
    >
      {dark ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}


// ─── Command palette demo ────────────────────────────────────────

function CommandPaletteDemo() {
  const { open, setOpen, toggle } = useCommandPalette();
  const items = [
    { key: 'new-doc', label: 'New document', icon: <FileText size={14} />, group: 'Create', shortcut: '⌘N', onSelect: () => {} },
    { key: 'settings', label: 'Open settings', icon: <Settings size={14} />, group: 'Navigate', shortcut: '⌘,', onSelect: () => {} },
    { key: 'users', label: 'Manage users', group: 'Navigate', onSelect: () => {} },
    { key: 'search', label: 'Global search', icon: <SearchIcon size={14} />, group: 'Tools', shortcut: '⌘F', onSelect: () => {} },
  ];
  return (
    <Row label="Command palette (Cmd+K)">
      <Button variant="secondary" size="sm" onClick={toggle}>
        <SearchIcon size={14} className="mr-1.5" />
        Open command palette
        <kbd className="ml-2 text-xs bg-[var(--color-bg-muted)] border border-[var(--color-border)] rounded px-1 py-0.5 font-mono">⌘K</kbd>
      </Button>
      <CommandPalette items={items} open={open} onClose={() => setOpen(false)} />
    </Row>
  );
}

// ─── Main catalogue ────────────────────────────────────────────

function Catalogue() {
  const [activeTab, setActiveTab] = useState('primitives');
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [checkboxChecked, setCheckboxChecked] = useState(false);
  const [switchOn, setSwitchOn] = useState(false);
  const [radioVal, setRadioVal] = useState('option1');
  const [page, setPage] = useState(1);
  const [rating, setRating] = useState(3);
  const [color, setColor] = useState('#2563eb');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [multiVals, setMultiVals] = useState<string[]>([]);

  const tableData = Array.from({ length: 12 }, (_, i) => ({
    id: `row-${i}`,
    name: ['Alice Johnson', 'Bob Chen', 'Carol Williams', 'David Kim', 'Emma Davis'][i % 5],
    role: ['Engineer', 'Designer', 'Manager', 'Analyst', 'Director'][i % 5],
    status: (['active', 'inactive', 'pending'] as const)[i % 3],
    joined: `2024-0${(i % 9) + 1}-${String((i % 28) + 1).padStart(2, '0')}`,
  }));

  const statusBadge: Record<string, React.ReactNode> = {
    active: <Badge variant="success">Active</Badge>,
    inactive: <Badge variant="neutral">Inactive</Badge>,
    pending: <Badge variant="warning">Pending</Badge>,
  };

  const tabs = [
    { key: 'primitives', label: 'Primitives' },
    { key: 'forms', label: 'Forms' },
    { key: 'data', label: 'Data Display' },
    { key: 'feedback', label: 'Feedback' },
    { key: 'nav', label: 'Navigation' },
    { key: 'table', label: 'Table' },
    { key: 'newwave1', label: 'New (Wave 1)' },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)]">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-bg-surface)] shadow-[var(--shadow-sm)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[var(--radius-md)] bg-[var(--color-primary)] flex items-center justify-center">
              <Package size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-[var(--color-fg-base)]">Novo Design System</h1>
              <p className="text-xs text-[var(--color-fg-muted)]">Component catalogue · v1.0</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="success">
              <Zap size={10} />
              All systems go
            </Badge>
            <DarkModeToggle />
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        {/* Nav tabs */}
        <Tabs
          items={tabs}
          activeKey={activeTab}
          onChange={setActiveTab}
          variant="pill"
          className="mb-10"
        />

        {/* Primitives */}
        <TabPanel tabKey="primitives" activeKey={activeTab}>
          <Section title="Buttons" description="All variants and sizes">
            <Row label="Variants">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
            </Row>
            <Row label="Sizes">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </Row>
            <Row label="States">
              <Button loading>Saving…</Button>
              <Button disabled>Disabled</Button>
              <Button leftIcon={<Users size={14} />}>With icon</Button>
            </Row>
          </Section>

          <Section title="Badges">
            <Row label="Variants">
              <Badge variant="success">Success</Badge>
              <Badge variant="warning">Warning</Badge>
              <Badge variant="danger">Danger</Badge>
              <Badge variant="info">Info</Badge>
              <Badge variant="neutral">Neutral</Badge>
            </Row>
            <Row label="Custom color">
              <Badge color="#7c3aed">Purple</Badge>
              <Badge color="#ea580c">Orange</Badge>
              <Badge color="#16a34a">Green</Badge>
            </Row>
          </Section>

          <Section title="Avatars">
            <Row label="Sizes with initials">
              <Avatar name="Alice Johnson" size="xs" />
              <Avatar name="Bob Chen" size="sm" />
              <Avatar name="Carol Williams" size="md" />
              <Avatar name="David Kim" size="lg" />
              <Avatar name="Emma Davis" size="xl" />
            </Row>
          </Section>

          <Section title="Spinners">
            <Row label="Sizes">
              <Spinner size="sm" />
              <Spinner size="md" />
              <Spinner size="lg" />
            </Row>
          </Section>

          <Section title="Divider">
            <Divider />
            <Divider label="or continue with" />
          </Section>

          <Section title="Card">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Default card</CardTitle>
                  <Badge variant="success">Active</Badge>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-[var(--color-fg-muted)]">Cards are the primary surface for grouping related content.</p>
                </CardContent>
                <CardFooter>
                  <Button size="sm" variant="secondary">Cancel</Button>
                  <Button size="sm">Save</Button>
                </CardFooter>
              </Card>
              <Card shadow="lg" padding="lg">
                <p className="text-sm text-[var(--color-fg-muted)]">Large shadow, large padding variant.</p>
              </Card>
            </div>
          </Section>

          <Section title="Accordion">
            <Accordion
              mode="single"
              items={[
                { key: 'q1', title: 'What is the Novo platform?', content: 'Novo is a multi-tenant ERP and app-builder platform for small and medium businesses.' },
                { key: 'q2', title: 'How does the design system work?', content: 'All components are built on CSS custom properties (tokens) that automatically adapt to light and dark themes.' },
                { key: 'q3', title: 'Is accessibility built in?', content: 'Yes. Every component ships with correct ARIA roles, keyboard navigation, and focus management.' },
              ]}
            />
          </Section>

          <Section title="Tabs">
            <div className="space-y-6">
              <div>
                <p className="text-xs text-[var(--color-fg-muted)] mb-3">Line variant</p>
                <Tabs
                  variant="line"
                  items={[
                    { key: 'a', label: 'Overview' },
                    { key: 'b', label: 'Activity' },
                    { key: 'c', label: 'Settings' },
                    { key: 'd', label: 'Disabled', disabled: true },
                  ]}
                />
              </div>
              <div>
                <p className="text-xs text-[var(--color-fg-muted)] mb-3">Pill variant</p>
                <Tabs
                  variant="pill"
                  items={[
                    { key: 'x', label: 'List' },
                    { key: 'y', label: 'Grid' },
                    { key: 'z', label: 'Calendar' },
                  ]}
                />
              </div>
            </div>
          </Section>

          <Section title="Tooltip">
            <Row label="All directions">
              <Tooltip content="Tooltip on top" side="top">
                <Button size="sm" variant="secondary">Top</Button>
              </Tooltip>
              <Tooltip content="Tooltip on right" side="right">
                <Button size="sm" variant="secondary">Right</Button>
              </Tooltip>
              <Tooltip content="Tooltip on bottom" side="bottom">
                <Button size="sm" variant="secondary">Bottom</Button>
              </Tooltip>
              <Tooltip content="Tooltip on left" side="left">
                <Button size="sm" variant="secondary">Left</Button>
              </Tooltip>
            </Row>
          </Section>

          <Section title="Modal and Drawer">
            <Row label="Overlay components">
              <Button onClick={() => setModalOpen(true)}>Open modal</Button>
              <Button variant="secondary" onClick={() => setDrawerOpen(true)}>Open drawer</Button>
            </Row>
            <Modal
              open={modalOpen}
              onClose={() => setModalOpen(false)}
              title="Confirm action"
              description="This dialog asks for confirmation"
            >
              <p className="text-sm text-[var(--color-fg-muted)] mb-6">
                Are you sure you want to proceed? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button variant="danger" onClick={() => setModalOpen(false)}>Delete</Button>
              </div>
            </Modal>
            <Drawer
              open={drawerOpen}
              onClose={() => setDrawerOpen(false)}
              title="Settings"
              side="right"
            >
              <div className="space-y-4">
                <Input label="Display name" defaultValue="Alice Johnson" />
                <Switch label="Email notifications" defaultChecked />
                <Switch label="Dark mode" />
              </div>
            </Drawer>
          </Section>

          <Section title="Dropdown Menu">
            <Row label="Context menu">
              <DropdownMenu
                trigger={<Button variant="secondary" size="sm">Actions ▾</Button>}
                items={[
                  { key: 'edit', label: 'Edit', icon: <Calendar size={14} /> },
                  { key: 'dup', label: 'Duplicate', shortcut: '⌘D' },
                  { key: 'sep1', type: 'separator' },
                  { key: 'del', label: 'Delete', danger: true },
                ]}
              />
              <Popover
                trigger={<Button variant="secondary" size="sm">Popover ▾</Button>}
              >
                <div className="text-sm text-[var(--color-fg-muted)]">
                  <p className="font-medium text-[var(--color-fg-base)] mb-2">Quick note</p>
                  <p>Popovers float above the page and close on outside click or Escape.</p>
                </div>
              </Popover>
            </Row>
          </Section>
        </TabPanel>

        {/* Forms */}
        <TabPanel tabKey="forms" activeKey={activeTab}>
          <Section title="Text inputs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
              <Input label="Text input" placeholder="Enter text…" />
              <Input label="With prefix" prefix="$" placeholder="0.00" />
              <Input label="With suffix" suffix=".00" placeholder="Amount" />
              <Input label="Error state" error="This field is required" value="" onChange={() => {}} />
              <Input label="Disabled" disabled defaultValue="Cannot edit" />
              <Textarea label="Textarea" placeholder="Write a description…" autoResize />
            </div>
          </Section>

          <Section title="Select">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
              <Select
                label="Country"
                placeholder="Select country…"
                options={[
                  { value: 'us', label: 'United States' },
                  { value: 'gb', label: 'United Kingdom' },
                  { value: 'ca', label: 'Canada' },
                  { value: 'au', label: 'Australia' },
                ]}
              />
              <Select
                label="With error"
                error="Please select a value"
                options={[{ value: 'a', label: 'Option A' }]}
              />
            </div>
          </Section>

          <Section title="Multi-select">
            <div className="max-w-sm">
              <MultiSelect
                label="Technologies"
                placeholder="Select technologies…"
                value={multiVals}
                onChange={setMultiVals}
                options={[
                  { value: 'react', label: 'React' },
                  { value: 'next', label: 'Next.js' },
                  { value: 'ts', label: 'TypeScript' },
                  { value: 'tailwind', label: 'Tailwind CSS' },
                  { value: 'prisma', label: 'Prisma' },
                ]}
              />
            </div>
          </Section>

          <Section title="Checkbox, Radio, Switch">
            <div className="space-y-4">
              <Row label="Checkbox">
                <Checkbox
                  label="I agree to the terms"
                  checked={checkboxChecked}
                  onChange={setCheckboxChecked}
                />
                <Checkbox label="Indeterminate" indeterminate />
                <Checkbox label="Disabled" disabled />
              </Row>
              <RadioGroup
                label="Notification frequency"
                value={radioVal}
                onChange={setRadioVal}
                options={[
                  { value: 'option1', label: 'Immediately', description: 'Get notified as events happen' },
                  { value: 'option2', label: 'Daily digest', description: 'Once per day at 9 AM' },
                  { value: 'option3', label: 'Weekly', description: 'Every Monday morning' },
                ]}
              />
              <Row label="Switch">
                <Switch label="Enable notifications" checked={switchOn} onChange={setSwitchOn} />
                <Switch label="Dark mode" size="sm" />
                <Switch label="Disabled" disabled checked />
              </Row>
            </div>
          </Section>

          <Section title="Date Picker">
            <div className="max-w-xs">
              <DatePicker
                label="Select a date"
                value={selectedDate}
                onChange={setSelectedDate}
                placeholder="Pick a date"
              />
            </div>
          </Section>

          <Section title="File Upload">
            <FileUpload
              label="Drag and drop files here"
              hint="PNG, JPG, PDF up to 5MB"
              accept="image/*,.pdf"
              maxSize={5 * 1024 * 1024}
              multiple
            />
          </Section>

          <Section title="Rating">
            <Row label="Star rating">
              <Rating value={rating} onChange={setRating} max={5} />
              <Rating value={4.5} readOnly max={5} halfStar />
              <Rating value={3} readOnly max={10} size="sm" />
            </Row>
          </Section>

          <Section title="Color Picker">
            <div className="max-w-xs">
              <ColorPicker label="Brand color" value={color} onChange={setColor} />
            </div>
          </Section>
        </TabPanel>

        {/* Data Display */}
        <TabPanel tabKey="data" activeKey={activeTab}>
          <Section title="Stat cards">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Monthly revenue" value="$48,250" trend={12.5} trendLabel="vs last month" icon={<Database size={16} />} />
              <StatCard label="Active users" value="1,847" trend={-3.2} trendLabel="vs yesterday" />
              <StatCard label="Uptime" value="99.98%" trend={0} trendLabel="30d avg" />
              <StatCard label="Open tickets" value="23" trend={8.3} trendLabel="this week" icon={<Bell size={16} />} />
            </div>
          </Section>

          <Section title="Progress">
            <div className="space-y-4 max-w-sm">
              <Progress value={72} label="Storage used" showValue color="primary" />
              <Progress value={45} label="Budget spent" showValue color="warning" size="sm" />
              <Progress value={91} label="Tasks complete" showValue color="success" size="lg" />
              <Progress value={33} label="Danger zone" showValue color="danger" />
            </div>
            <Row label="Ring variant">
              <Progress variant="ring" value={75} label="CPU" showValue color="primary" />
              <Progress variant="ring" value={45} label="Memory" showValue color="warning" size="lg" />
            </Row>
          </Section>

          <Section title="Timeline">
            <div className="max-w-sm">
              <Timeline
                steps={[
                  { key: 'created', title: 'Order created', status: 'done', timestamp: '9:00 AM', description: 'Customer placed order #4821' },
                  { key: 'payment', title: 'Payment confirmed', status: 'done', timestamp: '9:03 AM' },
                  { key: 'processing', title: 'Processing', status: 'active', timestamp: '9:15 AM', description: 'Preparing your items for dispatch' },
                  { key: 'shipping', title: 'Shipping', status: 'pending' },
                  { key: 'delivered', title: 'Delivered', status: 'pending' },
                ]}
              />
            </div>
          </Section>

          <Section title="Empty State">
            <Card>
              <EmptyState
                icon={<Star size={40} />}
                title="No favorites yet"
                description="Star items you want to come back to and they'll appear here."
                action={<Button size="sm">Browse items</Button>}
              />
            </Card>
          </Section>

          <Section title="Skeleton">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SkeletonCard />
              <div className="space-y-3 p-5 border border-[var(--color-border)] rounded-[var(--radius-lg)]">
                <Skeleton height={20} className="w-1/2" />
                <Skeleton height={12} className="w-full" />
                <Skeleton height={12} className="w-5/6" />
                <Skeleton height={12} className="w-4/6" />
                <div className="flex gap-2 mt-4">
                  <Skeleton height={32} className="w-20" />
                  <Skeleton height={32} className="w-20" />
                </div>
              </div>
            </div>
          </Section>
        </TabPanel>

        {/* Feedback */}
        <TabPanel tabKey="feedback" activeKey={activeTab}>
          <Section title="Alert banners">
            <div className="space-y-3 max-w-2xl">
              <Alert variant="success" title="Changes saved" dismissible>
                Your profile has been updated successfully.
              </Alert>
              <Alert variant="warning" title="Storage nearly full">
                You have used 92% of your 10GB storage quota.
              </Alert>
              <Alert variant="danger" title="Payment failed" dismissible>
                Your card ending in 4242 was declined. Please update your payment method.
              </Alert>
              <Alert variant="info">
                A new version of the platform is available. Refresh to update.
              </Alert>
            </div>
          </Section>

          <Section title="Toast notifications">
            <ToastDemo />
          </Section>
        </TabPanel>

        {/* Navigation */}
        <TabPanel tabKey="nav" activeKey={activeTab}>
          <Section title="Breadcrumb">
            <div className="space-y-4">
              <Breadcrumb
                items={[
                  { key: 'home', label: 'Home', href: '#' },
                  { key: 'platform', label: 'Platform', href: '#' },
                  { key: 'design', label: 'Design System', href: '#' },
                  { key: 'current', label: 'Components' },
                ]}
              />
              <Breadcrumb
                maxItems={3}
                items={[
                  { key: 'h', label: 'Home', href: '#' },
                  { key: 'a', label: 'Section A', href: '#' },
                  { key: 'b', label: 'Section B', href: '#' },
                  { key: 'c', label: 'Section C', href: '#' },
                  { key: 'd', label: 'Current page' },
                ]}
              />
            </div>
          </Section>

          <Section title="Pagination">
            <div className="space-y-6">
              <Pagination page={page} totalPages={15} onChange={setPage} />
              <p className="text-xs text-[var(--color-fg-muted)]">Current page: {page}</p>
            </div>
          </Section>
        </TabPanel>

        {/* Table */}
        <TabPanel tabKey="table" activeKey={activeTab}>
          <Section title="Data table" description="Sortable columns, row selection, sticky header">
            <Table
              columns={[
                { key: 'name', header: 'Name', sortable: true, width: 200 },
                { key: 'role', header: 'Role', sortable: true, width: 140 },
                { key: 'status', header: 'Status', width: 120, render: (v) => statusBadge[String(v)] },
                { key: 'joined', header: 'Joined', sortable: true, width: 130 },
              ]}
              data={tableData}
              rowKey="id"
              selectable
              stickyHeader
              maxHeight={360}
              onRowClick={(row) => console.log('row click:', row)}
            />
          </Section>

          <Section title="Loading state">
            <Table
              columns={[
                { key: 'name', header: 'Name', width: 200 },
                { key: 'role', header: 'Role', width: 140 },
                { key: 'status', header: 'Status', width: 120 },
              ]}
              data={[]}
              loading
            />
          </Section>

          <Section title="Empty state">
            <Table
              columns={[
                { key: 'name', header: 'Name' },
                { key: 'role', header: 'Role' },
              ]}
              data={[]}
              emptyState={
                <EmptyState
                  icon={<Users size={32} />}
                  title="No team members"
                  description="Invite people to your workspace to get started."
                  action={<Button size="sm">Invite member</Button>}
                />
              }
            />
          </Section>
        </TabPanel>

        {/* New Wave 1 components */}
        <TabPanel tabKey="newwave1" activeKey={activeTab}>
          <Section title="Stepper" description="Horizontal step progress indicator">
            <Stepper
              steps={[
                { key: 's1', label: 'Account info', description: 'Basic details' },
                { key: 's2', label: 'Team setup', description: 'Invite members' },
                { key: 's3', label: 'Integrations', description: 'Connect tools' },
                { key: 's4', label: 'Go live' },
              ]}
              activeKey="s2"
              orientation="horizontal"
            />
            <div className="mt-8 max-w-xs">
              <Stepper
                steps={[
                  { key: 's1', label: 'Account info', description: 'Basic details' },
                  { key: 's2', label: 'Team setup', description: 'Invite members' },
                  { key: 's3', label: 'Integrations', description: 'Connect tools' },
                  { key: 's4', label: 'Go live' },
                ]}
                activeKey="s2"
                orientation="vertical"
              />
            </div>
          </Section>

          <Section title="CommandPalette" description="Cmd+K searchable command launcher">
            <CommandPaletteDemo />
          </Section>

          <Section title="Label + FormField">
            <Row label="Label standalone">
              <Label>Default label</Label>
              <Label required>Required field</Label>
            </Row>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mt-4">
              <FormField label="Username" required hint="Lowercase letters and numbers only">
                <Input placeholder="johndoe" />
              </FormField>
              <FormField label="Email" error="Please enter a valid email">
                <Input type="email" placeholder="you@example.com" />
              </FormField>
            </div>
          </Section>

          <Section title="Design Tokens" description="Semantic CSS variables via tokens.css">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { name: 'primary', var: '--primary' },
                { name: 'accent', var: '--accent' },
                { name: 'success', var: '--success' },
                { name: 'warning', var: '--warning' },
                { name: 'destructive', var: '--destructive' },
                { name: 'muted', var: '--muted' },
                { name: 'card', var: '--card' },
                { name: 'border', var: '--border' },
              ].map(({ name, var: v }) => (
                <div key={name} className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded border border-[var(--color-border)] shrink-0"
                    style={{ background: `var(${v})` }}
                  />
                  <div>
                    <p className="text-xs font-mono text-[var(--color-fg-base)]">{name}</p>
                    <p className="text-xs text-[var(--color-fg-muted)] font-mono">{v}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </TabPanel>

      </div>
    </div>
  );
}

export default function UIDevPage() {
  return (
    <ToastProvider>
      <Catalogue />
    </ToastProvider>
  );
}
