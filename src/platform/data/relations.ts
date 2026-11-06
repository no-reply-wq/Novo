/**
 * Relation type definitions for table-to-table relationships.
 */

export type RelationType = 'one_to_many' | 'many_to_many' | 'self';
export type CascadeRule = 'restrict' | 'cascade' | 'set_null';

export interface TableRelation {
  id: string;
  name: string;
  type: RelationType;
  sourceTableId: string;
  targetTableId: string;
  sourceField: string;      // FK field on source (for 1:M)
  targetField?: string;     // for self-relations
  junctionTable?: string;   // for M:M
  cascadeOnDelete: CascadeRule;
  cascadeOnUpdate: CascadeRule;
  inverseLabel?: string;    // label for the back-link
}

export interface RelationRow {
  id: string;
  app_id: string;
  name: string;
  type: RelationType;
  source_table_id: string;
  target_table_id: string;
  source_field: string;
  target_field: string | null;
  junction_table: string | null;
  cascade_on_delete: CascadeRule;
  cascade_on_update: CascadeRule;
  inverse_label: string | null;
  created_at: Date;
}

export function rowToRelation(row: RelationRow): TableRelation {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    sourceTableId: row.source_table_id,
    targetTableId: row.target_table_id,
    sourceField: row.source_field,
    targetField: row.target_field ?? undefined,
    junctionTable: row.junction_table ?? undefined,
    cascadeOnDelete: row.cascade_on_delete,
    cascadeOnUpdate: row.cascade_on_update,
    inverseLabel: row.inverse_label ?? undefined,
  };
}
