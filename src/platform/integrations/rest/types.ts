export type RESTAuthType = 'none' | 'api_key' | 'bearer' | 'basic' | 'oauth2'

export interface RESTAuthConfig {
  type: RESTAuthType
  /** api_key: header or query param name */
  keyName?: string
  keyIn?: 'header' | 'query'
  /** reference to secret store key for api_key value */
  keyRef?: string
  /** reference to secret for bearer token */
  tokenRef?: string
  /** basic auth username (plain) and password ref */
  username?: string
  passwordRef?: string
  /** oauth2 */
  tokenUrl?: string
  clientId?: string
  clientSecretRef?: string
  scope?: string
}

export interface RESTParamDef {
  name: string
  in: 'query' | 'header' | 'body'
  /** template value like {{ input.id }} */
  value: string
}

export interface RESTRequest {
  id: string
  name: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  params?: RESTParamDef[]
  bodyTemplate?: string
  /** jsonPath → outputField mapping */
  responseMapping?: Record<string, string>
}

export interface RESTConnector {
  id: string
  appId: string
  name: string
  baseUrl: string
  auth: RESTAuthConfig
  defaultHeaders?: Record<string, string>
  requests: RESTRequest[]
}

export interface RESTExecuteResult {
  status: number
  body: unknown
  mapped: Record<string, unknown>
}
