/**
 * Convert-to engine types.
 */

export interface FieldMapping {
  sourceFieldId: string;
  targetFieldId: string;
  /** Optional expression to transform the source value. */
  transformExpr?: string;
}

export interface ConvertConfig {
  id: string;
  name: string;
  sourceTableId: string;
  targetTableId: string;
  sourceLineTableId?: string;
  targetLineTableId?: string;
  headerFieldMapping: FieldMapping[];
  lineFieldMapping?: FieldMapping[];
  /** When true, auto-create a FulfilmentLink for each source line → target line. */
  createFulfilmentLinks: boolean;
}

export interface ConvertResult {
  targetRecordId: string;
  targetLineRecordIds: string[];
  fulfilmentLinkIds: string[];
}
