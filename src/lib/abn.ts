// Australian Business Number (ABN) utilities — pure, deterministic, no network.

/** Strip everything except digits. */
export function normalizeAbn(input: string): string {
  return (input || "").replace(/\D/g, "");
}

/**
 * Standard ATO ABN checksum validation.
 * 1. Reduce to digits, must be exactly 11.
 * 2. Subtract 1 from the first digit.
 * 3. Multiply each digit by its positional weight.
 * 4. Valid when the weighted sum is divisible by 89.
 */
export function isValidAbnChecksum(input: string): boolean {
  const digits = normalizeAbn(input);
  if (digits.length !== 11) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const nums = digits.split("").map((d) => Number(d));
  nums[0] -= 1;
  const sum = nums.reduce((acc, n, i) => acc + n * weights[i], 0);
  return sum % 89 === 0;
}

/** Pretty 11-digit ABN as "11 222 333 444" when complete, else raw digits. */
export function formatAbn(input: string): string {
  const d = normalizeAbn(input).slice(0, 11);
  if (d.length !== 11) return d;
  return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8, 11)}`;
}
