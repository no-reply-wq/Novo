/**
 * NIC E-Way Bill API client.
 * Sandbox:    https://ewaybillsandbox.nic.in/ewbapi
 * Production: https://ewaybillgst.gov.in/ewbapi
 */

import { NotConfiguredError } from '../secrets/manager';
import type {
  EWayBillConfig,
  EWayBillPayload,
  EWayBillResponse,
  EWayBillCancelParams,
  EWayBillExtendParams,
  EWayBillExtendResponse,
} from './types';

const SANDBOX_BASE = 'https://ewaybillsandbox.nic.in/ewbapi';
const PROD_BASE = 'https://ewaybillgst.gov.in/ewbapi';

interface NICAuthResponse {
  status: string;
  authtoken: string;
  sek: string;
  expiry?: string;
}

interface NICApiResponse<T> {
  status: string;
  data?: T;
  error?: string;
}

export class EWayBillClient {
  private authToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(private config: EWayBillConfig) {
    if (!config.gstin) {
      throw new NotConfiguredError(
        'E-Way Bill: GSTIN is required. Configure it in the builder integration settings.'
      );
    }
    if (!config.username) {
      throw new NotConfiguredError(
        'E-Way Bill: username is required. Configure it in the builder integration settings.'
      );
    }
    if (!config.password) {
      throw new NotConfiguredError(
        'E-Way Bill: password is required. Configure it in the builder integration settings.'
      );
    }
  }

  private get baseUrl(): string {
    return this.config.sandbox ? SANDBOX_BASE : PROD_BASE;
  }

  async authenticate(): Promise<void> {
    const now = Date.now();
    // Reuse cached token if still valid (with 60s buffer)
    if (this.authToken && now < this.tokenExpiry - 60_000) {
      return;
    }

    const res = await fetch(`${this.baseUrl}/ewb/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gstin: this.config.gstin,
        username: this.config.username,
        password: this.config.password,
        appid: 'authenticate',
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`EWB authenticate failed (${res.status}): ${text}`);
    }

    const json = (await res.json()) as NICAuthResponse;
    if (json.status !== '1' || !json.authtoken) {
      throw new Error(`EWB authenticate rejected: ${JSON.stringify(json)}`);
    }

    this.authToken = json.authtoken;
    // Default token expiry 6 hours if not provided
    this.tokenExpiry = now + 6 * 60 * 60 * 1000;
  }

  private async authorizedFetch<T>(
    path: string,
    method: 'GET' | 'POST',
    body?: Record<string, unknown>
  ): Promise<T> {
    await this.authenticate();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'authtoken': this.authToken!,
      'gstin': this.config.gstin,
    };

    const url =
      method === 'GET' && body
        ? `${this.baseUrl}${path}?${new URLSearchParams(body as Record<string, string>).toString()}`
        : `${this.baseUrl}${path}`;

    const res = await fetch(url, {
      method,
      headers,
      body: method === 'POST' ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`EWB API ${path} failed (${res.status}): ${text}`);
    }

    const json = (await res.json()) as NICApiResponse<T>;
    if (json.status !== '1') {
      throw new Error(`EWB API ${path} error: ${json.error ?? JSON.stringify(json)}`);
    }

    return json.data as T;
  }

  async generateEWB(payload: EWayBillPayload): Promise<EWayBillResponse> {
    return this.authorizedFetch<EWayBillResponse>('/ewb/generate', 'POST', payload as unknown as Record<string, unknown>);
  }

  async cancelEWB(params: EWayBillCancelParams): Promise<void> {
    await this.authorizedFetch<unknown>('/ewb/cancel', 'POST', {
      ewbNo: params.ewbNo,
      cancelRsnCode: params.cancelRsnCode,
      cancelRmrk: params.cancelRmrk,
    });
  }

  async extendEWB(params: EWayBillExtendParams): Promise<EWayBillExtendResponse> {
    return this.authorizedFetch<EWayBillExtendResponse>('/ewb/extendvalidity', 'POST', {
      ewbNo: params.ewbNo,
      vehicleNo: params.vehicleNo,
      fromPlace: params.fromPlace,
      fromState: params.fromState,
      remainingDistance: params.remainingDistance,
      transMode: params.transMode,
      extnRsnCode: params.extnRsnCode,
      extnRemarks: params.extnRemarks,
    });
  }

  async getEWBByDocNo(
    docType: string,
    docNo: string,
    docDate: string
  ): Promise<EWayBillResponse | null> {
    try {
      return await this.authorizedFetch<EWayBillResponse>(
        '/ewb/getewbdetails_by_docanddate',
        'GET',
        { docType, docNo, docDate }
      );
    } catch {
      // Return null if not found
      return null;
    }
  }
}
