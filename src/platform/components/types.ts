// Custom component registry types (Agent T wave5)

export interface CustomComponentDef {
  id: string;
  appId: string;
  name: string;           // display name e.g. "GST Summary Box"
  apiKey: string;         // snake_case identifier used in page def
  description?: string;
  version: number;        // auto-increment on save
  code: string;           // ESM JS string -- exports default React component
  propsSchema: ComponentPropSchema[]; // what props the builder exposes
  previewProps?: Record<string, unknown>; // sample props for canvas preview
  createdAt: Date;
  updatedAt: Date;
}

export interface ComponentPropSchema {
  name: string;
  type: "string" | "number" | "boolean" | "record" | "records" | "expression";
  label: string;
  required?: boolean;
  default?: unknown;
}
