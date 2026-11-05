'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';

export interface FormField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'email' | 'date' | 'select' | 'textarea' | 'checkbox';
  required?: boolean;
  options?: Array<{ label: string; value: string }>;
  placeholder?: string;
}

export interface FormComponentProps {
  tableId: string;
  fields?: FormField[];
  onSubmit?: (data: Record<string, unknown>) => void;
  submitLabel?: string;
  initialValues?: Record<string, unknown>;
}

type FieldErrors = Record<string, string>;

export function FormComponent({
  fields = [],
  onSubmit,
  submitLabel = 'Submit',
  initialValues = {},
}: FormComponentProps) {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    for (const f of fields) {
      init[f.key] = initialValues[f.key] ?? (f.type === 'checkbox' ? false : '');
    }
    return init;
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const validate = (): FieldErrors => {
    const errs: FieldErrors = {};
    for (const field of fields) {
      const val = values[field.key];
      if (field.required && (val === '' || val === null || val === undefined)) {
        errs[field.key] = `${field.label} is required`;
      }
      if (field.type === 'email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val))) {
        errs[field.key] = 'Enter a valid email address';
      }
    }
    return errs;
  };

  const handleChange = (key: string, value: unknown) => {
    setValues((prev: Record<string, unknown>) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev: FieldErrors) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setIsSubmitting(true);
    try {
      onSubmit?.(values);
      setSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded border border-green-200 bg-green-50 p-4 text-sm text-green-700">
        Submitted successfully.
      </div>
    );
  }

  if (fields.length === 0) {
    return (
      <div className="rounded border border-dashed border-gray-200 p-4 text-xs text-gray-400">
        No fields configured for this form.
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 rounded border border-gray-200 bg-white p-4">
      {fields.map((field) => (
        <div key={field.key} className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">
            {field.label}
            {field.required && <span className="ml-0.5 text-red-500">*</span>}
          </label>
          <FieldInput field={field} value={values[field.key]} onChange={handleChange} />
          {errors[field.key] && (
            <p className="text-xs text-red-500">{errors[field.key]}</p>
          )}
        </div>
      ))}

      <button
        type="submit"
        disabled={isSubmitting}
        className={cn(
          'rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60',
        )}
      >
        {isSubmitting ? 'Submitting…' : submitLabel}
      </button>
    </form>
  );
}

interface FieldInputProps {
  field: FormField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}

function FieldInput({ field, value, onChange }: FieldInputProps) {
  const baseClass =
    'rounded border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-indigo-400 w-full';

  switch (field.type) {
    case 'textarea':
      return (
        <textarea
          value={String(value ?? '')}
          onChange={(e) => onChange(field.key, e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className={baseClass}
        />
      );

    case 'select':
      return (
        <select
          value={String(value ?? '')}
          onChange={(e) => onChange(field.key, e.target.value)}
          className={baseClass}
        >
          <option value="">Select…</option>
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );

    case 'checkbox':
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(field.key, e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-indigo-600"
        />
      );

    default:
      return (
        <input
          type={field.type}
          value={String(value ?? '')}
          onChange={(e) => onChange(field.key, e.target.value)}
          placeholder={field.placeholder}
          className={baseClass}
        />
      );
  }
}
