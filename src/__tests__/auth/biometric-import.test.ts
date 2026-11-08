/**
 * Tests for src/platform/hr/biometric-import.ts
 *
 * Tests parsing of Format A (ID,Date,Time,Type) and Format B (ID,DateTime,Direction).
 * Also validates bad row handling.
 */

import { parseBiometricCsv, type BiometricRecord } from '@/platform/hr/biometric-import';

function toBuffer(text: string): Buffer {
  return Buffer.from(text, 'utf-8');
}

describe('Biometric Import — platform/hr/biometric-import', () => {
  describe('parseBiometricCsv() — Format A: ID,Date,Time,Type', () => {
    it('parses a clean Format A CSV', async () => {
      const csv = `ID,Date,Time,Type
EMP01,2024-01-15,09:00:00,IN
EMP01,2024-01-15,18:30:00,OUT
EMP02,2024-01-15,09:15:00,ENTRY`;

      const records = await parseBiometricCsv(toBuffer(csv));
      expect(records).toHaveLength(3);

      expect(records[0]).toMatchObject<Partial<BiometricRecord>>({
        employeeId: 'EMP01',
        type: 'in',
      });
      expect(records[0].timestamp).toBeInstanceOf(Date);

      expect(records[1]).toMatchObject<Partial<BiometricRecord>>({
        employeeId: 'EMP01',
        type: 'out',
      });

      expect(records[2].type).toBe('in'); // ENTRY → in
    });

    it('handles Windows line endings (CRLF)', async () => {
      const csv = 'EMP01,2024-01-15,09:00:00,IN\r\nEMP02,2024-01-15,09:30:00,OUT\r\n';
      const records = await parseBiometricCsv(toBuffer(csv));
      expect(records).toHaveLength(2);
    });

    it('skips header-only file', async () => {
      const csv = 'ID,Date,Time,Type';
      const records = await parseBiometricCsv(toBuffer(csv));
      expect(records).toHaveLength(0);
    });
  });

  describe('parseBiometricCsv() — Format B: ID,DateTime,Direction', () => {
    it('parses a clean Format B CSV', async () => {
      const csv = `ID,DateTime,Direction
EMP03,2024-01-15 08:45:00,IN
EMP03,2024-01-15 17:00:00,EXIT
EMP04,2024-01-15T08:00:00,CHECK-IN`;

      const records = await parseBiometricCsv(toBuffer(csv));
      expect(records).toHaveLength(3);
      expect(records[0].employeeId).toBe('EMP03');
      expect(records[0].type).toBe('in');
      expect(records[1].type).toBe('out'); // EXIT → out
      expect(records[2].type).toBe('in');  // CHECK-IN → in
    });

    it('parses Format B with optional DeviceID (Format C)', async () => {
      const csv = 'EMP01,2024-01-15 09:00:00,IN,GATE-01\nEMP01,2024-01-15 18:00:00,OUT,GATE-02';
      const records = await parseBiometricCsv(toBuffer(csv));
      expect(records).toHaveLength(2);
      expect(records[0].deviceId).toBe('GATE-01');
      expect(records[1].deviceId).toBe('GATE-02');
    });
  });

  describe('parseBiometricCsv() — bad rows', () => {
    it('skips rows with invalid dates', async () => {
      const csv = 'EMP01,NOT-A-DATE,09:00:00,IN\nEMP02,2024-01-15,09:00:00,IN';
      const records = await parseBiometricCsv(toBuffer(csv));
      expect(records).toHaveLength(1);
      expect(records[0].employeeId).toBe('EMP02');
    });

    it('skips rows with unknown punch type', async () => {
      const csv = 'EMP01,2024-01-15,09:00:00,LUNCH\nEMP02,2024-01-15,09:30:00,OUT';
      const records = await parseBiometricCsv(toBuffer(csv));
      expect(records).toHaveLength(1);
      expect(records[0].type).toBe('out');
    });

    it('skips rows with too few columns', async () => {
      const csv = 'EMP01,2024-01-15\nEMP02,2024-01-15,09:00:00,IN';
      const records = await parseBiometricCsv(toBuffer(csv));
      expect(records).toHaveLength(1);
    });

    it('handles an empty buffer', async () => {
      const records = await parseBiometricCsv(toBuffer(''));
      expect(records).toHaveLength(0);
    });

    it('handles all-bad rows gracefully', async () => {
      const csv = 'BAD,,\n,ALSO-BAD,\nNO-TYPE,2024-01-15,09:00:00,';
      const records = await parseBiometricCsv(toBuffer(csv));
      expect(records).toHaveLength(0);
    });
  });
});
