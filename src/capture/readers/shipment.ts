/**
 * Shipment-quote reader (D-19).
 *
 * Normalizes the response of POST /v4/shipment/ (spike
 * finding 2026-10-09) into the stored ShipmentRecord.
 * The quote lists one package per vendor group; each
 * package's submit_types[0].shipping_cost is the real
 * fee the user is charged for that package.
 *
 * Pure: no I/O, no DOM - the delegated fetch supplies
 * the parsed JSON.
 */
import type { ShipmentPackage, ShipmentRecord } from '../../shared/types';
import { rialToToman } from '../normalize';

/** Shape-inspected accessors: the quote is API data, never trusted. */
function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function asString(v: unknown): string {
  // The API's ids are numbers (product.id, variant.id);
  // the internal model is string-keyed - coerce.
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
}

/**
 * Extracts the delivery packages from a /v4/shipment/
 * response. Returns null when the response carries no
 * quotable packages (the record is then simply not
 * stored - fees stay as the product API reported them).
 */
export function readShipmentRecord(json: unknown, capturedAt: string): ShipmentRecord | null {
  const data = asRecord(asRecord(json).data);
  const shipmentTypes = asRecord(data.shipment_types);
  // "normal" delivery is the only shipment type the
  // quote reliably carries for seller-shipped goods.
  const packages = asArray(shipmentTypes.normal)
    .map((raw) => readPackage(asRecord(raw)))
    .filter((p): p is ShipmentPackage => p !== null);
  if (packages.length === 0) return null;
  return { key: 'latest', capturedAt, packages };
}

function readPackage(raw: Record<string, unknown>): ShipmentPackage | null {
  // The shipment API, like every payload, reports Rial; the
  // canonical model is Toman (SDD 08 money convention - the
  // conversion happens here, once, so downstream never mixes
  // units. The first D-19 build stored the raw value, which
  // inflated every corrected fee 10x against the product-API
  // fees already converted to Toman.
  const shippingCostRial = asNumber(asRecord(asArray(raw.submit_types)[0]).shipping_cost);
  if (shippingCostRial === null) return null;
  const items = asArray(raw.cart_items)
    .map((rawItem) => {
      const it = asRecord(rawItem);
      const productId = asString(asRecord(it.product).id);
      const variantId = asString(asRecord(it.variant).id);
      return productId && variantId ? { productId, variantId } : null;
    })
    .filter((it): it is { productId: string; variantId: string } => it !== null);
  if (items.length === 0) return null;
  return {
    shipmentId: asString(raw.shipment_id),
    shippingCost: rialToToman(shippingCostRial),
    items,
  };
}
