'use client';

/**
 * DynamicForm — renders a form_config from Form Builder
 * 
 * Handles:
 * - All field types (text, number, dropdown, date, textarea, checkbox, formula)
 * - Static and dynamic dropdowns with live fetch and cascading filters
 * - Formula fields (sum_column and expression) with live recomputation
 * - Single-field autofill (pick a value, sibling fields populate)
 * - Line items with add/remove rows, row-number auto-increment
 * - Form-level line-item autofill (pick a source → whole table refills)
 * - Test mode flag
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { cn, evaluateFormula, sumColumn } from '@/lib/utils';
import { Button, Input, Select, Textarea } from '@/components/ui';
import { Plus, Trash2, AlertCircle, TestTube } from 'lucide-react';
import { debounce } from '@/lib/utils';

// Types matching form_configs and form_fields DB rows
export interface FormFieldConfig {
  id: string;
  key: string;
  label: string;
  field_type: 'text' | 'number' | 'dropdown' | 'date' | 'textarea' | 'checkbox' | 'formula';
  is_line_item: boolean;
  is_required: boolean;
  is_readonly: boolean;
  sort_order: number;
  placeholder?: string;
  default_value?: string;
  width?: 'full' | 'half' | 'third';
  // Dropdown
  dropdown_type?: 'static' | 'dynamic';
  dropdown_static_options?: Array<{ value: string; label: string }>;
  dropdown_source_table?: string;
  dropdown_value_column?: string;
  dropdown_label_column?: string;
  dropdown_filter_column?: string;
  dropdown_filter_field?: string;
  dropdown_filter_value?: string;
  // Formula
  formula_type?: 'sum_column' | 'expression';
  formula_expression?: string;
  formula_target_field?: string;
  // Autofill
  autofill_source_field?: string;
  autofill_column?: string;
  // Row number
  is_row_number?: boolean;
  visible_when_field?: string;
  visible_when_value?: string;
}

export interface FormConfig {
  id: string;
  name: string;
  slug: string;
  show_as_tab: boolean;
  is_master?: boolean;
  pdf_template_url?: string;
  autofill_source_field?: string;
  autofill_child_table?: string;
  autofill_link_column?: string;
  autofill_column_map?: Record<string, string>;
  fields: FormFieldConfig[];
}

interface DynamicFormProps {
  form: FormConfig;
  tenantSlug: string;
  initialHeaderData?: Record<string, unknown>;
  initialLineItems?: Array<Record<string, unknown>>;
  submissionId?: string;  // If set, shows a "Download PDF" button after submit
  onSubmit: (data: {
    formId: string;
    isTest: boolean;
    headerData: Record<string, unknown>;
    lineItems: Array<Record<string, unknown>>;
  }) => Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
}

// Dropdown options cache (per table+filter combination)
const dropdownCache = new Map<string, Array<{ value: string; label: string }>>();

async function fetchDropdownOptions(
  tenantSlug: string,
  table: string,
  valueColumn: string,
  labelColumn: string,
  filterColumn?: string,
  filterValue?: string
): Promise<Array<{ value: string; label: string }>> {
  const cacheKey = `${tenantSlug}:${table}:${valueColumn}:${labelColumn}:${filterColumn}:${filterValue}`;
  if (dropdownCache.has(cacheKey)) return dropdownCache.get(cacheKey)!;

  const params = new URLSearchParams({
    tenant: tenantSlug,
    table,
    valueColumn,
    labelColumn,
  });
  if (filterColumn && filterValue) {
    params.set('filterColumn', filterColumn);
    params.set('filterValue', filterValue);
  }

  const res = await fetch(`/api/tenant/form-builder/dropdown-data?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  const opts = data.options as Array<{ value: string; label: string }>;
  dropdownCache.set(cacheKey, opts);
  return opts;
}

async function fetchAutofillSingle(
  tenantSlug: string,
  formId: string,
  sourceFieldKey: string,
  sourceValue: string
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({
    tenant: tenantSlug,
    formId,
    sourceFieldKey,
    sourceValue,
    mode: 'single',
  });
  const res = await fetch(`/api/tenant/form-builder/autofill?${params}`);
  if (!res.ok) return {};
  const data = await res.json();
  return data.values ?? {};
}

async function fetchAutofillLineItems(
  tenantSlug: string,
  formId: string,
  sourceFieldKey: string,
  sourceValue: string
): Promise<Array<Record<string, unknown>>> {
  const params = new URLSearchParams({
    tenant: tenantSlug,
    formId,
    sourceFieldKey,
    sourceValue,
    mode: 'lineitems',
  });
  const res = await fetch(`/api/tenant/form-builder/autofill?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.lineItems ?? [];
}

export function DynamicForm({
  form,
  tenantSlug,
  initialHeaderData = {},
  initialLineItems = [{}],
  onSubmit,
  onCancel,
  submissionId,
  loading,
}: DynamicFormProps) {
  const headerFields = form.fields.filter((f) => !f.is_line_item).sort((a, b) => a.sort_order - b.sort_order);
  const lineItemFields = form.fields.filter((f) => f.is_line_item).sort((a, b) => a.sort_order - b.sort_order);
  const hasLineItems = lineItemFields.length > 0;

  const [headerData, setHeaderData] = useState<Record<string, unknown>>(
    () => {
      const defaults: Record<string, unknown> = {};
      for (const f of headerFields) {
        if (f.default_value !== undefined) defaults[f.key] = f.default_value;
      }
      return { ...defaults, ...initialHeaderData };
    }
  );

  const [lineItems, setLineItems] = useState<Array<Record<string, unknown>>>(
    initialLineItems.length > 0 ? initialLineItems : [{}]
  );

  const [isTest, setIsTest] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, Array<{ value: string; label: string }>>>({});
  const [submitting, setSubmitting] = useState(false);
  const prevValues = useRef<Record<string, unknown>>({});

  // Load initial dynamic dropdown options
  useEffect(() => {
    async function loadInitialDropdowns() {
      for (const field of [...headerFields, ...lineItemFields]) {
        if (field.dropdown_type === 'dynamic' && !field.dropdown_filter_field) {
          // Non-cascading: load immediately
          if (field.dropdown_source_table && field.dropdown_value_column && field.dropdown_label_column) {
            const opts = await fetchDropdownOptions(
              tenantSlug,
              field.dropdown_source_table,
              field.dropdown_value_column,
              field.dropdown_label_column,
              field.dropdown_filter_column ?? undefined,
              field.dropdown_filter_value ?? undefined
            );
            setDynamicOptions((prev) => ({ ...prev, [field.key]: opts }));
          }
        }
      }
    }
    loadInitialDropdowns();
  }, [form.id]);

  // Recompute formula fields whenever header data or line items change
  function recomputeFormulas() {
    const newHeader = { ...headerData };
    let changed = false;

    for (const field of headerFields) {
      if (field.field_type !== 'formula') continue;

      let computed: number;
      if (field.formula_type === 'sum_column' && field.formula_target_field) {
        computed = sumColumn(lineItems, field.formula_target_field);
      } else if (field.formula_type === 'expression' && field.formula_expression) {
        const numericValues: Record<string, number> = {};
        for (const f of headerFields) {
          const val = newHeader[f.key];
          if (val !== undefined && val !== '') {
            numericValues[f.key] = parseFloat(String(val));
          }
        }
        computed = evaluateFormula(field.formula_expression, numericValues);
      } else {
        continue;
      }

      if (newHeader[field.key] !== computed) {
        newHeader[field.key] = computed;
        changed = true;
      }
    }

    // Also recompute line item formulas
    const newItems = lineItems.map((item) => {
      const updated = { ...item };
      let itemChanged = false;
      for (const field of lineItemFields) {
        if (field.field_type !== 'formula') continue;
        if (field.formula_type === 'expression' && field.formula_expression) {
          const numericValues: Record<string, number> = {};
          for (const f of lineItemFields) {
            const val = item[f.key];
            if (val !== undefined && val !== '') {
              numericValues[f.key] = parseFloat(String(val));
            }
          }
          const computed = evaluateFormula(field.formula_expression, numericValues);
          if (updated[field.key] !== computed) {
            updated[field.key] = computed;
            itemChanged = true;
          }
        }
      }
      return itemChanged ? updated : item;
    });

    if (changed) setHeaderData(newHeader);
    if (JSON.stringify(newItems) !== JSON.stringify(lineItems)) setLineItems(newItems);
  }

  useEffect(() => {
    recomputeFormulas();
  }, [lineItems.length]);

  // Handle header field change with autofill + cascading dropdown refresh
  async function handleHeaderChange(key: string, value: unknown) {
    const newData = { ...headerData, [key]: value };
    setHeaderData(newData);

    const field = headerFields.find((f) => f.key === key);
    if (!field) return;

    // 1. Single-field autofill (triggered when a dropdown changes)
    if (field.field_type === 'dropdown' && value && String(value).length > 0) {
      const autofillValues = await fetchAutofillSingle(
        tenantSlug, form.id, key, String(value)
      );
      if (Object.keys(autofillValues).length > 0) {
        setHeaderData((prev) => ({ ...prev, ...autofillValues }));
      }

      // 2. Form-level line-item autofill
      if (form.autofill_source_field === key) {
        const newItems = await fetchAutofillLineItems(
          tenantSlug, form.id, key, String(value)
        );
        if (newItems.length > 0) setLineItems(newItems.length > 0 ? newItems : [{}]);
      }

      // 3. Refresh cascading dropdowns that depend on this field
      for (const dep of headerFields) {
        if (dep.dropdown_filter_field === key && dep.dropdown_source_table) {
          const opts = await fetchDropdownOptions(
            tenantSlug,
            dep.dropdown_source_table,
            dep.dropdown_value_column ?? 'id',
            dep.dropdown_label_column ?? 'name',
            dep.dropdown_filter_column ?? undefined,
            String(value)
          );
          setDynamicOptions((prev) => ({ ...prev, [dep.key]: opts }));
          // Clear the dependent field's value since filter changed
          setHeaderData((prev) => ({ ...prev, [dep.key]: '' }));
        }
      }
    }

    // Recompute formulas
    setTimeout(recomputeFormulas, 0);
  }

  function handleLineItemChange(rowIdx: number, key: string, value: unknown) {
    setLineItems((prev) => {
      const updated = [...prev];
      updated[rowIdx] = { ...updated[rowIdx], [key]: value };
      return updated;
    });
    setTimeout(recomputeFormulas, 0);
  }

  function addRow() {
    setLineItems((prev) => [...prev, {}]);
  }

  function removeRow(idx: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
    setTimeout(recomputeFormulas, 0);
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    for (const field of headerFields) {
      if (field.is_required && !headerData[field.key]) {
        errs[field.key] = `${field.label} is required`;
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      await onSubmit({
        formId: form.id,
        isTest,
        headerData,
        lineItems: hasLineItems ? lineItems : [],
      });
    } finally {
      setSubmitting(false);
    }
  }

  function renderField(
    field: FormFieldConfig,
    value: unknown,
    onChange: (value: unknown) => void,
    prefix = ''
  ) {
    const fieldId = `${prefix}${field.key}`;
    const error = errors[field.key];
    const isDisabled = field.is_readonly || field.field_type === 'formula';

    switch (field.field_type) {
      case 'text':
        return (
          <Input
            id={fieldId}
            label={prefix ? undefined : field.label}
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            required={field.is_required}
            disabled={isDisabled}
            error={error}
          />
        );

      case 'number':
        return (
          <Input
            id={fieldId}
            label={prefix ? undefined : field.label}
            type="number"
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
            placeholder={field.placeholder}
            required={field.is_required}
            disabled={isDisabled}
            error={error}
          />
        );

      case 'date':
        return (
          <Input
            id={fieldId}
            label={prefix ? undefined : field.label}
            type="date"
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            required={field.is_required}
            disabled={isDisabled}
            error={error}
          />
        );

      case 'textarea':
        return (
          <Textarea
            id={fieldId}
            label={prefix ? undefined : field.label}
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            disabled={isDisabled}
            error={error}
          />
        );

      case 'checkbox':
        return (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => onChange(e.target.checked)}
              disabled={isDisabled}
              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            {!prefix && <span className="text-sm font-medium text-slate-700">{field.label}</span>}
          </label>
        );

      case 'formula':
        return (
          <Input
            id={fieldId}
            label={prefix ? undefined : field.label}
            value={value != null ? String(Number(value).toFixed(2)) : '0.00'}
            readOnly
            disabled
            className="bg-slate-50 font-mono font-medium"
            error={error}
          />
        );

      case 'dropdown': {
        let options: Array<{ value: string; label: string }> = [];

        if (field.dropdown_type === 'static') {
          options = field.dropdown_static_options ?? [];
        } else if (field.dropdown_type === 'dynamic') {
          options = dynamicOptions[field.key] ?? [];
        }

        return (
          <Select
            id={fieldId}
            label={prefix ? undefined : field.label}
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            options={(Array.isArray(options) ? options : []).map((o) => ({ value: String(o.value), label: o.label }))}
            placeholder={field.placeholder || `Select ${field.label}`}
            required={field.is_required}
            disabled={isDisabled}
            error={error}
          />
        );
      }

      default:
        return null;
    }
  }

  const widthClass: Record<string, string> = {
    full: 'col-span-12',
    half: 'col-span-6',
    third: 'col-span-4',
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Test mode banner */}
      {isTest && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
          <TestTube className="w-4 h-4 flex-shrink-0" />
          Test mode — this submission will not appear in the main data table.
        </div>
      )}

      {/* Header fields */}
      <div className="grid grid-cols-12 gap-4">
        {headerFields.map((field) => {
          const isVisible = (f: typeof field, depth = 0): boolean => {
            if (depth > 5) return true;
            if (!f.visible_when_field || !f.visible_when_value) return true;
            const cv = String(headerData[f.visible_when_field] ?? '');
            if (cv !== f.visible_when_value) return false;
            const ctrl = headerFields.find(hf => hf.key === f.visible_when_field);
            return ctrl ? isVisible(ctrl, depth + 1) : true;
          };
          if (!isVisible(field)) return null;
          return (
          <div key={field.key} className={cn(widthClass[field.width ?? 'full'])}>
            {renderField(
              field,
              headerData[field.key],
              (v) => handleHeaderChange(field.key, v)
            )}
            {errors[field.key] && (
              <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                <AlertCircle className="w-3 h-3" />
                {errors[field.key]}
              </p>
            )}
          </div>
          );
        })}
      </div>

      {/* Line items */}
      {hasLineItems && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700">Line Items</h3>
            <Button type="button" variant="secondary" size="sm" icon={<Plus className="w-3 h-3" />} onClick={addRow}>
              Add row
            </Button>
          </div>
          <div className="border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {lineItemFields.map((f) => (
                    <th key={f.key} className="px-3 py-2 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">
                      {f.label}
                      {f.is_required && <span className="text-red-500 ml-1">*</span>}
                    </th>
                  ))}
                  <th className="px-2 py-2 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lineItems.map((item, rowIdx) => (
                  <tr key={rowIdx}>
                    {lineItemFields.map((field) => (
                      <td key={field.key} className="px-2 py-1.5">
                        {field.is_row_number ? (
                          <span className="text-slate-400 text-xs tabular-nums px-1">{rowIdx + 1}</span>
                        ) : (
                          renderField(
                            field,
                            item[field.key],
                            (v) => handleLineItemChange(rowIdx, field.key, v),
                            `row_${rowIdx}_`
                          )
                        )}
                      </td>
                    ))}
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => removeRow(rowIdx)}
                        disabled={lineItems.length <= 1}
                        className="p-1 text-slate-300 hover:text-red-500 disabled:opacity-20 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Submit actions */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={isTest}
            onChange={(e) => setIsTest(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
          />
          Submit as test
        </label>
        <div className="flex gap-3">
          {submissionId && form.pdf_template_url && (
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                const res = await fetch(
                  `/api/tenant/pdf/generate?tenant=${tenantSlug}`,
                  { method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ submissionId }) }
                );
                if (res.ok) {
                  const { url, filename } = await res.json();
                  const a = document.createElement('a');
                  a.href = url; a.download = filename; a.click();
                }
              }}
            >
              ⬇ Download PDF
            </Button>
          )}
          {onCancel && (
            <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
          )}
          <Button type="submit" loading={submitting || loading}>
            {isTest ? 'Submit (Test)' : 'Submit'}
          </Button>
        </div>
      </div>
    </form>
  );
}
