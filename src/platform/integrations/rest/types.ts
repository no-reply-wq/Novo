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
  path: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  bodyTemplate?: string;
  responseMapping?: Record<string, string>;
}
export interface RESTExecuteResult {
  status: number;
  body: unknown;
  mapped: Record<string, unknown>;
}
