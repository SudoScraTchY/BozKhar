/**
 * Product JSON API payload reader (primary capture source, spike S-1/S-7).
 *
 * Reads ONLY shapes documented in SDD/spike-findings.md v2:
 *   data.product.{id, title_fa, variants[]}
 *   variants[].{id, seller{id,title}, price{selling_price, is_locked_for_digiplus},
 *               in_stock?, digiplus?{services[]},
 *               shipment_methods[]{shipping_type?, providers[]}}
 *   providers[].{title, shipping_mode?, delivery_day?, price{value,is_free}?}
 *
 * Money arrives in RIAL here; conversion to Toman is the normalizer's job.
 * A known-absent fee (providers: [] or provider without price key = FBM via
 * Digikala) is NOT an error: it becomes feeRial null = unknown (spike F-4).
 */
import { structureUnrecognized } from '../errors';

export interface RawProviderPrice {
  value?: number;
  is_free?: boolean;
}

export interface RawShipmentProvider {
  title?: string;
  shipping_mode?: string;
  /** Live API: provider discriminator, e.g. 'seller' (same semantics as shipping_mode). */
  type?: string;
  delivery_day?: string | number;
  price?: RawProviderPrice;
}

export interface RawShipmentMethod {
  shipping_type?: string;
  title?: string;
  providers?: RawShipmentProvider[];
}

export interface RawVariantSeller {
  id?: number | string;
  title?: string;
}

export interface RawVariantPrice {
  selling_price?: number;
  rrp_price?: number;
  is_locked_for_digiplus?: boolean;
}

export interface RawDigiplusService {
  title?: string;
  /** Any shape; readers only look for free-shipment wording. */
  [key: string]: unknown;
}

export interface RawVariant {
  id?: number | string;
  seller?: RawVariantSeller;
  price?: RawVariantPrice;
  in_stock?: boolean;
  /** Live API: status = 'marketable' | 'unavailable' | ... (no in_stock key). */
  status?: string;
  is_inactive?: boolean;
  digiplus?: { services?: RawDigiplusService[] };
  /**
   * Live API shape is an OBJECT: {providers: [...]} (or named by class).
   * Older/captured shapes are arrays of methods. Both accepted below.
   */
  shipment_methods?: RawShipmentMethod[] | RawShipmentMethod;
}

export interface RawProductPayload {
  data?: {
    product?: {
      id?: number | string;
      title_fa?: string;
      title_en?: string;
      variants?: RawVariant[];
    };
  };
}

/** The reader's output: a validated view with unknowns made explicit. */
export interface ProductVariantView {
  variantId: string;
  sellerId: string;
  sellerName: string;
  /** Selling price in Rial; null when the variant carries no price (unpurchasable). */
  priceRial: number | null;
  stockState: 'in-stock' | 'out-of-stock' | 'unknown';
  isLargeItem: boolean;
  /** Per-seller Plus free-shipment entitlement (spike S-3). */
  plusCoversFee: boolean;
  /** Seller-class fee in Rial; null = unknown (FBM), never 0-by-default. */
  feeRial: number | null;
  /** True when a known-free fee was read (is_free) vs null-unknown. */
  feeIsKnownFree: boolean;
}

export interface ProductView {
  productId: string;
  title: string;
  variants: ProductVariantView[];
}

/** Spike S-5: large & heavy goods ship as their own class, named in Persian. */
const LARGE_ITEM_MARKERS = ['بزرگ', 'سنگین'] as const;

export function isLargeShipmentLabel(label: string | undefined): boolean {
  if (!label) return false;
  return LARGE_ITEM_MARKERS.some((m) => label.includes(m));
}

/** Spike S-3: free-shipment entitlement wording inside digiplus.services[]. */
const PLUS_FREE_SHIPMENT_MARKERS = ['ارسال رایگان', ' رایگان '] as const;

