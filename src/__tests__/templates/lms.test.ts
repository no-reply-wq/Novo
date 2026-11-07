/**
 * LMS template structure tests.
 */
import { lmsTemplate } from '@/platform/templates/lms';

describe('lmsTemplate', () => {
  it('has the correct id and category', () => {
    expect(lmsTemplate.id).toBe('lms-starter');
    expect(lmsTemplate.category).toBe('lms');
  });

  it('contains a Courses table', () => {
    const tables = lmsTemplate.bundle.schema.tables as Array<{ name: string }>;
    const courses = tables.find((t) => t.name === 'Courses');
    expect(courses).toBeDefined();
  });

  it('Courses table has required fields', () => {
    const tables = lmsTemplate.bundle.schema.tables as Array<{
      name: string;
      fields: Array<{ name: string }>;
    }>;
    const courses = tables.find((t) => t.name === 'Courses')!;
    const fieldNames = courses.fields.map((f) => f.name);
    expect(fieldNames).toContain('title');
    expect(fieldNames).toContain('status');
    expect(fieldNames).toContain('instructor');
  });

  it('contains Modules table with content_type field', () => {
    const tables = lmsTemplate.bundle.schema.tables as Array<{
      name: string;
      fields: Array<{ name: string }>;
    }>;
    const modules = tables.find((t) => t.name === 'Modules')!;
    expect(modules).toBeDefined();
    const fieldNames = modules.fields.map((f) => f.name);
    expect(fieldNames).toContain('content_type');
    expect(fieldNames).toContain('course');
  });

  it('contains Enrollments table with progress_pct formula field', () => {
    const tables = lmsTemplate.bundle.schema.tables as Array<{
      name: string;
      fields: Array<{ name: string; type: string }>;
    }>;
    const enrollments = tables.find((t) => t.name === 'Enrollments')!;
    expect(enrollments).toBeDefined();
    const progress = enrollments.fields.find((f) => f.name === 'progress_pct');
    expect(progress).toBeDefined();
    expect(progress!.type).toBe('formula');
  });

  it('contains Certificates table', () => {
    const tables = lmsTemplate.bundle.schema.tables as Array<{ name: string }>;
    const certs = tables.find((t) => t.name === 'Certificates');
    expect(certs).toBeDefined();
  });

  it('has an enrollment welcome workflow', () => {
    const workflows = lmsTemplate.bundle.logic.workflows as Array<{ id: string }>;
    const welcome = workflows.find((w) => w.id === 'wf_enrollment_welcome');
    expect(welcome).toBeDefined();
  });

  it('has a certificate-on-completion workflow', () => {
    const workflows = lmsTemplate.bundle.logic.workflows as Array<{ id: string }>;
    const cert = workflows.find((w) => w.id === 'wf_certificate_on_completion');
    expect(cert).toBeDefined();
  });

  it('certificate workflow has WhatsApp action', () => {
    const workflows = lmsTemplate.bundle.logic.workflows as Array<{
      id: string;
      actions: Array<{ type: string }>;
    }>;
    const cert = workflows.find((w) => w.id === 'wf_certificate_on_completion')!;
    const whatsapp = cert.actions.find((a) => a.type === 'send_whatsapp');
    expect(whatsapp).toBeDefined();
  });

  it('has a course catalog page', () => {
    const pages = lmsTemplate.bundle.ui.pages as Array<{ id: string }>;
    const catalog = pages.find((p) => p.id === 'pg_catalog');
    expect(catalog).toBeDefined();
  });
});
