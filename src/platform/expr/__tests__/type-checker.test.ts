import { typeCheck } from "../type-checker";
import { parseExpression } from "../parser";
import type { ExprType } from "../index";

function check(src: string, fieldTypes: Record<string, ExprType> = {}) {
  return typeCheck(parseExpression(src), fieldTypes);
}

describe("typeCheck — literals", () => {
  it("number", () => expect(check("42").inferredType).toBe("number"));
  it("text", () => expect(check("\"hello\"").inferredType).toBe("text"));
  it("boolean", () => expect(check("true").inferredType).toBe("boolean"));
  it("null", () => expect(check("null").inferredType).toBe("null"));
  it("array", () => expect(check("[1,2,3]").inferredType).toBe("array"));
});

describe("typeCheck — arithmetic", () => {
  it("number + number = number", () => expect(check("1 + 2").inferredType).toBe("number"));
  it("text + anything = text", () => expect(check("\"a\" + 1").inferredType).toBe("text"));
  it("subtraction = number", () => expect(check("5 - 3").inferredType).toBe("number"));
});

describe("typeCheck — comparisons", () => {
  it("= returns boolean", () => expect(check("1 = 1").inferredType).toBe("boolean"));
  it("AND returns boolean", () => expect(check("true AND false").inferredType).toBe("boolean"));
  it("IN returns boolean", () => expect(check("\"a\" IN [\"a\",\"b\"]").inferredType).toBe("boolean"));
});

describe("typeCheck — functions", () => {
  it("SUM returns number", () => expect(check("SUM(1,2,3)").inferredType).toBe("number"));
  it("CONCAT returns text", () => expect(check("CONCAT(\"a\",\"b\")").inferredType).toBe("text"));
  it("IF returns any", () => expect(check("IF(true, 1, 2)").inferredType).toBe("any"));
  it("TODAY returns date", () => expect(check("TODAY()").inferredType).toBe("date"));
  it("FORMAT_INR returns text", () => expect(check("FORMAT_INR(123456)").inferredType).toBe("text"));
  it("AMOUNT_IN_WORDS returns text", () => expect(check("AMOUNT_IN_WORDS(1000)").inferredType).toBe("text"));
  it("MOD returns number", () => expect(check("MOD(10, 3)").inferredType).toBe("number"));
  it("POWER returns number", () => expect(check("POWER(2, 10)").inferredType).toBe("number"));
  it("SQRT returns number", () => expect(check("SQRT(16)").inferredType).toBe("number"));
});

describe("typeCheck — warnings", () => {
  it("warns on unknown function", () => {
    const result = check("MADE_UP_FN(1)");
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0].message).toContain("MADE_UP_FN");
    expect(result.inferredType).toBe("any");
  });
});

describe("typeCheck — field resolution", () => {
  it("resolves from fieldTypes map", () => expect(check("qty", { qty: "number" }).inferredType).toBe("number"));
  it("falls back to any for unknown fields", () => expect(check("unknown_field").inferredType).toBe("any"));
});

describe("typeCheck — ok flag", () => {
  it("true for valid expression", () => expect(check("1 + 2").ok).toBe(true));
  it("false when boolean passed to numeric fn", () => {
    expect(check("SUM(true)").ok).toBe(false);
  });
});
