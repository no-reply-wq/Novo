/**
 * Child table configuration — drives inline nested tables in forms.
 */

export interface ChildTableConfig {
  id: string;
  parentTableId: string;
  childTableId: string;
  parentField: string;      // FK in child pointing to parent
  depth: number;            // 0 = direct child, 1 = grandchild, etc.
  displayOrder: number;
  label: string;
  allowAdd: boolean;
  allowDelete: boolean;
  allowReorder: boolean;    // drag to reorder rows
}

export interface ChildTableConfigRow {
  id: string;
  parent_table_id: string;
  child_table_id: string;
  parent_field: string;
  depth: number;
  display_order: number;
  label: string;
  allow_add: boolean;
  allow_delete: boolean;
  allow_reorder: boolean;
  created_at: Date;
}

export function rowToChildTableConfig(row: ChildTableConfigRow): ChildTableConfig {
  return {
    id: row.id,
    parentTableId: row.parent_table_id,
    childTableId: row.child_table_id,
    parentField: row.parent_field,
    depth: row.depth,
    displayOrder: row.display_order,
    label: row.label,
    allowAdd: row.allow_add,
    allowDelete: row.allow_delete,
    allowReorder: row.allow_reorder,
  };
}
