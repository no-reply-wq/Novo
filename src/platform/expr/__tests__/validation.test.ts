import { validateRecord } from "../validation";
import type { ValidationRule } from "../validation";
import type { ExprType } from "../index";

const fieldTypes: Record<string, ExprType> = { qty: "number", unit_price: "number", status: "text" };

describe("validateRecord", () => {
  it("passes when all rules evaluate true", () => {
    const errors = validateRecord(
      { qty: 5, unit_price: 10 },
      [{ expr: "qty > 0", message: "Qty must be > 0" }],
      fieldTypes
    );
    expect(errors).toHaveLength(0);
  });
  it("returns violations for failed rules", () => {
    const errors = validateRecord(
      { qty: 0 },
      [{ field: "qty", expr: "qty > 0", message: "Qty must be > 0" }],
      fieldTypes
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe("qty");
    expect(errors[0].message).toBe("Qty must be > 0");
  });
  it("reports all violations", () => {
    const errors = validateRecord(
      { qty: 0, unit_price: 0 },
      [
        { field: "qty", expr: "qty > 0", message: "Qty must be > 0" },
        { field: "unit_price", expr: "unit_price > 0", message: "Price must be > 0" },
      ],
      fieldTypes
    );
    expect(errors).toHaveLength(2);
  });
  it("handles string comparisons", () => {
    const errors = validateRecord(
      { status: "Cancelled" },
      [{ field: "status", expr: "status != \"Cancelled\"", message: "Cannot modify cancelled records" }],
      fieldTypes
    );
    expect(errors).toHaveLength(1);
  });
  it("COALESCE null-safe expressions", () => {
    const errors = validateRecord(
      { qty: null },
      [{ field: "qty", expr: "COALESCE(qty, 0) >= 0", message: "Qty must be non-negative" }],
      fieldTypes
    );
    expect(errors).toHaveLength(0);
  });
  it("unknown function returns null = violation", () => {
    const errors = validateRecord(
      { qty: 5 },
      [{ field: "qty", expr: "UNKNOWN_FN(qty)", message: "Should fail" }],
      fieldTypes
    );
    expect(errors).toHaveLength(1);
  });
  it("supports user context", () => {
    const errors = validateRecord(
      { approved_by: "u1" },
      [{ expr: "approved_by = user.id", message: "Must be approved by current user" }],
      fieldTypes,
      { user: { id: "u1", email: "test@test.com", roles: [], locations: [] } }
    );
    expect(errors).toHaveLength(0);
  });
  it("empty rules = no errors", () => {
    expect(validateRecord({ qty: 5 }, [], fieldTypes)).toEqual([]);
  });
});
