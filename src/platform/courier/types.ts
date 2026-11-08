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
  weight: number;
  dimensions?: { l: number; w: number; h: number };
  declaredValue: number;
  cod?: number;
  serviceType?: string;
}

export interface ShipmentResponse {
  trackingNumber: string;
  awbNumber: string;
  courierName: string;
  estimatedDelivery?: string;
  label?: string;
  charges?: number;
}

export interface TrackingEvent {
  timestamp: Date;
  status: string;
  location: string;
  description: string;
}
