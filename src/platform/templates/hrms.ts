/**
 * HRMS (Human Resource Management System) template for Novo platform.
 */

import type { AppTemplate } from './types';

export const hrmsTemplate: AppTemplate = {
  id: 'hrms-starter',
  name: 'Human Resource Management System',
  description: 'A full-featured HRMS for managing employees, leaves, attendance, payroll, and performance.',
  category: 'hrms',
  industry: 'Human Resources',
  icon: '\u{1F465}',
  color: '#10b981',
  features: [
    'Employee directory with org chart',
    'Leave management with multi-level approvals',
    'Attendance tracking with auto hours calculation',
    'Payroll processing with formula-based net pay',
    'Performance review cycles with ratings',
    'Department budgeting',
  ],
  createdAt: '2024-01-01T00:00:00.000Z',
  bundle: {
    schemaVersion: '1.0',
    exportedAt: '2024-01-01T00:00:00.000Z',
    app: {
      id: 'hrms-starter',
      name: 'Human Resource Management System',
      description: 'A full-featured HRMS for employees, leaves, attendance, payroll, and performance.',
      icon: '\u{1F465}',
      color: '#10b981',
    },
    schema: {
      tables: [
        {
          id: 'tbl_departments',
          name: 'Departments',
          fields: [
            { id: 'fld_name', name: 'name', type: 'text', required: true },
            { id: 'fld_head', name: 'head', type: 'user' },
            { id: 'fld_budget', name: 'budget', type: 'currency' },
          ],
        },
        {
          id: 'tbl_employees',
          name: 'Employees',
          fields: [
            { id: 'fld_name', name: 'name', type: 'text', required: true },
            { id: 'fld_email', name: 'email', type: 'email', required: true },
            { id: 'fld_phone', name: 'phone', type: 'phone' },
            { id: 'fld_department', name: 'department', type: 'relation', relatedTableId: 'tbl_departments' },
            { id: 'fld_designation', name: 'designation', type: 'text' },
            { id: 'fld_join_date', name: 'join_date', type: 'date' },
            { id: 'fld_status', name: 'status', type: 'dropdown', options: ['active', 'on_leave', 'resigned'] },
            { id: 'fld_salary', name: 'salary', type: 'currency' },
            { id: 'fld_manager', name: 'manager', type: 'relation', relatedTableId: 'tbl_employees' },
          ],
        },
        {
          id: 'tbl_leave_requests',
          name: 'Leave_Requests',
          fields: [
            { id: 'fld_employee', name: 'employee', type: 'relation', relatedTableId: 'tbl_employees' },
            { id: 'fld_type', name: 'type', type: 'dropdown', options: ['casual', 'sick', 'earned'] },
            { id: 'fld_from_date', name: 'from_date', type: 'date', required: true },
            { id: 'fld_to_date', name: 'to_date', type: 'date', required: true },
            { id: 'fld_days', name: 'days', type: 'formula', formula: 'DAYS(to_date, from_date) + 1' },
            { id: 'fld_reason', name: 'reason', type: 'long_text' },
            { id: 'fld_status', name: 'status', type: 'dropdown', options: ['pending', 'approved', 'rejected'] },
          ],
        },
        {
          id: 'tbl_attendance',
          name: 'Attendance',
          fields: [
            { id: 'fld_employee', name: 'employee', type: 'relation', relatedTableId: 'tbl_employees' },
            { id: 'fld_date', name: 'date', type: 'date', required: true },
            { id: 'fld_check_in', name: 'check_in', type: 'time' },
            { id: 'fld_check_out', name: 'check_out', type: 'time' },
            { id: 'fld_hours_worked', name: 'hours_worked', type: 'formula', formula: 'TIMEDIFF(check_out, check_in)' },
            { id: 'fld_status', name: 'status', type: 'dropdown', options: ['present', 'absent', 'half_day', 'on_leave'] },
          ],
        },
        {
          id: 'tbl_payroll',
          name: 'Payroll',
          fields: [
            { id: 'fld_employee', name: 'employee', type: 'relation', relatedTableId: 'tbl_employees' },
            { id: 'fld_month', name: 'month', type: 'text', required: true },
            { id: 'fld_basic', name: 'basic', type: 'currency' },
            { id: 'fld_allowances', name: 'allowances', type: 'currency' },
            { id: 'fld_deductions', name: 'deductions', type: 'currency' },
            { id: 'fld_net_pay', name: 'net_pay', type: 'formula', formula: 'basic + allowances - deductions' },
            { id: 'fld_status', name: 'status', type: 'dropdown', options: ['draft', 'processed', 'paid'] },
          ],
        },
        {
          id: 'tbl_performance_reviews',
          name: 'Performance_Reviews',
          fields: [
            { id: 'fld_employee', name: 'employee', type: 'relation', relatedTableId: 'tbl_employees' },
            { id: 'fld_period', name: 'period', type: 'text', required: true },
            { id: 'fld_rating', name: 'rating', type: 'number', min: 1, max: 5 },
            { id: 'fld_goals', name: 'goals', type: 'long_text' },
            { id: 'fld_comments', name: 'comments', type: 'long_text' },
            { id: 'fld_reviewer', name: 'reviewer', type: 'user' },
          ],
        },
      ],
      relations: [
        { from: 'tbl_employees', to: 'tbl_departments', via: 'fld_department' },
        { from: 'tbl_employees', to: 'tbl_employees', via: 'fld_manager' },
        { from: 'tbl_leave_requests', to: 'tbl_employees', via: 'fld_employee' },
        { from: 'tbl_attendance', to: 'tbl_employees', via: 'fld_employee' },
        { from: 'tbl_payroll', to: 'tbl_employees', via: 'fld_employee' },
        { from: 'tbl_performance_reviews', to: 'tbl_employees', via: 'fld_employee' },
      ],
      childTableConfigs: [],
    },
    ui: {
      pages: [
        {
          id: 'pg_employee_directory',
          name: 'Employee Directory',
          type: 'list',
          tableId: 'tbl_employees',
          views: ['list', 'org_chart'],
          icon: '\u{1F464}',
        },
        {
          id: 'pg_leave_management',
          name: 'Leave Management',
          type: 'list',
          tableId: 'tbl_leave_requests',
          views: ['list', 'calendar'],
          icon: '\u{1F5D3}️',
        },
        {
          id: 'pg_attendance',
          name: 'Attendance Tracker',
          type: 'list',
          tableId: 'tbl_attendance',
          icon: '⏰',
        },
        {
          id: 'pg_payroll',
          name: 'Payroll Processing',
          type: 'list',
          tableId: 'tbl_payroll',
          adminOnly: true,
          icon: '\u{1F4B0}',
        },
        {
          id: 'pg_performance',
          name: 'Performance Dashboard',
          type: 'report',
          widgets: [
            { type: 'metric', label: 'Total Employees', tableId: 'tbl_employees', agg: 'count' },
            { type: 'metric', label: 'Avg Rating', tableId: 'tbl_performance_reviews', field: 'rating', agg: 'avg' },
            { type: 'chart', label: 'Leave by Type', tableId: 'tbl_leave_requests', groupBy: 'type', agg: 'count', chartType: 'pie' },
          ],
          icon: '\u{1F4CA}',
        },
      ],
      navItems: [
        { label: 'Employees', pageId: 'pg_employee_directory', icon: '\u{1F464}' },
        { label: 'Leave', pageId: 'pg_leave_management', icon: '\u{1F5D3}️' },
        { label: 'Attendance', pageId: 'pg_attendance', icon: '⏰' },
        { label: 'Payroll', pageId: 'pg_payroll', icon: '\u{1F4B0}' },
        { label: 'Performance', pageId: 'pg_performance', icon: '\u{1F4CA}' },
      ],
    },
    logic: {
      workflows: [
        {
          id: 'wf_leave_approval',
          name: 'Leave Request Multi-level Approval',
          trigger: { type: 'record_created', tableId: 'tbl_leave_requests' },
          actions: [
            {
              type: 'start_approval',
              approvers: ['{{employee.manager}}', '{{employee.department.head}}'],
              sequential: true,
            },
          ],
        },
        {
          id: 'wf_leave_approved_update',
          name: 'Update Leave Balance on Approval',
          trigger: {
            type: 'field_updated',
            tableId: 'tbl_leave_requests',
            field: 'status',
            condition: { op: 'eq', value: 'approved' },
          },
          actions: [
            {
              type: 'send_notification',
              to: '{{employee.email}}',
              message: 'Your leave request from {{from_date}} to {{to_date}} has been approved.',
            },
          ],
        },
        {
          id: 'wf_monthly_payroll',
          name: 'Monthly Payroll Calculation',
          trigger: { type: 'schedule', cron: '0 9 1 * *' },
          actions: [
            {
              type: 'run_script',
              scriptId: 'scr_payroll_calc',
            },
          ],
        },
      ],
      approvalFlows: [
        {
          id: 'af_leave',
          name: 'Leave Approval Flow',
          tableId: 'tbl_leave_requests',
          steps: [
            { approver: 'manager', action: 'approve_or_reject' },
            { approver: 'department_head', action: 'approve_or_reject', condition: 'days > 3' },
          ],
        },
      ],
      schedules: [
        { id: 'sch_payroll', name: 'Monthly Payroll Trigger', cron: '0 9 1 * *', workflowId: 'wf_monthly_payroll' },
      ],
      accessRules: [
        { role: 'admin', permissions: ['read', 'write', 'delete'], tables: ['*'] },
        { role: 'hr_manager', permissions: ['read', 'write'], tables: ['tbl_employees', 'tbl_leave_requests', 'tbl_attendance', 'tbl_payroll', 'tbl_performance_reviews'] },
        { role: 'manager', permissions: ['read', 'write'], tables: ['tbl_leave_requests', 'tbl_attendance', 'tbl_performance_reviews'] },
        { role: 'employee', permissions: ['read'], tables: ['tbl_employees', 'tbl_departments'] },
        { role: 'employee', permissions: ['read', 'write'], tables: ['tbl_leave_requests', 'tbl_attendance'], ownRecordsOnly: true },
      ],
      fieldPermissions: [],
    },
    scripts: [
      {
        id: 'scr_payroll_calc',
        name: 'Monthly Payroll Calculator',
        code: `
// Calculate payroll for all active employees for current month
const employees = await db.query('tbl_employees', { status: 'active' });
const month = new Date().toISOString().slice(0, 7);
for (const emp of employees) {
  await db.create('tbl_payroll', {
    employee: emp.id,
    month,
    basic: emp.salary,
    allowances: emp.salary * 0.2,
    deductions: emp.salary * 0.1,
    status: 'draft',
  });
}
        `.trim(),
        testCases: [],
      },
    ],
    integrations: {
      pdfTemplates: [
        { id: 'pdf_payslip', name: 'Payslip', tableId: 'tbl_payroll', template: 'payslip-template' },
        { id: 'pdf_offer_letter', name: 'Offer Letter', tableId: 'tbl_employees', template: 'offer-letter-template' },
      ],
      emailTemplates: [
        { id: 'email_leave_approved', name: 'Leave Approved', subject: 'Leave Request Approved' },
        { id: 'email_leave_rejected', name: 'Leave Rejected', subject: 'Leave Request Rejected' },
      ],
      stockConfigs: [],
      fulfilmentConfigs: [],
      convertToConfigs: [],
      bomHeaders: [],
      restConnectors: [],
    },
    marketplace: {
      id: 'hrms-starter',
      name: 'Human Resource Management System',
      category: 'hrms',
      tags: ['hr', 'employees', 'payroll', 'leave', 'attendance', 'performance'],
      screenshots: [],
    },
  },
};
