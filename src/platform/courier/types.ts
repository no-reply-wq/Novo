export type CourierProvider = 'delhivery' | 'shiprocket' | 'bluedart' | 'dtdc';

export interface Address {
  name: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
}

export interface ShipmentRequest {
  orderId: string;
  pickupAddress: Address;
  deliveryAddress: Address;
  weight: number;        // kg
  dimensions?: { l: number; w: number; h: number };  // cm
  declaredValue: number;
  cod?: number;          // cash on delivery amount
  serviceType?: string;  // 'express', 'surface', etc.
}

export interface ShipmentResponse {
  trackingNumber: string;
  awbNumber: string;
  courierName: string;
  estimatedDelivery?: string;
  label?: string;        // base64 PDF label
  charges?: number;
}

export interface TrackingEvent {
  timestamp: Date;
  status: string;
  location: string;
  description: string;
}
