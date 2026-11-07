/**
 * LMS (Learning Management System) template for Novo platform.
 */

import type { AppTemplate } from './types';

export const lmsTemplate: AppTemplate = {
  id: 'lms-starter',
  name: 'Learning Management System',
  description: 'A complete LMS for managing courses, enrollments, and certifications with built-in progress tracking.',
  category: 'lms',
  industry: 'Education & Training',
  icon: '\u{1F393}',
  color: '#6366f1',
  features: [
    'Course catalog with categories and filters',
    'Module-based learning with video, PDF, quiz, and text content',
    'Enrollment tracking with progress percentages',
    'Automatic certificate generation on completion',
    'WhatsApp & email notifications',
    'Admin dashboard with reports',
  ],
  createdAt: '2024-01-01T00:00:00.000Z',
  bundle: {
    schemaVersion: '1.0',
    exportedAt: '2024-01-01T00:00:00.000Z',
    app: {
      id: 'lms-starter',
      name: 'Learning Management System',
      description: 'A complete LMS for managing courses, enrollments, and certifications.',
      icon: '\u{1F393}',
      color: '#6366f1',
    },
    schema: {
      tables: [
        {
          id: 'tbl_courses',
          name: 'Courses',
          fields: [
            { id: 'fld_title', name: 'title', type: 'text', required: true },
            { id: 'fld_description', name: 'description', type: 'long_text' },
            { id: 'fld_category', name: 'category', type: 'text' },
            { id: 'fld_instructor', name: 'instructor', type: 'user' },
            { id: 'fld_duration_hours', name: 'duration_hours', type: 'number' },
            { id: 'fld_status', name: 'status', type: 'dropdown', options: ['draft', 'published'] },
            { id: 'fld_thumbnail', name: 'thumbnail', type: 'file' },
          ],
        },
        {
          id: 'tbl_modules',
          name: 'Modules',
          fields: [
            { id: 'fld_course', name: 'course', type: 'relation', relatedTableId: 'tbl_courses' },
            { id: 'fld_title', name: 'title', type: 'text', required: true },
            { id: 'fld_order', name: 'order', type: 'number' },
            { id: 'fld_content_type', name: 'content_type', type: 'dropdown', options: ['video', 'pdf', 'quiz', 'text'] },
            { id: 'fld_content_url', name: 'content_url', type: 'url' },
            { id: 'fld_duration_min', name: 'duration_min', type: 'number' },
          ],
        },
        {
          id: 'tbl_enrollments',
          name: 'Enrollments',
          fields: [
            { id: 'fld_course', name: 'course', type: 'relation', relatedTableId: 'tbl_courses' },
            { id: 'fld_learner', name: 'learner', type: 'user' },
            { id: 'fld_enrolled_at', name: 'enrolled_at', type: 'datetime' },
            { id: 'fld_status', name: 'status', type: 'dropdown', options: ['active', 'completed', 'dropped'] },
            {
              id: 'fld_progress_pct',
              name: 'progress_pct',
              type: 'formula',
              formula: 'ROUND((COUNT(completions) / COUNT(course.modules)) * 100, 0)',
            },
          ],
        },
        {
          id: 'tbl_completions',
          name: 'Completions',
          fields: [
            { id: 'fld_enrollment', name: 'enrollment', type: 'relation', relatedTableId: 'tbl_enrollments' },
            { id: 'fld_module', name: 'module', type: 'relation', relatedTableId: 'tbl_modules' },
            { id: 'fld_completed_at', name: 'completed_at', type: 'datetime' },
            { id: 'fld_score', name: 'score', type: 'number' },
            { id: 'fld_passed', name: 'passed', type: 'dropdown', options: ['yes', 'no'] },
          ],
        },
        {
          id: 'tbl_certificates',
          name: 'Certificates',
          fields: [
            { id: 'fld_enrollment', name: 'enrollment', type: 'relation', relatedTableId: 'tbl_enrollments' },
            { id: 'fld_issued_at', name: 'issued_at', type: 'datetime' },
            { id: 'fld_certificate_number', name: 'certificate_number', type: 'auto_number' },
            { id: 'fld_valid_until', name: 'valid_until', type: 'date' },
          ],
        },
        {
          id: 'tbl_assessments',
          name: 'Assessments',
          fields: [
            { id: 'fld_module', name: 'module', type: 'relation', relatedTableId: 'tbl_modules' },
            { id: 'fld_title', name: 'title', type: 'text', required: true },
            { id: 'fld_passing_score', name: 'passing_score', type: 'number' },
            { id: 'fld_questions', name: 'questions', type: 'json' },
          ],
        },
      ],
      relations: [
        { from: 'tbl_modules', to: 'tbl_courses', via: 'fld_course' },
        { from: 'tbl_enrollments', to: 'tbl_courses', via: 'fld_course' },
        { from: 'tbl_completions', to: 'tbl_enrollments', via: 'fld_enrollment' },
        { from: 'tbl_completions', to: 'tbl_modules', via: 'fld_module' },
        { from: 'tbl_certificates', to: 'tbl_enrollments', via: 'fld_enrollment' },
        { from: 'tbl_assessments', to: 'tbl_modules', via: 'fld_module' },
      ],
      childTableConfigs: [],
    },
    ui: {
      pages: [
        {
          id: 'pg_catalog',
          name: 'Course Catalog',
          type: 'list',
          tableId: 'tbl_courses',
          filters: [{ field: 'status', op: 'eq', value: 'published' }],
          groupBy: 'category',
          icon: '\u{1F4DA}',
        },
        {
          id: 'pg_course_detail',
          name: 'Course Detail',
          type: 'detail',
          tableId: 'tbl_courses',
          relatedPanels: ['tbl_modules', 'tbl_enrollments'],
          icon: '\u{1F4D6}',
        },
        {
          id: 'pg_my_learning',
          name: 'My Learning',
          type: 'list',
          tableId: 'tbl_enrollments',
          filters: [{ field: 'learner', op: 'eq', value: '{{currentUser}}' }],
          icon: '\u{1F3AF}',
        },
        {
          id: 'pg_admin_courses',
          name: 'Admin: Course Builder',
          type: 'list',
          tableId: 'tbl_courses',
          adminOnly: true,
          icon: '\u{1F6E0}\uFE0F',
        },
        {
          id: 'pg_admin_enrollments',
          name: 'Admin: Enrollments',
          type: 'list',
          tableId: 'tbl_enrollments',
          adminOnly: true,
          icon: '\u{1F4CB}',
        },
        {
          id: 'pg_admin_reports',
          name: 'Admin: Reports',
          type: 'report',
          widgets: [
            { type: 'metric', label: 'Total Enrollments', tableId: 'tbl_enrollments', agg: 'count' },
            { type: 'metric', label: 'Avg Progress', tableId: 'tbl_enrollments', field: 'progress_pct', agg: 'avg' },
            { type: 'metric', label: 'Certificates Issued', tableId: 'tbl_certificates', agg: 'count' },
          ],
          adminOnly: true,
          icon: '\u{1F4CA}',
        },
      ],
      navItems: [
        { label: 'Course Catalog', pageId: 'pg_catalog', icon: '\u{1F4DA}' },
        { label: 'My Learning', pageId: 'pg_my_learning', icon: '\u{1F3AF}' },
        { label: 'Admin', children: [
          { label: 'Course Builder', pageId: 'pg_admin_courses' },
          { label: 'Enrollments', pageId: 'pg_admin_enrollments' },
          { label: 'Reports', pageId: 'pg_admin_reports' },
        ]},
      ],
    },
    logic: {
      workflows: [
        {
          id: 'wf_enrollment_welcome',
          name: 'Welcome Email on Enrollment',
          trigger: { type: 'record_created', tableId: 'tbl_enrollments' },
          actions: [
            {
              type: 'send_email',
              to: '{{learner.email}}',
              subject: 'Welcome to {{course.title}}!',
              body: 'Hi {{learner.name}}, you have been enrolled in {{course.title}}. Happy learning!',
            },
          ],
        },
        {
          id: 'wf_certificate_on_completion',
          name: 'Issue Certificate on Completion',
          trigger: {
            type: 'field_updated',
            tableId: 'tbl_enrollments',
            field: 'status',
            condition: { op: 'eq', value: 'completed' },
          },
          actions: [
            {
              type: 'create_record',
              tableId: 'tbl_certificates',
              fields: {
                enrollment: '{{record.id}}',
                issued_at: '{{now}}',
                valid_until: '{{addYears(now, 2)}}',
              },
            },
            {
              type: 'send_whatsapp',
              to: '{{record.learner.phone}}',
              message: 'Congratulations {{learner.name}}! You have completed {{course.title}} and your certificate is ready.',
            },
          ],
        },
      ],
      approvalFlows: [],
      schedules: [],
      accessRules: [
        { role: 'admin', permissions: ['read', 'write', 'delete'], tables: ['*'] },
        { role: 'instructor', permissions: ['read', 'write'], tables: ['tbl_courses', 'tbl_modules', 'tbl_assessments'] },
        { role: 'learner', permissions: ['read'], tables: ['tbl_courses', 'tbl_modules', 'tbl_enrollments', 'tbl_completions', 'tbl_certificates'] },
      ],
      fieldPermissions: [],
    },
    scripts: [],
    integrations: {
      pdfTemplates: [
        {
          id: 'pdf_certificate',
          name: 'Certificate of Completion',
          tableId: 'tbl_certificates',
          template: 'certificate-template',
        },
      ],
      emailTemplates: [
        { id: 'email_welcome', name: 'Enrollment Welcome', subject: 'Welcome to {{course.title}}!' },
        { id: 'email_completion', name: 'Course Completion', subject: 'Congratulations! You completed {{course.title}}' },
      ],
      stockConfigs: [],
      fulfilmentConfigs: [],
      convertToConfigs: [],
      bomHeaders: [],
      restConnectors: [],
    },
    marketplace: {
      id: 'lms-starter',
      name: 'Learning Management System',
      category: 'lms',
      tags: ['education', 'training', 'courses', 'certificates', 'e-learning'],
      screenshots: [],
    },
  },
};
