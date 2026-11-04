/** Email integration stub — replace with real SMTP/SES implementation. */
export interface EmailConfig {
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
  from?: string;
}

export interface EmailPayload {
  to: string;
  subject: string;
  body_html: string;
}

export async function sendEmail(_config: EmailConfig, _payload: EmailPayload): Promise<void> {
  // TODO: implement SMTP/SES send
  throw new Error('Email integration not configured');
}
