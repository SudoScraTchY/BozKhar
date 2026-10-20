/**
 * Torob comparison normalization + worker handler (D-42).
 *
 * Live shape 2026-10-20: search results carry `random_key` / `name1` /
 * `web_client_absolute_url`; details put seller rows under
 * `products_info.result` with `shop_name`, `price` (Toman) and `page_url`.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  normalizeTorobComparison,
  pickTorobProduct,
  torobDetailsApiUrl,
  torobSearchApiUrl,
  type TorobResponse,
} from '../src/torob/api';
import { handleTorobCompare } from '../src/torob/handler';

const QUERY = 'گوشی موبایل شیائومی مدل Poco X8 Pro دو سیم‌کارت ظرفیت 512 گیگابایت و رم 12 گیگابایت';

const SEARCH = {
  results: [
    {
      random_key: 'ad-prk',
      name1: 'گوشی شیائومی Poco X8 Pro 5G | حافظه 512 رم 12 گیگابایت',
      web_client_absolute_url: '/p/ad-prk/x/',
      price: 168_400_000,
      is_adv: true,
    },
    {
      random_key: 'organic-prk',
      name1: 'گوشی شیائومی Poco X8 Pro 5G | حافظه 512 رم 12 گیگابایت',
      web_client_absolute_url: '/p/organic-prk/x/',
      price: 168_400_000,
      is_adv: false,
    },
    {
      random_key: 'other-prk',
      name1: 'گوشی سامسونگ S26 Ultra 5G | حافظه 256 رم 12 گیگابایت',
      web_client_absolute_url: '/p/other-prk/x/',
      price: 360_000_000,
    },
  ],
};

const DETAILS = {
  products_info: {
    count: 8,
    result: [
      {
        prk: 'offer-2',
        shop_name: 'فروشگاه ب',
        shop_name2: 'کرج',
        price: 2_000_000,
        page_url: 'https://api.torob.com/v4/product-page/redirect/?prk=offer-2',
        score_info: { score_text: '★۴' },
        postage_fee: 'هزینه ارسال ۵۰٬۰۰۰ تومان',
      },
      // same shop + price with another prk: one display row
      { prk: 'offer-2b', shop_name: 'فروشگاه ب', price: 2_000_000 },
      {
        prk: 'offer-1',
        shop_name: 'فروشگاه الف',
        shop_name2: 'تهران',
        price: 1_000_000,
        page_url: 'javascript:alert(1)',
        score_info: { score_text: '★۵' },
      },
      // duplicate prk: kept once
      { prk: 'offer-1', shop_name: 'تکراری', price: 900_000 },
      { prk: 'unavailable', shop_name: 'ناموجود', price: 500_000, availability: false },
      { prk: 'free', shop_name: 'صفر', price: 0 },
    ],
  },
};

describe('Torob product matching', () => {
  it('picks the model match and ignores unrelated phones', () => {
    const product = pickTorobProduct(QUERY, SEARCH);
    expect(product?.prk).toBe('ad-prk');
    expect(product?.url).toBe('https://torob.com/p/ad-prk/x/');
  });

  it('returns null when no candidate shares the model tokens', () => {
    expect(pickTorobProduct('آیفون ۱۸ پرو مکس', SEARCH)).toBeNull();
  });

  it('prefers the canonical listing over a single-shop color variant', () => {
    const withVariant = {
      results: [
        {
          random_key: 'base-prk',
          name1: 'گوشی شیائومی Poco X8 Pro 5G | حافظه 512 رم 12 گیگابایت',
          shop_text: 'در ۵۴ فروشگاه',
        },
        {
          random_key: 'green-prk',
          name1:
            'گوشی موبایل شیائومی مدل Poco X8 Pro دو سیم‌کارت ظرفیت 512 گیگابایت و رم 12 گیگابایت - سبز',
          shop_text: 'در ۱ فروشگاه',
        },
      ],
    };
    // The green row matches one more token, but the base listing has 54
    // sellers; Torob's canonical product is the useful comparison target.
    expect(pickTorobProduct(QUERY, withVariant)?.prk).toBe('base-prk');
  });

  it('rejects sibling models that miss a model token (X7 / F8)', () => {
    const siblings = {
      results: [
        {
          random_key: 'x7-prk',
          name1: 'گوشی شیائومی Poco X7 Pro 5G | حافظه 512 رم 12 گیگابایت',
          shop_text: 'در ۹۰ فروشگاه',
        },
        {
          random_key: 'f8-prk',
          name1: 'گوشی شیائومی Poco F8 Pro 5G | حافظه 512 رم 12 گیگابایت',
          shop_text: 'در ۹۰ فروشگاه',
        },
      ],
    };
    expect(pickTorobProduct(QUERY, siblings)).toBeNull();
  });

  it('builds q= URLs (query= returns a generic Torob feed)', () => {
    expect(torobSearchApiUrl('Poco X8 Pro')).toContain('q=Poco+X8+Pro');
    expect(torobSearchApiUrl('Poco X8 Pro')).not.toContain('query=');
    expect(torobDetailsApiUrl('prk-1')).toContain('prk=prk-1');
  });
});

describe('Torob comparison normalization', () => {
  it('sorts sellers by price, drops invalid rows, and caps the list', () => {
    const comparison = normalizeTorobComparison(QUERY, SEARCH, DETAILS);
    expect(comparison.productName).toContain('Poco X8 Pro');
    expect(comparison.productUrl).toBe('https://torob.com/p/ad-prk/x/');
    expect(comparison.offers.map((offer) => offer.priceToman)).toEqual([1_000_000, 2_000_000]);
    expect(comparison.offers[0]!.shopName).toBe('فروشگاه الف');
    expect(comparison.offers[0]!.url).toBeNull(); // javascript: URL dropped
    expect(comparison.offers[1]!.postage).toContain('هزینه ارسال');
    expect(comparison.shopCount).toBe(8);
  });

  it('returns an empty comparison when the product does not match', () => {
    const comparison = normalizeTorobComparison('آیفون ۱۸ پرو مکس', SEARCH, DETAILS);
    expect(comparison.productName).toBeNull();
    expect(comparison.offers).toEqual([]);
    expect(comparison.shopCount).toBe(0);
  });
});

describe('Torob worker handler', () => {
  function jsonResponse(payload: unknown, status = 200): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
    } as Response;
  }

  it('fetches search then details and returns normalized offers', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(SEARCH))
      .mockResolvedValueOnce(jsonResponse(DETAILS));
    const response = (await handleTorobCompare(fetchFn, QUERY)) as Extract<
      TorobResponse,
      { ok: true }
    >;
    expect(response.ok).toBe(true);
    expect(response.comparison.offers).toHaveLength(2);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(String(fetchFn.mock.calls[0]![0])).toContain('q=');
    expect(String(fetchFn.mock.calls[1]![0])).toContain('prk=ad-prk');
    expect(fetchFn.mock.calls[0]![1]).toMatchObject({
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  });

  it('skips the details request when Torob has no matching product', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(jsonResponse(SEARCH));
    const response = (await handleTorobCompare(fetchFn, 'آیفون ۱۸ پرو مکس')) as Extract<
      TorobResponse,
      { ok: true }
    >;
    expect(response.ok).toBe(true);
    expect(response.comparison.productName).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('maps HTTP failures and rejects empty queries', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(jsonResponse({}, 503));
    const failed = await handleTorobCompare(fetchFn, QUERY);
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.errorCode).toBe('HTTP_STATUS');

    const bad = await handleTorobCompare(vi.fn(), '  ');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errorCode).toBe('BAD_REQUEST');
  });
});
