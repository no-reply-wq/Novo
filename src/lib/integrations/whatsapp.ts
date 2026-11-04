/** WhatsApp integration stub — replace with real Meta Cloud API implementation. */
export interface WhatsAppConfig {
  phoneNumberId?: string;
  accessToken?: string;
}

export interface WhatsAppPayload {
  to: string;
  body: string;
}

export async function sendWhatsApp(_config: WhatsAppConfig, _payload: WhatsAppPayload): Promise<void> {
  // TODO: implement Meta Cloud API send
  throw new Error('WhatsApp integration not configured');
}
