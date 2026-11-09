/**
 * WhatsApp sender — thin wrapper over Meta Cloud API v18.0.
 * Supports both template messages and plain text messages.
 */

const META_GRAPH_API = 'https://graph.facebook.com/v18.0';

export interface SendWhatsAppMessageInput {
  to: string;
  templateName?: string;
  templateParams?: string[];
  text?: string;
  accessToken: string;
  phoneNumberId: string;
}

export interface SendWhatsAppMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendWhatsAppMessage(
  input: SendWhatsAppMessageInput,
): Promise<SendWhatsAppMessageResult> {
  const { to, templateName, templateParams, text, accessToken, phoneNumberId } = input;

  if (!accessToken || !phoneNumberId) {
    return { success: false, error: 'accessToken and phoneNumberId are required' };
  }

  const url = `${META_GRAPH_API}/${encodeURIComponent(phoneNumberId)}/messages`;

  let payload: Record<string, unknown>;

  if (templateName) {
    const bodyParams = (templateParams ?? []).map((p) => ({ type: 'text', text: p }));
    payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en_US' },
        components: bodyParams.length
          ? [{ type: 'body', parameters: bodyParams }]
          : [],
      },
    };
  } else if (text) {
    payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    };
  } else {
    return { success: false, error: 'Either templateName or text must be provided' };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { success: false, error: `Meta API error ${res.status}: ${errText}` };
    }

    const data = (await res.json()) as { messages?: Array<{ id: string }> };
    const messageId = data.messages?.[0]?.id ?? `wa-${Date.now()}`;
    return { success: true, messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
