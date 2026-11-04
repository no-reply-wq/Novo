/**
 * Shared form-related types used across pages, components, and API routes.
 *
 * Single source of truth — import from here rather than defining local
 * interfaces in individual files.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Field types — the runtime shape DynamicForm uses to render each field.
// DynamicForm.tsx imports DynamicFieldConfig from HERE to avoid circular deps.
// ─────────────────────────────────────────────────────────────────────────────

/** Canonical field shape used at runtime by DynamicForm and all form pages. */
export interface DynamicFieldConfig {
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

/** Backward-compat alias — prefer DynamicFieldConfig for new code. */
export type FormFieldConfig = DynamicFieldConfig;

// ─────────────────────────────────────────────────────────────────────────────
// Form config — the full shape returned from form_configs table
// ─────────────────────────────────────────────────────────────────────────────

export interface FormConfig {
  id: string;
  name: string;
  slug: string;
  description?: string;
  category?: string;
  show_as_tab: boolean;
  tab_label?: string;
  tab_icon?: string;
  tab_sort_order?: number;
  tab_visible_roles?: string[];
  active?: boolean;
  created_at?: string;
  updated_at?: string;
  settings?: Record<string, unknown>;
  table_columns?: unknown[];
  pdf_template_url?: string;
  pdf_output_folder?: string;
  autofill_source_field?: string;
  autofill_child_table?: string;
  autofill_link_column?: string;
  autofill_column_map?: Record<string, string>;
  board_view_enabled?: boolean;
  board_group_by_field?: string;
  revisioning_enabled?: boolean;
  is_master?: boolean;
  is_public?: boolean;
  is_system?: boolean;
  public_settings?: Record<string, unknown>;
  fields?: DynamicFieldConfig[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Draft types used inside the form builder editor
// ─────────────────────────────────────────────────────────────────────────────

export interface FieldDraft {
  id?: string;
  slug: string;
  label: string;
  type: string;
  is_required?: boolean;
  is_unique?: boolean;
  is_system?: boolean;
  is_hidden?: boolean;
  default_value?: unknown;
  options?: Record<string, unknown>;
  field_order?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Converter: FieldDraft (editor format) ↔ DynamicFieldConfig (runtime format)
//
// The form builder editor stores dropdown_static_options as a JSON *string*
// (easier to edit in a textarea). The runtime DynamicForm expects a parsed
// Array<{value,label}>. These helpers convert between the two representations.
// ─────────────────────────────────────────────────────────────────────────────

/** Editor field shape: dropdown_static_options is a raw JSON string */
export interface EditorFieldConfig extends Omit<DynamicFieldConfig, 'dropdown_static_options'> {
  dropdown_static_options?: string; // JSON string while in the editor
}

/**
 * Convert an editor field (options as JSON string) to a runtime field
 * (options as parsed array). Safe: returns [] if the JSON is malformed.
 */
export function editorFieldToRuntime(field: EditorFieldConfig): DynamicFieldConfig {
  let parsedOptions: Array<{ value: string; label: string }> | undefined;
  if (field.dropdown_static_options) {
    try {
      const parsed = JSON.parse(field.dropdown_static_options);
      if (Array.isArray(parsed)) {
        parsedOptions = parsed as Array<{ value: string; label: string }>;
      }
    } catch {
      parsedOptions = [];
    }
  }
  return {
    ...field,
    dropdown_static_options: parsedOptions,
  };
}

/**
 * Convert a runtime field (options as parsed array) back to editor format
 * (options as JSON string). Produces a pretty-printed JSON string.
 */
export function runtimeFieldToEditor(field: DynamicFieldConfig): EditorFieldConfig {
  return {
    ...field,
    dropdown_static_options: field.dropdown_static_options
      ? JSON.stringify(field.dropdown_static_options, null, 2)
      : undefined,
  };
}

export interface FormDraft {
  name: string;
  description?: string;
  category?: string;
  show_as_tab?: boolean;
  tab_label?: string;
  pdf_template_url?: string;
  board_view_enabled?: boolean;
  board_group_by_field?: string;
  revisioning_enabled?: boolean;
  is_master?: boolean;
  is_public?: boolean;
  public_settings?: Record<string, unknown>;
  fields?: FieldDraft[];
}
