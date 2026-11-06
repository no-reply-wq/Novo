/**
 * IRP (Invoice Registration Portal) API client.
 *
 * Sandbox: https://einv-apisandbox.nic.in
 * Production: https://einvoice1-prod.nic.in
 *
 * Auth flow: POST /eivital/v1.03/Auth → get authtoken → use in subsequent calls.
 * Token is cached in memory and refreshed when expired.
 */

import { NotConfiguredError } from '../secrets/manager';
import type { EInvoiceConfig, EInvoicePayload, EInvoiceResponse } from './types';

interface IRPAuthResponse {
  Status: string;
  Info?: {
    AuthToken: string;
    TokenExpiry: string; // "2024-01-15 23:59:59"
    UserGstin: string;
    Sek: string;
  };
  ErrorDetails?: Array<{ ErrorCode: string; ErrorMessage: string }>;
}

interface IRPGenerateResponse {
  Status: string;
  Info?: {
    Irn: string;
    AckNo: string;
    AckDt: string;
    SignedQRCode: string;
    SignedInvoice: string;
    Status: string;
  };
  ErrorDetails?: Array<{ ErrorCode: string; ErrorMessage: string }>;
}

interface IRPGetIRNResponse {
  Status: string;
  Info?: {
    Irn: string;
    AckNo: string;
    AckDt: string;
    SignedQRCode: string;
    SignedInvoice: string;
    Status: string;
  };
  ErrorDetails?: Array<{ ErrorCode: string; ErrorMessage: string }>;
}

function extractErrorMessage(resp: { ErrorDetails?: Array<{ ErrorCode: string; ErrorMessage: string }> }): string {
  if (resp.ErrorDetails && resp.ErrorDetails.length > 0) {
    return resp.ErrorDetails.map((e) => `${e.ErrorCode}: ${e.ErrorMessage}`).join('; ');
  }
  return 'Unknown IRP error';
}

function parseTokenExpiry(expiryStr: string): number {
  // expiryStr is "YYYY-MM-DD HH:mm:ss"
  return new Date(expiryStr.replace(' ', 'T')).getTime();
}

export class IRPClient {
  private baseUrl: string;
  private authToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(private config: EInvoiceConfig) {
    if (!config.gstin) {
      throw new NotConfiguredError('EInvoice GSTIN is not configured.');
    }
    if (!config.username || !config.password) {
      throw new NotConfiguredError('EInvoice IRP credentials (username/password) are not configured.');
    }
    if (!config.clientId || !config.clientSecret) {
      throw new NotConfiguredError('EInvoice clientId/clientSecret are not configured.');
    }
    this.baseUrl = config.sandbox
      ? 'https://einv-apisandbox.nic.in'
      : 'https://einvoice1-prod.nic.in';
  }

  async authenticate(): Promise<void> {
    const body = {
      UserName: this.config.username,
      Password: this.config.password,
      AppKey: this.config.clientSecret,
      ForceRefreshAccessToken: true,
    };

    const res = await fetch(`${this.baseUrl}/eivital/v1.03/Auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'client_id': this.config.clientId,
        'client_secret': this.config.clientSecret,
        'gstin': this.config.gstin,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`IRP Auth HTTP ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as IRPAuthResponse;

    if (data.Status !== '1' || !data.Info) {
      throw new Error(`IRP Auth failed: ${extractErrorMessage(data)}`);
    }

    this.authToken = data.Info.AuthToken;
    this.tokenExpiry = parseTokenExpiry(data.Info.TokenExpiry);
  }

  private async ensureAuth(): Promise<void> {
    // Refresh if token missing or will expire within 60 seconds
    if (!this.authToken || Date.now() >= this.tokenExpiry - 60_000) {
      await this.authenticate();
    }
  }

  private commonHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'authtoken': this.authToken ?? '',
      'user_name': this.config.username,
      'gstin': this.config.gstin,
      'client_id': this.config.clientId,
      'client_secret': this.config.clientSecret,
    };
  }

  async generateIRN(payload: EInvoicePayload): Promise<EInvoiceResponse> {
    await this.ensureAuth();

    const res = await fetch(`${this.baseUrl}/eicore/v1.03/Invoice`, {
      method: 'POST',
      headers: this.commonHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`IRP generateIRN HTTP ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as IRPGenerateResponse;

    if (data.Status !== '1' || !data.Info) {
      throw new Error(`IRP generateIRN failed: ${extractErrorMessage(data)}`);
    }

    return {
      irn: data.Info.Irn,
      ackNo: data.Info.AckNo,
      ackDt: data.Info.AckDt,
      signedQrCode: data.Info.SignedQRCode,
      signedInvoice: data.Info.SignedInvoice,
      status: data.Info.Status as 'ACT' | 'CNL',
    };
  }

  async cancelIRN(irn: string, reason: number, remarks: string): Promise<void> {
    await this.ensureAuth();

    const res = await fetch(`${this.baseUrl}/eicore/v1.03/Invoice/Cancel`, {
      method: 'POST',
      headers: this.commonHeaders(),
      body: JSON.stringify({ Irn: irn, CnlRsn: reason, CnlRem: remarks }),
    });

    if (!res.ok) {
      throw new Error(`IRP cancelIRN HTTP ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as { Status: string; ErrorDetails?: Array<{ ErrorCode: string; ErrorMessage: string }> };

    if (data.Status !== '1') {
      throw new Error(`IRP cancelIRN failed: ${extractErrorMessage(data)}`);
    }
  }

  async getIRNByDocDetails(
    docType: string,
    docNo: string,
    docDate: string,
  ): Promise<EInvoiceResponse | null> {
    await this.ensureAuth();

    const params = new URLSearchParams({ doctype: docType, docnum: docNo, docdt: docDate });
    const res = await fetch(`${this.baseUrl}/eicore/v1.03/Invoice/irn?${params.toString()}`, {
      method: 'GET',
      headers: this.commonHeaders(),
    });

    if (res.status === 404) {
      return null;
    }

    if (!res.ok) {
      throw new Error(`IRP getIRNByDocDetails HTTP ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as IRPGetIRNResponse;

    if (data.Status !== '1' || !data.Info) {
      return null;
    }

    return {
      irn: data.Info.Irn,
      ackNo: data.Info.AckNo,
      ackDt: data.Info.AckDt,
      signedQrCode: data.Info.SignedQRCode,
      signedInvoice: data.Info.SignedInvoice,
      status: data.Info.Status as 'ACT' | 'CNL',
    };
  }
}
