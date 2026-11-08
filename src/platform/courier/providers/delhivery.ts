import type { ShipmentRequest, ShipmentResponse, TrackingEvent } from '../types';

const BASE_URL = 'https://track.delhivery.com';

function buildShipmentPayload(req: ShipmentRequest) {
  return {
    shipments: [
      {
        name: req.deliveryAddress.name,
        add: req.deliveryAddress.addressLine1 + (req.deliveryAddress.addressLine2 ? ` ${req.deliveryAddress.addressLine2}` : ''),
        pin: req.deliveryAddress.pincode,
        city: req.deliveryAddress.city,
        state: req.deliveryAddress.state,
        country: 'India',
        phone: req.deliveryAddress.phone,
        order: req.orderId,
        payment_mode: req.cod ? 'COD' : 'Prepaid',
        return_pin: req.pickupAddress.pincode,
        return_city: req.pickupAddress.city,
        return_phone: req.pickupAddress.phone,
        return_name: req.pickupAddress.name,
        return_add: req.pickupAddress.addressLine1,
        return_state: req.pickupAddress.state,
        return_country: 'India',
        products_desc: `Order ${req.orderId}`,
        hsn_code: '',
        cod_amount: req.cod ?? 0,
        order_date: new Date().toISOString(),
        total_amount: req.declaredValue,
        seller_add: req.pickupAddress.addressLine1,
        seller_name: req.pickupAddress.name,
        seller_inv: req.orderId,
        quantity: 1,
        waybill: '',
        shipment_width: req.dimensions?.w ?? 10,
        shipment_height: req.dimensions?.h ?? 10,
        weight: req.weight,
        shipment_length: req.dimensions?.l ?? 10,
        seller_gst_tin: '',
        shipping_mode: req.serviceType === 'surface' ? 'Surface' : 'Express',
        address_type: 'home',
      },
    ],
  };
}

export async function createShipment(req: ShipmentRequest, apiKey: string): Promise<ShipmentResponse> {
  const payload = buildShipmentPayload(req);
  const form = new URLSearchParams();
  form.set('format', 'json');
  form.set('data', JSON.stringify(payload));

  const res = await fetch(`${BASE_URL}/api/cmu/create.json`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Delhivery createShipment failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    packages?: Array<{ waybill?: string; sort_code?: string; charges?: number }>;
    rmk?: string;
    success?: boolean;
  };

  if (!data.success || !data.packages?.[0]?.waybill) {
    throw new Error(`Delhivery createShipment error: ${data.rmk ?? 'unknown'}`);
  }

  const pkg = data.packages[0];
  return {
    trackingNumber: pkg.waybill ?? '',
    awbNumber: pkg.waybill ?? '',
    courierName: 'Delhivery',
    charges: pkg.charges,
  };
}

export async function trackShipment(awbNumber: string, apiKey: string): Promise<TrackingEvent[]> {
  const res = await fetch(`${BASE_URL}/api/v1/packages/json/?waybill=${encodeURIComponent(awbNumber)}&verbose=1`, {
    headers: { Authorization: `Token ${apiKey}` },
  });

  if (!res.ok) {
    throw new Error(`Delhivery trackShipment failed: ${res.status}`);
  }

  const data = (await res.json()) as {
    ShipmentData?: Array<{
      Shipment?: {
        Scans?: Array<{
          ScanDetail?: {
            ScanDateTime?: string;
            Scan?: string;
            ScannedLocation?: string;
            Instructions?: string;
          };
        }>;
      };
    }>;
  };

  const scans = data.ShipmentData?.[0]?.Shipment?.Scans ?? [];
  return scans
    .filter((s) => s.ScanDetail)
    .map((s) => ({
      timestamp: new Date(s.ScanDetail!.ScanDateTime ?? Date.now()),
      status: s.ScanDetail!.Scan ?? '',
      location: s.ScanDetail!.ScannedLocation ?? '',
      description: s.ScanDetail!.Instructions ?? '',
    }));
}

export async function cancelShipment(awbNumber: string, apiKey: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/p/edit?waybill=${encodeURIComponent(awbNumber)}&cancellation=true`, {
    method: 'GET',
    headers: { Authorization: `Token ${apiKey}` },
  });

  if (!res.ok) {
    throw new Error(`Delhivery cancelShipment failed: ${res.status}`);
  }

  const data = (await res.json()) as { status?: boolean; message?: string };
  if (!data.status) {
    throw new Error(`Delhivery cancel error: ${data.message ?? 'unknown'}`);
  }
}
