import type { StepDef, WorkflowContext, StepResult, WorkflowDeps } from '../types';
import { bookShipment } from '@/platform/courier/service';
import type { CourierProvider, Address } from '@/platform/courier/types';

function resolveTemplate(template: string, ctx: WorkflowContext): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, path: string) => {
    const parts = path.trim().split('.');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let val: any = ctx.triggerData;
    for (const part of parts) {
      if (val === null || val === undefined) break;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      val = val[part];
    }
    return val !== undefined && val !== null ? String(val) : '';
  });
}

function resolveAddress(raw: unknown, ctx: WorkflowContext): Address {
  if (typeof raw === 'string') {
    const resolved = resolveTemplate(raw, ctx);
    try {
      return JSON.parse(resolved) as Address;
    } catch {
      throw new Error(`send_shipment: could not parse address from field reference: ${raw}`);
    }
  }
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    return {
      name: resolveTemplate(String(obj.name ?? ''), ctx),
      phone: resolveTemplate(String(obj.phone ?? ''), ctx),
      addressLine1: resolveTemplate(String(obj.addressLine1 ?? ''), ctx),
      addressLine2: obj.addressLine2 ? resolveTemplate(String(obj.addressLine2), ctx) : undefined,
      city: resolveTemplate(String(obj.city ?? ''), ctx),
      state: resolveTemplate(String(obj.state ?? ''), ctx),
      pincode: resolveTemplate(String(obj.pincode ?? ''), ctx),
    };
  }
  throw new Error('send_shipment: invalid address config');
}

export async function executeStep(
  step: StepDef,
  ctx: WorkflowContext,
  deps: WorkflowDeps,
): Promise<StepResult> {
  const provider = (step.config['provider'] as CourierProvider | undefined) ?? 'delhivery';
  const weight = Number(step.config['weight'] ?? 0.5);
  const declaredValue = Number(step.config['declaredValue'] ?? 0);
  const cod = step.config['cod'] !== undefined ? Number(step.config['cod']) : undefined;
  const serviceType = step.config['serviceType'] as string | undefined;

  const pickupAddress = resolveAddress(step.config['pickupAddress'], ctx);
  const deliveryAddress = resolveAddress(step.config['deliveryAddress'], ctx);

  const orderId = resolveTemplate(
    (step.config['orderId'] as string | undefined) ?? '{{record.id}}',
    ctx,
  );

  if (!orderId) throw new Error('send_shipment: orderId is required');

  const response = await bookShipment(
    provider,
    { orderId, pickupAddress, deliveryAddress, weight, declaredValue, cod, serviceType },
    ctx.tenantSlug,
    deps.pgPool,
  );

  const awbField = step.config['awbField'] as string | undefined;
  if (awbField) {
    const recordId = String((ctx.triggerData as Record<string, unknown>)?.record?.id ?? orderId);
    const tableApiKey = step.config['tableApiKey'] as string | undefined;
    if (tableApiKey && recordId) {
      await deps.pgPool.query(
        `UPDATE app_${ctx.appId.replace(/-/g, '_')}.${tableApiKey}
         SET data = jsonb_set(data, '{${awbField}}', $1::jsonb)
         WHERE id = $2 AND tenant_slug = $3`,
        [JSON.stringify(response.awbNumber), recordId, ctx.tenantSlug],
      );
    }
  }

  return {
    output: {
      awbNumber: response.awbNumber,
      trackingNumber: response.trackingNumber,
      courierName: response.courierName,
      charges: response.charges,
    },
    logs: [
      `Shipment booked via ${response.courierName}: AWB ${response.awbNumber}`,
      ...(response.charges ? [`Charges: Rs. ${response.charges}`] : []),
    ],
  };
}