export function plusEntitlesFreeShipment(variant: RawVariant): boolean {
  if (variant.price?.is_locked_for_digiplus === true) return true;
  const services = variant.digiplus?.services;
  if (!Array.isArray(services)) return false;
  return services.some((s) => {
    const t = typeof s?.title === 'string' ? s.title : '';
    return PLUS_FREE_SHIPMENT_MARKERS.some((m) => t.includes(m));
  });
}

function firstFeeProvider(method: RawShipmentMethod): RawShipmentProvider | undefined {
  const providers = method.providers ?? [];
  return (
    providers.find((p) => p.shipping_mode === 'seller' || p.type === 'seller') ??
    providers.find((p) => p.price !== undefined) ??
    providers[0]
  );
}

/** Fee for one variant's shipment method, with explicit unknown semantics. */
function readFee(method: RawShipmentMethod | undefined): {
  feeRial: number | null;
  feeIsKnownFree: boolean;
} {
  const provider = method ? firstFeeProvider(method) : undefined;
  if (!provider || !provider.price) return { feeRial: null, feeIsKnownFree: false }; // FBM: unknown
  if (provider.price.is_free === true) return { feeRial: 0, feeIsKnownFree: true };
  if (typeof provider.price.value === 'number')
    return { feeRial: provider.price.value, feeIsKnownFree: false };
  return { feeRial: null, feeIsKnownFree: false }; // price key present but no value: unknown
}

export function readProductPayload(raw: unknown): ProductView {
  if (typeof raw !== 'object' || raw === null) {
    throw structureUnrecognized('product payload is not an object');
  }
  const product = (raw as RawProductPayload).data?.product;
  if (!product || (product.id === undefined && !product.variants)) {
    throw structureUnrecognized('data.product missing');
  }

  const productId = product.id !== undefined ? String(product.id) : '';
  if (!productId) throw structureUnrecognized('product.id missing');
  const title = product.title_fa ?? product.title_en ?? '';

  const variantsRaw = product.variants;
  if (!Array.isArray(variantsRaw)) throw structureUnrecognized('data.product.variants missing');

  const variants: ProductVariantView[] = variantsRaw.map((v, i) => {
    if (v.id === undefined) {
      throw structureUnrecognized(`variants[${i}].id missing`);
    }
    // Class: a variant whose shipment method is the large/heavy class ships
    // as its own shipment (spike S-5). Prefer the shipping_type label; fall
    // back to the method title.
    // Shape note (live smoke): the current API sends ONE object
    // {providers: [...]}; captured fixtures send an array of methods.
    // Normalize both into a method list.
    const rawMethods = v.shipment_methods;
    const methods: RawShipmentMethod[] = Array.isArray(rawMethods)
      ? rawMethods
      : rawMethods && typeof rawMethods === 'object'
        ? [rawMethods]
        : [];
    const sellerMethod = methods.find((m) => !isLargeShipmentLabel(m.shipping_type ?? m.title));
    const largeMethod = methods.find((m) => isLargeShipmentLabel(m.shipping_type ?? m.title));
    const isLargeItem =
      methods.length > 0 && sellerMethod === undefined && largeMethod !== undefined;

    const feeSource = isLargeItem ? largeMethod : (sellerMethod ?? methods[0]);
    const { feeRial, feeIsKnownFree } = readFee(feeSource);

    let stockState: ProductVariantView['stockState'] = 'unknown';
    if (v.in_stock === true || v.status === 'marketable') stockState = 'in-stock';
    else if (
      v.in_stock === false ||
      v.is_inactive === true ||
      (v.status !== undefined && v.status !== 'marketable')
    )
      stockState = 'out-of-stock';

    return {
      variantId: String(v.id),
      sellerId: v.seller?.id !== undefined ? String(v.seller.id) : '',
      sellerName: v.seller?.title ?? '',
      priceRial: typeof v.price?.selling_price === 'number' ? v.price.selling_price : null,
      stockState,
      isLargeItem,
      plusCoversFee: plusEntitlesFreeShipment(v),
      feeRial,
      feeIsKnownFree,
    };
  });

  return { productId, title, variants };
}
