/**
 * Indian/ERP-specific functions:
 *   FORMAT_INR(n)      — formats as \u20b91,23,456.78 (lakh/crore grouping)
 *   AMOUNT_IN_WORDS(n) — "Rupees One Lakh Twenty Three Thousand ... and X Paise Only"
 */

import type { ExprValue } from "../index";

function formatINR(n: number): string {
  if (!isFinite(n)) return "\u20b90.00";
  const isNeg = n < 0;
  const abs = Math.abs(n);
  const paise = Math.round((abs % 1) * 100);
  const rupees = Math.floor(abs);
  const s = String(rupees);
  let formatted: string;
  if (s.length <= 3) {
    formatted = s;
  } else {
    const last3 = s.slice(-3);
    const rest = s.slice(0, s.length - 3);
    const groups = rest.match(/.{1,2}(?=(.{2})*$)/g) ?? [];
    formatted = groups.join(",") + "," + last3;
  }
  const paiseStr = String(paise).padStart(2, "0");
  return (isNeg ? "-\u20b9" : "\u20b9") + formatted + "." + paiseStr;
}

const ones = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function wordsBelowThousand(n: number): string {
  if (n === 0) return "";
  if (n < 20) return ones[n];
  if (n < 100) {
    const t = tens[Math.floor(n / 10)];
    const o = ones[n % 10];
    return o ? t + " " + o : t;
  }
  const h = ones[Math.floor(n / 100)];
  const rest = n % 100;
  return h + " Hundred" + (rest ? " " + wordsBelowThousand(rest) : "");
}

function amountInWords(n: number): string {
  if (!isFinite(n) || isNaN(n)) return "Invalid Amount";
  const isNeg = n < 0;
  const abs = Math.abs(n);
  const rupees = Math.floor(abs);
  const paise = Math.round((abs - rupees) * 100);
  const parts: string[] = [];
  const crore = Math.floor(rupees / 10_000_000);
  const lakh = Math.floor((rupees % 10_000_000) / 100_000);
  const thousand = Math.floor((rupees % 100_000) / 1_000);
  const rem = rupees % 1_000;
  if (crore > 0) parts.push(wordsBelowThousand(crore) + " Crore");
  if (lakh > 0) parts.push(wordsBelowThousand(lakh) + " Lakh");
  if (thousand > 0) parts.push(wordsBelowThousand(thousand) + " Thousand");
  if (rem > 0) parts.push(wordsBelowThousand(rem));
  const rupeePart = parts.length > 0 ? parts.join(" ") : "Zero";
  let result = (isNeg ? "Minus " : "") + "Rupees " + rupeePart;
  if (paise > 0) result += " and " + wordsBelowThousand(paise) + " Paise";
  return result + " Only";
}

export const indianFunctions: Record<string, (args: ExprValue[]) => ExprValue> = {
  FORMAT_INR(args) {
    const v = args[0];
    if (v === null || v === undefined) return "\u20b90.00";
    const n = typeof v === "number" ? v : Number(v);
    if (isNaN(n)) return "\u20b90.00";
    return formatINR(n);
  },
  AMOUNT_IN_WORDS(args) {
    const v = args[0];
    if (v === null || v === undefined) return "Rupees Zero Only";
    const n = typeof v === "number" ? v : Number(v);
    if (isNaN(n)) return "Invalid Amount";
    return amountInWords(n);
  },
};
