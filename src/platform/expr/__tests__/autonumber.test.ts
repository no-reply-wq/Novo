import { evaluateAutoNumber } from "../autonumber-format";

const fixedDate = new Date("2024-06-15T10:00:00Z");

describe("evaluateAutoNumber", () => {
  it("YEAR token", () => expect(evaluateAutoNumber("INV-{YEAR}", { seq: 1, now: fixedDate }).value).toBe("INV-2024"));
  it("MONTH token zero-padded", () => expect(evaluateAutoNumber("{MONTH}", { seq: 1, now: fixedDate }).value).toBe("06"));
  it("DAY token zero-padded", () => expect(evaluateAutoNumber("{DAY}", { seq: 1, now: fixedDate }).value).toBe("15"));
  it("LOC token", () => expect(evaluateAutoNumber("PO-{LOC}", { seq: 1, location: "MUM", now: fixedDate }).value).toBe("PO-MUM"));
  it("LOC missing = empty", () => expect(evaluateAutoNumber("PO-{LOC}", { seq: 1, now: fixedDate }).value).toBe("PO-"));
  it("SEQ default width 4", () => {
    const { value, seqWidth } = evaluateAutoNumber("{SEQ}", { seq: 42, now: fixedDate });
    expect(value).toBe("0042");
    expect(seqWidth).toBe(4);
  });
  it("SEQ:6 custom width", () => {
    const { value, seqWidth } = evaluateAutoNumber("{SEQ:6}", { seq: 7, now: fixedDate });
    expect(value).toBe("000007");
    expect(seqWidth).toBe(6);
  });
  it("PREFIX token", () => expect(evaluateAutoNumber("{PREFIX}-{SEQ:3}", { seq: 5, prefix: "CUST", now: fixedDate }).value).toBe("CUST-005"));
  it("full PO format", () => expect(evaluateAutoNumber("PO-{YEAR}-{LOC}-{SEQ:4}", { seq: 23, location: "DEL", now: fixedDate }).value).toBe("PO-2024-DEL-0023"));
  it("custom vars", () => expect(evaluateAutoNumber("INV-{DEPT}-{SEQ:3}", { seq: 1, vars: { DEPT: "FIN" }, now: fixedDate }).value).toBe("INV-FIN-001"));
  it("unknown token kept as-is", () => expect(evaluateAutoNumber("{UNKNOWN}", { seq: 1, now: fixedDate }).value).toBe("{UNKNOWN}"));
  it("literal string passthrough", () => expect(evaluateAutoNumber("STATIC-CODE", { seq: 1, now: fixedDate }).value).toBe("STATIC-CODE"));
});
