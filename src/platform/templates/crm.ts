/**
 * CRM (Customer Relationship Management) template for Novo platform.
 */

import type { AppTemplate } from './types';

export const crmTemplate: AppTemplate = {
  id: 'crm-starter',
  name: 'Customer Relationship Management',
  description: 'A powerful CRM for managing contacts, deals, pipeline, and customer activities.',
  category: 'crm',
  industry: 'Sales & Marketing',
  icon: '\u{1F91D}',
  color: '#f59e0b',
  features: [
    'Contact & company management with tagging',
    'Deal pipeline with Kanban view',
    'Activity timeline (calls, emails, meetings)',
    'Quote builder with line items',
    'Pipeline value & conversion rate dashboard',
    'Automated follow-up reminders',
  ],
  createdAt: '2024-01-01T00:00:00.000Z',
  bundle: {
    schemaVersion: '1.0',
    exportedAt: '2024-01-01T00:00:00.000Z',
    app: {
      id: 'crm-starter',
      name: 'Customer Relationship Management',
      description: 'A powerful CRM for managing contacts, deals, pipeline, and activities.',
      icon: '\u{1F91D}',
      color: '#f59e0b',
    },
    schema: {
      tables: [
        {
          id: 'tbl_companies',
          name: 'Companies',
          fields: [
            { id: 'fld_name', name: 'name', type: 'text', required: true },
            { id: 'fld_industry', name: 'industry', type: 'text' },
            { id: 'fld_size', name: 'size', type: 'dropdown', options: ['1-10', '11-50', '51-200', '201-500', '500+'] },
            { id: 'fld_website', name: 'website', type: 'url' },
          ],
        },
        {
          id: 'tbl_contacts',
          name: 'Contacts',
          fields: [
            { id: 'fld_name', name: 'name', type: 'text', required: true },
            { id: 'fld_email', name: 'email', type: 'email' },
            { id: 'fld_phone', name: 'phone', type: 'phone' },
            { id: 'fld_company', name: 'company', type: 'relation', relatedTableId: 'tbl_companies' },
            { id: 'fld_source', name: 'source', type: 'dropdown', options: ['website', 'referral', 'cold_outreach', 'event', 'social_media', 'other'] },
            { id: 'fld_tags', name: 'tags', type: 'multi_select', options: ['hot', 'warm', 'cold', 'vip', 'prospect', 'customer'] },
            { id: 'fld_owner', name: 'owner', type: 'user' },
          ],
        },
        {
          id: 'tbl_deals',
          name: 'Deals',
          fields: [
            { id: 'fld_title', name: 'title', type: 'text', required: true },
            { id: 'fld_company', name: 'company', type: 'relation', relatedTableId: 'tbl_companies' },
            { id: 'fld_contact', name: 'contact', type: 'relation', relatedTableId: 'tbl_contacts' },
            { id: 'fld_value', name: 'value', type: 'currency' },
            { id: 'fld_stage', name: 'stage', type: 'dropdown', options: ['lead', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'] },
            { id: 'fld_close_date', name: 'close_date', type: 'date' },
            { id: 'fld_probability', name: 'probability', type: 'number', min: 0, max: 100 },
            { id: 'fld_owner', name: 'owner', type: 'user' },
          ],
        },
        {
          id: 'tbl_activities',
          name: 'Activities',
          fields: [
            { id: 'fld_deal', name: 'deal', type: 'relation', relatedTableId: 'tbl_deals' },
            { id: 'fld_type', name: 'type', type: 'dropdown', options: ['call', 'email', 'meeting', 'demo'] },
            { id: 'fld_date', name: 'date', type: 'datetime' },
            { id: 'fld_notes', name: 'notes', type: 'long_text' },
            { id: 'fld_outcome', name: 'outcome', type: 'text' },
            { id: 'fld_next_action', name: 'next_action', type: 'text' },
          ],
        },
        {
          id: 'tbl_quotes',
          name: 'Quotes',
          fields: [
            { id: 'fld_deal', name: 'deal', type: 'relation', relatedTableId: 'tbl_deals' },
            { id: 'fld_total', name: 'total', type: 'rollup', sourceTableId: 'tbl_quote_items', sourceField: 'amount', agg: 'sum' },
            { id: 'fld_status', name: 'status', type: 'dropdown', options: ['draft', 'sent', 'accepted', 'rejected', 'expired'] },
            { id: 'fld_valid_until', name: 'valid_until', type: 'date' },
          ],
        },
        {
          id: 'tbl_quote_items',
          name: 'Quote_Items',
          parentTableId: 'tbl_quotes',
          fields: [
            { id: 'fld_quote', name: 'quote', type: 'relation', relatedTableId: 'tbl_quotes' },
            { id: 'fld_product', name: 'product', type: 'text', required: true },
            { id: 'fld_qty', name: 'qty', type: 'number' },
            { id: 'fld_rate', name: 'rate', type: 'currency' },
            { id: 'fld_discount', name: 'discount', type: 'number' },
            { id: 'fld_amount', name: 'amount', type: 'formula', formula: 'qty * rate * (1 - discount/100)' },
          ],
        },
      ],
      relations: [
        { from: 'tbl_contacts', to: 'tbl_companies', via: 'fld_company' },
        { from: 'tbl_deals', to: 'tbl_companies', via: 'fld_company' },
        { from: 'tbl_deals', to: 'tbl_contacts', via: 'fld_contact' },
        { from: 'tbl_activities', to: 'tbl_deals', via: 'fld_deal' },
        { from: 'tbl_quotes', to: 'tbl_deals', via: 'fld_deal' },
        { from: 'tbl_quote_items', to: 'tbl_quotes', via: 'fld_quote' },
      ],
      childTableConfigs: [
        { parentTableId: 'tbl_quotes', childTableId: 'tbl_quote_items', foreignKey: 'fld_quote' },
      ],
    },
    ui: {
      pages: [
        {
          id: 'pg_contacts',
          name: 'Contacts',
          type: 'list',
          tableId: 'tbl_contacts',
          views: ['list', 'kanban'],
          kanbanField: 'tags',
          icon: '\u{1F4C7}',
        },
        {
          id: 'pg_deal_pipeline',
          name: 'Deal Pipeline',
          type: 'list',
          tableId: 'tbl_deals',
          views: ['kanban', 'list'],
          kanbanField: 'stage',
          icon: '\u{1F4BC}',
        },
        {
          id: 'pg_contact_detail',
          name: 'Contact Detail',
          type: 'detail',
          tableId: 'tbl_contacts',
          relatedPanels: ['tbl_deals', 'tbl_activities'],
          icon: '\u{1F464}',
        },
        {
          id: 'pg_company_detail',
          name: 'Company Detail',
          type: 'detail',
          tableId: 'tbl_companies',
          relatedPanels: ['tbl_contacts', 'tbl_deals'],
          icon: '\u{1F3E2}',
        },
        {
          id: 'pg_dashboard',
          name: 'Dashboard',
          type: 'report',
          widgets: [
            { type: 'metric', label: 'Pipeline Value', tableId: 'tbl_deals', field: 'value', agg: 'sum', filter: { stage: { not: ['closed_won', 'closed_lost'] } } },
            { type: 'metric', label: 'Won This Month', tableId: 'tbl_deals', field: 'value', agg: 'sum', filter: { stage: 'closed_won' } },
            { type: 'metric', label: 'Activities Due', tableId: 'tbl_activities', agg: 'count', filter: { date: { lte: '{{today}}' } } },
            { type: 'chart', label: 'Deals by Stage', tableId: 'tbl_deals', groupBy: 'stage', agg: 'count', chartType: 'bar' },
          ],
          icon: '\u{1F4CA}',
        },
      ],
      navItems: [
        { label: 'Dashboard', pageId: 'pg_dashboard', icon: '\u{1F4CA}' },
        { label: 'Contacts', pageId: 'pg_contacts', icon: '\u{1F4C7}' },
        { label: 'Pipeline', pageId: 'pg_deal_pipeline', icon: '\u{1F4BC}' },
      ],
    },
    logic: {
      workflows: [
        {
          id: 'wf_deal_stage_notify',
          name: 'Notify Owner on Stage Change',
          trigger: {
            type: 'field_updated',
            tableId: 'tbl_deals',
            field: 'stage',
          },
          actions: [
            {
              type: 'send_notification',
              to: '{{owner.email}}',
              message: 'Deal "{{title}}" moved to {{stage}}.',
            },
          ],
        },
        {
          id: 'wf_overdue_followup',
          name: 'Overdue Follow-up Reminder',
          trigger: { type: 'schedule', cron: '0 9 * * 1-5' },
          actions: [
            {
              type: 'query_and_notify',
              tableId: 'tbl_activities',
              filter: { next_action_date: { lte: '{{today}}', ne: null } },
              notify: {
                to: '{{deal.owner.email}}',
                message: 'Reminder: Follow up on "{{deal.title}}" — {{next_action}}',
              },
            },
          ],
        },
        {
          id: 'wf_quote_sent_followup',
          name: 'Schedule Follow-up After Quote Sent',
          trigger: {
            type: 'field_updated',
            tableId: 'tbl_quotes',
            field: 'status',
            condition: { op: 'eq', value: 'sent' },
          },
          actions: [
            {
              type: 'create_record',
              tableId: 'tbl_activities',
              fields: {
                deal: '{{record.deal}}',
                type: 'email',
                date: '{{addDays(now, 3)}}',
                notes: 'Follow up on quote sent',
                next_action: 'Check if quote was reviewed',
              },
            },
          ],
        },
      ],
      approvalFlows: [],
      schedules: [
        { id: 'sch_overdue_check', name: 'Daily Overdue Follow-up Check', cron: '0 9 * * 1-5', workflowId: 'wf_overdue_followup' },
      ],
      accessRules: [
        { role: 'admin', permissions: ['read', 'write', 'delete'], tables: ['*'] },
        { role: 'sales_manager', permissions: ['read', 'write'], tables: ['*'] },
        { role: 'sales_rep', permissions: ['read', 'write'], tables: ['tbl_contacts', 'tbl_companies', 'tbl_deals', 'tbl_activities', 'tbl_quotes', 'tbl_quote_items'], ownRecordsOnly: true },
      ],
      fieldPermissions: [],
    },
    scripts: [],
    integrations: {
      pdfTemplates: [
        { id: 'pdf_quote', name: 'Quote / Proposal', tableId: 'tbl_quotes', template: 'quote-template' },
      ],
      emailTemplates: [
        { id: 'email_quote_sent', name: 'Quote Sent', subject: 'Your Quote from {{company.name}}' },
        { id: 'email_deal_won', name: 'Deal Won', subject: 'Great news! Deal closed.' },
      ],
      stockConfigs: [],
      fulfilmentConfigs: [],
      convertToConfigs: [],
      bomHeaders: [],
      restConnectors: [],
    },
    marketplace: {
      id: 'crm-starter',
      name: 'Customer Relationship Management',
      category: 'crm',
      tags: ['sales', 'crm', 'deals', 'contacts', 'pipeline', 'quotes'],
      screenshots: [],
    },
  },
};
