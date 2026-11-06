// ─── REST Connector types ──────────────────────────────────────────────────────

export interface RESTConnector {
  id: string;
  appId: string;
  name: string;
  baseUrl: string;
  authType: 'none' | 'api_key' | 'bearer' | 'basic' | 'oauth2';
  authConfig: RESTAuthConfig;
  defaultHeaders: Record<string, string>;
  requests: RESTRequest[];
}

export type RESTAuthConfig =
  | { type: 'none' }
  | { type: 'api_key'; headerName: string; keyRef: string }
  | { type: 'bearer'; tokenRef: string }
  | { type: 'basic'; username: string; passwordRef: string }
  | { type: 'oauth2'; tokenUrl: string; clientId: string; clientSecretRef: string; scopes: string[] };

export interface RESTRequest {
  id: string;
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;             // relative to baseUrl, supports {{ params.id }}
  headers?: Record<string, string>;
  queryParams?: Record<string, string>; // support {{ expr }}
  bodyTemplate?: string;    // JSON template with {{ expr }}
  responseMapping?: Record<string, string>; // output field → JSONPath
}

export interface RESTExecuteResult {
  status: number;
  body: unknown;
  mapped: Record<string, unknown>;
}
