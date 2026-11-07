<<<<<<< HEAD
import type { StepDef, WorkflowContext, StepResult, WorkflowDeps } from "../types";

export async function executeStep(step: StepDef, _ctx: WorkflowContext, _deps: WorkflowDeps): Promise<StepResult> {
  const to = step.config["to"] as string;
  const body = step.config["body"] as string;
  if (!to) throw new Error("send_whatsapp: to is required");
  if (!body) throw new Error("send_whatsapp: body is required");
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!accountSid || !authToken || !from) {
    throw new Error("send_whatsapp: Twilio credentials not configured");
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const twilio = require("twilio") as (sid: string, token: string) => {
    messages: { create(opts: Record<string, string>): Promise<{ sid: string }> };
  };
  const client = twilio(accountSid, authToken);
  const message = await client.messages.create({ from: `whatsapp:${from}`, to: `whatsapp:${to}`, body });
  return { output: { sid: message.sid, to }, logs: [`WhatsApp message sent to ${to} (sid: ${message.sid})`] };
=======
import type { StepDef, WorkflowContext, StepResult, WorkflowDeps } from '../types';
export async function executeStep(step: StepDef, _ctx: WorkflowContext, _deps: WorkflowDeps): Promise<StepResult> {
  const to = step.config['to'] as string;
  const body = step.config['body'] as string;
  if (!to) throw new Error('send_whatsapp: to is required');
  if (!body) throw new Error('send_whatsapp: body is required');
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!accountSid || !authToken || !from) throw new Error('send_whatsapp: Twilio credentials not configured');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const twilio = require('twilio') as (sid: string, token: string) => { messages: { create(o: Record<string, string>): Promise<{ sid: string }> } };
  const message = await twilio(accountSid, authToken).messages.create({ from: `whatsapp:${from}`, to: `whatsapp:${to}`, body });
  return { output: { sid: message.sid, to }, logs: [`WhatsApp sent to ${to}`] };
>>>>>>> 9e8f5e8 (feat(workflow): Agent F — Workflow Engine v2 complete)
}
