/**
 * AST node types for the expression engine.
 */

export type ASTNode =
  | LiteralNode
  | ArrayNode
  | FieldRefNode
  | BinaryOpNode
  | UnaryOpNode
  | FunctionCallNode
  | InNode;

export interface LiteralNode {
  type: 'Literal';
  value: string | number | boolean | null | Date;
}

export interface ArrayNode {
  type: 'Array';
  elements: ASTNode[];
}

export interface FieldRefNode {
  type: 'FieldRef';
  parts: string[];         // e.g. ['record','field_name'] or ['user','id']
  index?: number;          // e.g. record.lines[0].qty → index on 'lines'
  tail?: FieldRefNode;     // chained after index access
}

export interface BinaryOpNode {
  type: 'BinaryOp';
  op: '+' | '-' | '*' | '/' | '%' | '=' | '!=' | '<' | '>' | '<=' | '>=' | 'AND' | 'OR';
  left: ASTNode;
  right: ASTNode;
}

export interface UnaryOpNode {
  type: 'UnaryOp';
  op: '-' | 'NOT';
  operand: ASTNode;
}

export interface FunctionCallNode {
  type: 'FunctionCall';
  name: string;
  args: ASTNode[];
}

export interface InNode {
  type: 'In';
  negated: boolean;
  value: ASTNode;
  list: ASTNode;   // should evaluate to an array
}

/** Compiled expression handle — also carries the AST internally. */
export interface ExprAST {
  source: string;
  root: ASTNode;
  depth: number;   // max depth of AST tree
}
