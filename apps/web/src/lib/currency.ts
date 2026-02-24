/**
 * Currency formatting utilities using Intl.NumberFormat.
 */

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'INR' | 'AUD' | 'CAD' | 'JPY' | 'CNY';

const LOCALE_MAP: Record<CurrencyCode, string> = {
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
  INR: 'en-IN',
  AUD: 'en-AU',
  CAD: 'en-CA',
  JPY: 'ja-JP',
  CNY: 'zh-CN',
};

/**
 * Format an amount in the given currency.
 */
export function formatCurrency(
  amount: number,
  currency: CurrencyCode = 'USD',
  options?: { compact?: boolean },
): string {
  const locale = LOCALE_MAP[currency] ?? 'en-US';
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: options?.compact ? 'compact' : 'standard',
    maximumFractionDigits: currency === 'JPY' ? 0 : 2,
  });
  return formatter.format(amount);
}

/**
 * Convert an amount from one currency to another using a given rate.
 */
export function convertAmount(
  amount: number,
  rate: number,
): number {
  return amount * rate;
}
