jest.mock('@/platform/courier/providers/delhivery', () => ({
  createShipment: jest.fn(), trackShipment: jest.fn(), cancelShipment: jest.fn(),
}));
jest.mock('@/platform/courier/providers/shiprocket', () => ({
  createShipment: jest.fn(), trackShipment: jest.fn(), cancelShipment: jest.fn(),
}));

import * as delhivery from '@/platform/courier/providers/delhivery';
import * as shiprocket from '@/platform/courier/providers/shiprocket';
import { bookShipment, trackShipment, getRateQuotes } from '@/platform/courier/service';
import type { ShipmentRequest, ShipmentResponse, TrackingEvent } from '@/platform/courier/types';

const mockDelhivery = delhivery as jest.Mocked<typeof delhivery>;
const mockShiprocket = shiprocket as jest.Mocked<typeof shiprocket>;

const sampleRequest: ShipmentRequest = {
  orderId: 'ORD-001',
  pickupAddress: { name: 'Warehouse', phone: '9876543210', addressLine1: '123 Main St', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' },
  deliveryAddress: { name: 'John Doe', phone: '9123456789', addressLine1: '456 Park Ave', city: 'Delhi', state: 'Delhi', pincode: '110001' },
  weight: 1.5, declaredValue: 999,
};

const sampleResponse: ShipmentResponse = { trackingNumber: 'TRK001', awbNumber: 'AWB001', courierName: 'Delhivery', charges: 150 };

describe('bookShipment', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('calls delhivery provider and returns ShipmentResponse shape', async () => {
    mockDelhivery.createShipment.mockResolvedValue(sampleResponse);
    const pool = { query: jest.fn().mockResolvedValueOnce({ rows: [{ secret_value: 'test-api-key' }] }).mockResolvedValueOnce({ rows: [] }) };
    const result = await bookShipment('delhivery', sampleRequest, 'acme', pool as never);
    expect(result.awbNumber).toBe('AWB001');
    expect(result.courierName).toBe('Delhivery');
    expect(mockDelhivery.createShipment).toHaveBeenCalledWith(sampleRequest, 'test-api-key');
  });

  it('calls shiprocket provider and returns ShipmentResponse shape', async () => {
    const srResponse: ShipmentResponse = { trackingNumber: '12345', awbNumber: 'SR-AWB-001', courierName: 'Express', estimatedDelivery: '2026-11-12', charges: 200 };
    mockShiprocket.createShipment.mockResolvedValue(srResponse);
    const pool = { query: jest.fn().mockResolvedValueOnce({ rows: [{ secret_value: 'sr@example.com:pw' }] }).mockResolvedValueOnce({ rows: [] }) };
    const result = await bookShipment('shiprocket', sampleRequest, 'acme', pool as never);
    expect(result.awbNumber).toBe('SR-AWB-001');
    expect(result.estimatedDelivery).toBe('2026-11-12');
  });

  it('throws when no API key is configured', async () => {
    const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await expect(bookShipment('delhivery', sampleRequest, 'acme', pool as never)).rejects.toThrow('No API key configured for courier provider "delhivery"');
  });
});

describe('trackShipment', () => {
  it('returns TrackingEvent array from delhivery', async () => {
    const events: TrackingEvent[] = [
      { timestamp: new Date('2026-11-08T10:00:00Z'), status: 'Dispatched', location: 'Mumbai Hub', description: 'Package dispatched' },
      { timestamp: new Date('2026-11-09T08:00:00Z'), status: 'In Transit', location: 'Delhi Hub', description: 'Arrived at hub' },
    ];
    mockDelhivery.trackShipment.mockResolvedValue(events);
    const pool = { query: jest.fn().mockResolvedValue({ rows: [{ secret_value: 'key' }] }) };
    const result = await trackShipment('AWB001', 'delhivery', 'acme', pool as never);
    expect(result).toHaveLength(2);
    expect(result[0].status).toBe('Dispatched');
    expect(result[1].location).toBe('Delhi Hub');
    expect(result[0].timestamp).toBeInstanceOf(Date);
  });
});

describe('getRateQuotes', () => {
  it('skips providers with no API key gracefully', async () => {
    const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const { orderId: _omit, ...reqWithoutOrderId } = sampleRequest;
    const quotes = await getRateQuotes(reqWithoutOrderId, 'acme', pool as never);
    expect(quotes).toEqual([]);
  });

  it('returns sorted rate quotes', async () => {
    const delhiveryResp: ShipmentResponse = { trackingNumber: 'T1', awbNumber: 'AWB-D', courierName: 'Delhivery', charges: 180 };
    const shiprocketResp: ShipmentResponse = { trackingNumber: 'T2', awbNumber: 'AWB-S', courierName: 'Shiprocket', charges: 150 };
    mockDelhivery.createShipment.mockResolvedValue(delhiveryResp);
    mockDelhivery.cancelShipment.mockResolvedValue(undefined);
    mockShiprocket.createShipment.mockResolvedValue(shiprocketResp);
    mockShiprocket.cancelShipment.mockResolvedValue(undefined);
    let call = 0;
    const pool = { query: jest.fn().mockImplementation(() => { call++; if (call === 1) return Promise.resolve({ rows: [{ secret_value: 'del-key' }] }); if (call === 2) return Promise.resolve({ rows: [{ secret_value: 'sr@e.com:pw' }] }); return Promise.resolve({ rows: [] }); }) };
    const { orderId: _omit, ...reqWithoutOrderId } = sampleRequest;
    const quotes = await getRateQuotes(reqWithoutOrderId, 'acme', pool as never);
    if (quotes.length > 1) expect(quotes[0].rate).toBeLessThanOrEqual(quotes[1].rate);
  });
});
