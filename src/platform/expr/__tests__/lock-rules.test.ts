import { isRecordLocked } from "../lock-rules";

describe("isRecordLocked", () => {
  it("true when expr is true", () => {
    expect(isRecordLocked({ status: "Approved" }, "record.status = \"Approved\"", ["user"])).toBe(true);
  });
  it("false when expr is false", () => {
    expect(isRecordLocked({ status: "Draft" }, "record.status = \"Approved\"", ["user"])).toBe(false);
  });
  it("exception role bypasses lock", () => {
    expect(isRecordLocked({ status: "Approved" }, "record.status = \"Approved\"", ["admin"], ["admin"])).toBe(false);
  });
  it("non-exception role is still locked", () => {
    expect(isRecordLocked({ status: "Approved" }, "record.status = \"Approved\"", ["user"], ["admin"])).toBe(true);
  });
  it("any matching role bypasses lock", () => {
    expect(isRecordLocked({ status: "Approved" }, "record.status = \"Approved\"", ["user", "manager"], ["manager"])).toBe(false);
  });
  it("bad expression = not locked (permissive default)", () => {
    expect(isRecordLocked({}, "!!!invalid@@@", ["user"])).toBe(false);
  });
  it("arithmetic lock condition", () => {
    expect(isRecordLocked({ amount: 100000 }, "record.amount >= 100000", ["clerk"])).toBe(true);
    expect(isRecordLocked({ amount: 50 }, "record.amount >= 100000", ["clerk"])).toBe(false);
  });
  it("empty exception roles = no bypass", () => {
    expect(isRecordLocked({ status: "Posted" }, "record.status = \"Posted\"", ["admin"], [])).toBe(true);
  });
});
