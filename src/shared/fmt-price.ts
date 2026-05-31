/**
 * Format a price for display.
 *
 * VN equities are quoted in full VND (e.g. 62100). The display convention is
 * to divide by 1000 so traders read "62.10" instead of "62100.0000".
 * Detection: symbol is pure alpha (VCB, HPG…) and price is a whole number ≥ 1000.
 *
 * Everything else (crypto, forex) uses up to 4 significant decimal places with
 * trailing zeros stripped.
 */
export function fmtPrice(price: number, symbol: string): string {
  const isVnEquity =
    /^[A-Z]{2,5}$/.test(symbol) && Number.isInteger(price) && price >= 1000;
  if (isVnEquity) {
    return (price / 1000).toFixed(2);
  }
  // strip trailing zeros from up to 4 decimal places
  return parseFloat(price.toFixed(4)).toString();
}
