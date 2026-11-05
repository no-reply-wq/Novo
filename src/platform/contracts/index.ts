/**
 * Public surface of the platform contracts.
 *
 * Import from here — not from individual files — so sub-agents don't take
 * implicit dependencies on file layout.
 *
 * RULE: Sub-agents may not change this file. Changes go through the Lead.
 */

// Field types and FieldDef
export type {
  TextFieldType,
  NumberFieldType,
  DateFieldType,
  ChoiceFieldType,
  LinkFieldType,
  CaptureFieldType,
  ComputedFieldType,
  FieldType,
  TextFieldOptions,
  NumberFieldOptions,
  ChoiceOption,
  ChoiceFieldOptions,
  LookupFieldOptions,
  FileFieldOptions,
  FormulaFieldOptions,
  RollupFieldOptions,
  LookupValueFieldOptions,
  AutoNumberOptions,
  StatusFromRulesOptions,
  FieldOptions,
  FieldDef,
} from './fields';

// Tables, relations, engines, AppDefinition
export type {
  RelationDef,
  SoftDeleteConfig,
  AuditConfig,
  StockEngineConfig,
  FulfilmentEngineConfig,
  BomEngineConfig,
  TableDef,
  AppDefinition,
} from './tables';

// Access control
export type {
  AccessPolicy,
  FieldPermission,
  UserOverride,
  LocationDef,
  RoleDef,
} from './access';

// Rules, workflows, triggers, actions, approvals, scripts
export type {
  RuleDef,
  TriggerEvent,
  TriggerDef,
  ActionType,
  ActionDef,
  WorkflowDef,
  ApprovalLevel,
  ApprovalChainDef,
  ScriptDef,
} from './rules';

// UI / pages
export type {
  ComponentType,
  Binding,
  ComponentDef,
  QueryDef,
  PageDef,
  ThemeTokens,
} from './ui';

// Integrations
export type {
  ConnectorKind,
  SecretRef,
  ConnectorRequest,
  ConnectorDef,
  DocTemplateFormat,
  DocTemplateSection,
  DocTemplatePageSetup,
  DocTemplateDef,
} from './integrations';
