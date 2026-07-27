/**
 * Carrier adapters — the seam between our shipping engine and real carrier APIs.
 *
 * Each adapter exposes: getRates(shipment) -> NormalizedRate[], buyLabel(rate, shipment),
 * and track(trackingNumber). The default adapters below are RUNNABLE SIMULATIONS: they
 * compute plausible rates from weight and zone so the whole flow works with no credentials.
 *
 * To go live, replace an adapter's methods with real API calls (EasyPost, Shippo, UPS,
 * FedEx, USPS). Nothing else in the codebase changes — this registry is the only seam.
 */

const money = (n) => Math.round(n);

/** Distance proxy: crude zone from postal-code prefix difference (1 = local .. 8 = far). */
export function zoneFor(fromPostal = '00000', toPostal = '00000') {
  const a = Number(String(fromPostal).slice(0, 3)) || 0;
  const b = Number(String(toPostal).slice(0, 3)) || 0;
  const diff = Math.abs(a - b);
  return Math.min(8, Math.max(1, Math.ceil(diff / 120) + 1));
}

/** Build a simulated adapter with a per-carrier price profile. */
function simulatedCarrier({ carrier, services, baseCents, perKgCents, perZoneCents }) {
  return {
    carrier,
    async getRates(shipment) {
      const kg = Math.max(0.1, (shipment.parcel?.weightG ?? 500) / 1000);
      const zone = zoneFor(shipment.from?.postalCode, shipment.to?.postalCode);
      return services.map((svc) => ({
        carrier,
        service: svc.name,
        serviceCode: svc.code,
        amount: money(baseCents * svc.multiplier + kg * perKgCents + zone * perZoneCents),
        currency: shipment.currency ?? 'USD',
        estDeliveryDays: svc.days,
      }));
    },
    async buyLabel(rate, shipment) {
      const trackingNumber = `${carrier.slice(0, 2).toUpperCase()}${Date.now().toString().slice(-10)}`;
      return {
        trackingNumber,
        labelUrl: `https://labels.example.test/${trackingNumber}.pdf`, // simulated
        carrier, service: rate.service, amount: rate.amount, currency: rate.currency,
        shipmentId: shipment.id ?? null,
      };
    },
    async track(trackingNumber) {
      return { trackingNumber, rawStatus: 'in transit', checkpoints: [] }; // simulated
    },
  };
}

export const USPS = simulatedCarrier({
  carrier: 'USPS',
  baseCents: 450, perKgCents: 180, perZoneCents: 40,
  services: [
    { code: 'GROUND_ADVANTAGE', name: 'Ground Advantage', days: 4, multiplier: 1 },
    { code: 'PRIORITY', name: 'Priority Mail', days: 2, multiplier: 1.7 },
    { code: 'PRIORITY_EXPRESS', name: 'Priority Express', days: 1, multiplier: 3.2 },
  ],
});

export const UPS = simulatedCarrier({
  carrier: 'UPS',
  baseCents: 700, perKgCents: 220, perZoneCents: 65,
  services: [
    { code: 'GROUND', name: 'UPS Ground', days: 5, multiplier: 1 },
    { code: 'SECOND_DAY', name: '2nd Day Air', days: 2, multiplier: 2.1 },
    { code: 'NEXT_DAY', name: 'Next Day Air', days: 1, multiplier: 4.0 },
  ],
});

export const FEDEX = simulatedCarrier({
  carrier: 'FEDEX',
  baseCents: 680, perKgCents: 240, perZoneCents: 60,
  services: [
    { code: 'HOME_DELIVERY', name: 'Home Delivery', days: 4, multiplier: 1 },
    { code: 'EXPRESS_SAVER', name: 'Express Saver', days: 3, multiplier: 1.8 },
    { code: 'OVERNIGHT', name: 'Standard Overnight', days: 1, multiplier: 4.3 },
  ],
});

/** The registry the shipping service talks to. Add or swap adapters here. */
export const CARRIER_REGISTRY = { USPS, UPS, FEDEX };

export const enabledCarriers = () => Object.keys(CARRIER_REGISTRY);
export const getAdapter = (carrier) => CARRIER_REGISTRY[carrier?.toUpperCase()] ?? null;
