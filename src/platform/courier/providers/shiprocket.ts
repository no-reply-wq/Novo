import type { ShipmentRequest, ShipmentResponse, TrackingEvent } from '../types';

const BASE_URL = 'https://apiv2.shiprocket.in/v1/external';

interface ShiprocketToken {
  token: string;
  expiresAt: number;
}

// Module-level token cache (per process)
const tokenCache: Record<string, ShiprocketToken> = {};

async function getToken(apiKey: string): Promise<string> {
  const cached = tokenCache[apiKey];
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  // apiKey format: "email:password"
  const [email, password] = apiKey.split(':');
  if (!email || !password) throw new Error('Shiprocket apiKey must be "email:password"');

  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) throw new Error(`Shiprocket auth failed: ${res.status}`);
  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error('Shiprocket auth: no token returned');

  tokenCache[apiKey] = { token: data.token, expiresAt: Date.now() + 23 * 60 * 60 * 1000 };
  return data.token;
}

export async function createShipment(req: ShipmentRequest, apiKey: string): Promise<ShipmentResponse> {
  const token = await getToken(apiKey);

  const payload = {
    order_id: req.orderId,
    order_date: new Date().toISOString().slice(0, 10),
    pickup_location: 'Primary',
    channel_id: '',
    billing_customer_name: req.pickupAddress.name,
    billing_last_name: '',
    billing_address: req.pickupAddress.addressLine1,
    billing_address_2: req.pickupAddress.addressLine2 ?? '',
    billing_city: req.pickupAddress.city,
    billing_pincode: req.pickupAddress.pincode,
    billing_state: req.pickupAddress.state,
    billing_country: 'India',
    billing_email: '',
    billing_phone: req.pickupAddress.phone,
    shipping_is_billing: false,
    shipping_customer_name: req.deliveryAddress.name,
    shipping_last_name: '',
    shipping_address: req.deliveryAddress.addressLine1,
    shipping_address_2: req.deliveryAddress.addressLine2 ?? '',
    shipping_city: req.deliveryAddress.city,
    shipping_pincode: req.deliveryAddress.pincode,
    shipping_country: 'India',
    shipping_state: req.deliveryAddress.state,
    shipping_email: '',
    shipping_phone: req.deliveryAddress.phone,
    order_items: [
      {
        name: `Order ${req.orderId}`,
        sku: req.orderId,
        units: 1,
        selling_price: req.declaredValue,
      },
    ],
    payment_method: req.cod ? 'COD' : 'Prepaid',
    sub_total: req.declaredValue,
    length: req.dimensions?.l ?? 10,
    breadth: req.dimensions?.w ?? 10,
    height: req.dimensions?.h ?? 10,
    weight: req.weight,
  };

  const res = await fetch(`${BASE_URL}/orders/create/adhoc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shiprocket createShipment failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    shipment_id?: number;
    awb_code?: string;
    courier_name?: string;
    freight_charge?: number;
    expected_delivery_date?: string;
  };

  return {
    trackingNumber: String(data.shipment_id ?? ''),
    awbNumber: data.awb_code ?? '',
    courierName: data.courier_name ?? 'Shiprocket',
    estimatedDelivery: data.expected_delivery_date,
    charges: data.freight_charge,
  };
}

export async function trackShipment(awbNumber: string, apiKey: string): Promise<TrackingEvent[]> {
  const token = await getToken(apiKey);

  const res = await fetch(`${BASE_URL}/courier/track/awb/${encodeURIComponent(awbNumber)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`Shiprocket trackShipment failed: ${res.status}`);

  const data = (await res.json()) as {
    tracking_data?: {
      shipment_track_activities?: Array<{
        date?: string;
        activity?: string;
        location?: string;
        'sr-status-label'?: string;
      }>;
    };
  };

  const activities = data.tracking_data?.shipment_track_activities ?? [];
  return activities.map((a) => ({
    timestamp: new Date(a.date ?? Date.now()),
    status: a['sr-status-label'] ?? a.activity ?? '',
    location: a.location ?? '',
    description: a.activity ?? '',
  }));
}

export async function cancelShipment(awbNumber: string, apiKey: string): Promise<void> {
  const token = await getToken(apiKey);

  const res = await fetch(`${BASE_URL}/orders/cancel/shipment/awbs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ awbs: [awbNumber] }),
  });

  if (!res.ok) throw new Error(`Shiprocket cancelShipment failed: ${res.status}`);
}
