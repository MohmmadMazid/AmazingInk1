import 'dotenv/config';
import { connectDb } from './config/db.js';
import { User } from './models/user.model.js';
import { Product } from './models/product.model.js';
import { Customer } from './models/customer.model.js';
import { Warehouse } from './models/warehouse.model.js';
import { StockLevel } from './models/stock-level.model.js';
import { StockMovement } from './models/stock-movement.model.js';
import { Reservation } from './models/reservation.model.js';
import { VariantPricing } from './models/variant-pricing.model.js';
import { PricingRule } from './models/pricing-rule.model.js';
import { Coupon } from './models/coupon.model.js';
import { PriceChange } from './models/price-change.model.js';
import { PackageType } from './models/package-type.model.js';
import { CarrierRule } from './models/carrier-rule.model.js';
import { Shipment } from './models/shipment.model.js';
import { BinLocation } from './models/bin-location.model.js';
import { BinInventory } from './models/bin-inventory.model.js';
import { Receipt } from './models/receipt.model.js';
import { PickList } from './models/pick-list.model.js';
import { serpentineSortKey, parseBinCode } from './core/warehouse.js';
import { Channel } from './models/channel.model.js';
import { Listing } from './models/listing.model.js';
import { SyncOutbox } from './models/sync-outbox.model.js';
import { SyncConflict } from './models/sync-conflict.model.js';
import { Order } from './models/order.model.js';
import { DailySalesRollup } from './models/daily-rollup.model.js';
import { SavedReport } from './models/saved-report.model.js';
import { NotificationTemplate } from './models/notification-template.model.js';
import { NotificationSetting } from './models/notification-preference.model.js';
import { Notification } from './models/notification.model.js';
import { Role } from './models/role.model.js';
import { FeatureFlag } from './models/feature-flag.model.js';
import { AuditLog } from './models/audit-log.model.js';
import { ApiCredential } from './models/api-credential.model.js';
import { WebhookEndpoint } from './models/webhook-endpoint.model.js';
import { OrgSetting } from './models/org-setting.model.js';
import { SearchSynonym } from './models/search-synonym.model.js';
import { SavedSearch } from './models/saved-search.model.js';
import { SearchQueryLog } from './models/search-query-log.model.js';
import { JobDefinition } from './models/job-definition.model.js';
import { JobRun } from './models/job-run.model.js';
import { ScheduledTask } from './models/scheduled-task.model.js';
import { AutomationRule } from './models/automation-rule.model.js';
import { Workflow, WorkflowRun } from './models/workflow.model.js';
import { nextRun } from './core/automation.js';
import { SecurityEvent } from './models/security-event.model.js';
import { LoginAttempt, AccountLockout } from './models/login-attempt.model.js';
import { UserSession } from './models/user-session.model.js';
import { RateLimitPolicy, IpAllowlistEntry } from './models/access-policy.model.js';
import { DataRetentionPolicy, GdprRequest, ComplianceControl } from './models/privacy.model.js';
import { STARTER_CONTROLS } from './core/security.js';
import { AiPromptTemplate } from './models/ai-prompt.model.js';
import { AiUsageLog } from './models/ai-usage.model.js';
import { PlatformApiKey } from './models/platform-key.model.js';
import { ApiClient, OAuthAccessToken, OAuthAuthorizationCode } from './models/oauth.model.js';
import { EventSubscription, EventDelivery } from './models/event-subscription.model.js';
import { ApiRequestLog, ApiVersion } from './models/api-request-log.model.js';
import { SUPPORTED_VERSIONS } from './core/devplatform.js';
import { ChannelConnection } from './models/channel-connection.model.js';
import { ChannelPricingProfile } from './models/channel-pricing-profile.model.js';
import { ChannelListing } from './models/channel-listing.model.js';
import { PLATFORM_PRESETS } from './core/channels.js';
import { encryptField, deriveKey } from './core/security.js';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

/** Seeds an admin, products, customers (incl. a near-duplicate), a warehouse, and stock levels
 *  (one deliberately below its reorder point so the reorder report has content). */
async function seed() {
  await connectDb();
  const organizationId = 'org_demo';
  await Promise.all([
    User.deleteMany({ organizationId }), Product.deleteMany({ organizationId }),
    Customer.deleteMany({ organizationId }), Warehouse.deleteMany({ organizationId }),
    StockLevel.deleteMany({ organizationId }), StockMovement.deleteMany({ organizationId }),
    Reservation.deleteMany({ organizationId }), VariantPricing.deleteMany({ organizationId }),
    PricingRule.deleteMany({ organizationId }), Coupon.deleteMany({ organizationId }),
    PriceChange.deleteMany({ organizationId }), PackageType.deleteMany({ organizationId }),
    CarrierRule.deleteMany({ organizationId }), Shipment.deleteMany({ organizationId }),
    BinLocation.deleteMany({ organizationId }), BinInventory.deleteMany({ organizationId }),
    Receipt.deleteMany({ organizationId }), PickList.deleteMany({ organizationId }),
    Channel.deleteMany({ organizationId }), Listing.deleteMany({ organizationId }),
    SyncOutbox.deleteMany({ organizationId }), SyncConflict.deleteMany({}),
    Order.deleteMany({ organizationId }), DailySalesRollup.deleteMany({ organizationId }),
    SavedReport.deleteMany({ organizationId }), NotificationTemplate.deleteMany({ organizationId }),
    NotificationSetting.deleteMany({ organizationId }), Notification.deleteMany({ organizationId }),
    Role.deleteMany({ organizationId }), FeatureFlag.deleteMany({ organizationId }),
    AuditLog.deleteMany({ organizationId }), ApiCredential.deleteMany({ organizationId }),
    WebhookEndpoint.deleteMany({ organizationId }), OrgSetting.deleteMany({ organizationId }),
    SearchSynonym.deleteMany({ organizationId }), SavedSearch.deleteMany({ organizationId }),
    SearchQueryLog.deleteMany({ organizationId }), JobDefinition.deleteMany({ organizationId }),
    JobRun.deleteMany({ organizationId }), ScheduledTask.deleteMany({ organizationId }),
    AutomationRule.deleteMany({ organizationId }), Workflow.deleteMany({ organizationId }),
    WorkflowRun.deleteMany({ organizationId }), SecurityEvent.deleteMany({ organizationId }),
    LoginAttempt.deleteMany({}), AccountLockout.deleteMany({}), UserSession.deleteMany({ organizationId }),
    RateLimitPolicy.deleteMany({ organizationId }), IpAllowlistEntry.deleteMany({ organizationId }),
    DataRetentionPolicy.deleteMany({ organizationId }), GdprRequest.deleteMany({ organizationId }),
    ComplianceControl.deleteMany({ organizationId }),
    AiPromptTemplate.deleteMany({ organizationId }), AiUsageLog.deleteMany({ organizationId }),
    PlatformApiKey.deleteMany({ organizationId }), ApiClient.deleteMany({ organizationId }),
    OAuthAccessToken.deleteMany({ organizationId }), OAuthAuthorizationCode.deleteMany({}),
    EventSubscription.deleteMany({ organizationId }), EventDelivery.deleteMany({ organizationId }),
    ApiRequestLog.deleteMany({ organizationId }), ApiVersion.deleteMany({}),
    ChannelConnection.deleteMany({ organizationId }), ChannelPricingProfile.deleteMany({ organizationId }),
    ChannelListing.deleteMany({ organizationId }),
  ]);

  await User.create({
    organizationId, email: 'admin@mccms.test',
    passwordHash: await bcrypt.hash('password123', 10),
    firstName: 'Admin', lastName: 'User', roles: ['owner'], permissions: ['*'],
  });

  const products = await Product.insertMany([
    { organizationId, sku: 'SKU-001', title: 'Wireless Mouse', description: 'Ergonomic 2.4GHz pointing device with silent clicks', barcode: '036000291452', price: { amountMinor: 2499, currency: 'GBP' }, status: 'ACTIVE' },
    { organizationId, sku: 'SKU-002', title: 'Mechanical Keyboard', description: 'Tactile switches, RGB backlight', barcode: '5901234123457', price: { amountMinor: 8999, currency: 'GBP' }, status: 'ACTIVE' },
    { organizationId, sku: 'SKU-003', title: 'USB-C Hub', description: 'Seven ports including HDMI and ethernet', barcode: '4006381333931', price: { amountMinor: 3999, currency: 'GBP' }, status: 'DRAFT' },
  ]);

  await Customer.insertMany([
    { organizationId, email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace', phone: '+1 555 0100', tags: ['vip'] },
    { organizationId, email: 'grace@example.com', firstName: 'Grace', lastName: 'Hopper', phone: '+1 555 0101' },
    { organizationId, email: 'ada.lovelace@example.com', firstName: 'Ada', lastName: 'Lovelace', phone: '+1 555 0100' },
  ]);

  const wh = await Warehouse.create({ organizationId, code: 'MAIN', name: 'Main Warehouse' });

  await StockLevel.insertMany([
    { organizationId, productId: products[0]._id, warehouseId: wh._id, onHand: 120, reserved: 10, reorderPoint: 20, safetyStock: 10, leadTimeDays: 7 },
    { organizationId, productId: products[1]._id, warehouseId: wh._id, onHand: 8, reserved: 3, reorderPoint: 15, safetyStock: 5, leadTimeDays: 10 }, // below reorder point
    { organizationId, productId: products[2]._id, warehouseId: wh._id, onHand: 0, reserved: 0, reorderPoint: 5, safetyStock: 2, leadTimeDays: 5 },  // out of stock
  ]);

  // Pricing: costs + Amazon-like fee schedule, a global cost-plus-margin rule, and a coupon.
  const amazonFees = { referralBps: 1500, paymentBps: 290, paymentFixed: 30, fixedFee: 0, otherFee: 0 };
  await VariantPricing.insertMany([
    { organizationId, productId: products[0]._id, cost: 1000, basePrice: 2499, minPrice: 1500, maxPrice: 5000, fees: amazonFees },
    { organizationId, productId: products[1]._id, cost: 4500, basePrice: 8999, minPrice: 6000, maxPrice: 15000, fees: amazonFees },
    { organizationId, productId: products[2]._id, cost: 1800, basePrice: 3999, minPrice: 2500, maxPrice: 8000, fees: amazonFees },
  ]);
  await PricingRule.create({
    organizationId, name: 'Standard 25% margin', type: 'COST_PLUS_MARGIN',
    marginBps: 2500, rounding: 'CHARM_99', respectMinMax: true, priority: 1, productId: null,
  });
  await Coupon.create({ organizationId, code: 'SAVE10', type: 'PERCENT', value: 1000, minSubtotal: 2000, maxRedemptions: 100 });

  // Shipping: three package sizes and a rule that forces FedEx for heavy parcels.
  await PackageType.insertMany([
    { organizationId, name: 'Small Box', kind: 'BOX', lengthMm: 200, widthMm: 150, heightMm: 100, emptyWeightG: 50, maxWeightG: 2000 },
    { organizationId, name: 'Medium Box', kind: 'BOX', lengthMm: 300, widthMm: 200, heightMm: 150, emptyWeightG: 120, maxWeightG: 10000 },
    { organizationId, name: 'Large Box', kind: 'BOX', lengthMm: 500, widthMm: 400, heightMm: 300, emptyWeightG: 300, maxWeightG: 30000 },
  ]);
  await CarrierRule.create({
    organizationId, name: 'Heavy parcels via FedEx', priority: 1, isActive: true,
    conditions: [{ field: 'weightG', op: 'gte', value: 10000 }],
    action: { carrier: 'FEDEX', serviceCode: 'HOME_DELIVERY' },
  });

  // Warehouse: bins across two aisles (so the serpentine path is visible), stock in bins,
  // and an expected receipt sourced from a purchase order.
  const binCodes = ['A-01-1', 'A-05-1', 'A-10-1', 'B-01-1', 'B-05-1', 'B-10-1'];
  const bins = await BinLocation.insertMany(binCodes.map((code) => {
    const { aisle, bay, level } = parseBinCode(code);
    return { organizationId, warehouseId: wh._id, code, aisle, bay, level, sortKey: serpentineSortKey(code), zoneType: 'STORAGE', maxUnits: 500 };
  }));

  await BinInventory.insertMany([
    { organizationId, binId: bins[5]._id, productId: products[0]._id, quantity: 60 }, // B-10-1
    { organizationId, binId: bins[0]._id, productId: products[1]._id, quantity: 8 },  // A-01-1
  ]);

  await Receipt.create({
    organizationId, warehouseId: wh._id, reference: 'RCV-1001', source: 'PURCHASE_ORDER', status: 'EXPECTED',
    items: [
      { productId: products[1]._id, expectedQuantity: 50 },
      { productId: products[2]._id, expectedQuantity: 25 },
    ],
  });

  // Channels: Amazon holds back a 5-unit safety buffer and marks up 15% with charm pricing;
  // eBay pushes everything through at cost-plus-nothing but defers to the marketplace on drift.
  await Channel.insertMany([
    { organizationId, code: 'AMAZON', name: 'Amazon US',
      syncRule: { allocation: 'SUM_ALL', bufferQty: 5, pushPercent: 10000 },
      priceRule: { type: 'MARKUP_PERCENT', value: 1500, rounding: 'CHARM_99' },
      conflictPolicy: 'SYSTEM_WINS' },
    { organizationId, code: 'EBAY', name: 'eBay',
      syncRule: { allocation: 'PRIORITY_FILL' },
      priceRule: { type: 'PASSTHROUGH', rounding: 'NONE' },
      conflictPolicy: 'MARKETPLACE_WINS' },
  ]);

  // Orders spread over the last 45 days so analytics has a real timeseries + comparison period.
  const channels = ['web', 'amazon', 'ebay'];
  const orders = [];
  for (let d = 44; d >= 0; d--) {
    const placedAt = new Date(Date.now() - d * 86400000);
    const count = 1 + (d % 3);
    for (let n = 0; n < count; n++) {
      const product = products[(d + n) % products.length];
      const qty = 1 + ((d + n) % 3);
      const unit = product.price.amountMinor;
      const subtotal = unit * qty;
      const tax = Math.round(subtotal * 0.08);
      orders.push({
        organizationId, orderNumber: `SO-${d}${n}${Math.random().toString(36).slice(2, 6)}`,
        status: d % 11 === 0 ? 'CANCELLED' : 'FULFILLED',
        channel: channels[(d + n) % channels.length], currency: 'GBP',
        lines: [{ productId: product._id, sku: product.sku, quantity: qty, unitPriceMinor: unit, lineTotalMinor: subtotal }],
        subtotalMinor: subtotal, taxMinor: tax, totalMinor: subtotal + tax, placedAt,
      });
    }
  }
  await Order.insertMany(orders);

  // Notification templates with {{var}} placeholders.
  await NotificationTemplate.insertMany([
    { organizationId, key: 'order.shipped', category: 'ORDER', subject: 'Order {{order.number}} has shipped',
      bodyText: 'Hi {{user.name}}, order {{order.number}} is on its way.', bodyHtml: '<p>Hi <b>{{user.name}}</b>, order {{order.number}} is on its way.</p>' },
    { organizationId, key: 'inventory.low_stock', category: 'INVENTORY', subject: 'Low stock: {{sku}}',
      bodyText: '{{sku}} has only {{count}} units left and is below its reorder point.' },
    { organizationId, key: 'sync.failed', category: 'SYNC_FAILURE', subject: 'Marketplace sync failed',
      bodyText: 'Sync to {{channel}} failed for {{sku}}. This alert cannot be silenced.' },
  ]);

  // Roles demonstrating wildcard permissions, and feature flags incl. a percentage rollout.
  await Role.insertMany([
    { organizationId, name: 'owner', description: 'Full access', permissions: ['*'], system: true },
    { organizationId, name: 'ops', description: 'Warehouse + inventory', permissions: ['inventory:*', 'warehouse:*', 'orders:view'] },
    { organizationId, name: 'analyst', description: 'Read-only reporting', permissions: ['analytics:view', 'orders:view', 'products:view'] },
  ]);

  await FeatureFlag.insertMany([
    { organizationId, key: 'new-checkout', description: 'Redesigned checkout', enabled: true, audience: 'PERCENTAGE', rolloutPct: 30 },
    { organizationId, key: 'ai-reorder', description: 'AI reorder suggestions', enabled: false, audience: 'ALL' },
    { organizationId, key: 'beta-dashboard', description: 'Owner-only beta', enabled: true, audience: 'ROLE', roleFilter: 'owner' },
  ]);

  // Search synonym groups.
  await SearchSynonym.insertMany([
    { organizationId, terms: ['mouse', 'mice', 'pointer'] },
    { organizationId, terms: ['keyboard', 'keeb'] },
  ]);

  // Automation: a job definition with a tight retry policy, two cron schedules, an
  // event rule with a nested condition, and a two-step conditional workflow.
  await JobDefinition.create({
    organizationId, key: 'system.always-fail', name: 'Always fails (retry demo)',
    retry: { strategy: 'EXPONENTIAL', delayMs: 500, maxAttempts: 3, capMs: 10000 },
  });

  await ScheduledTask.insertMany([
    { organizationId, name: 'Nightly rollups', jobKey: 'analytics.rebuild-rollups', cron: '0 3 * * *', nextRunAt: nextRun('0 3 * * *') },
    { organizationId, name: 'Sync listings hourly', jobKey: 'sync.listings', cron: '0 * * * *', nextRunAt: nextRun('0 * * * *') },
    { organizationId, name: 'Reorder check (weekdays 8am)', jobKey: 'inventory.reorder-check', cron: '0 8 * * 1-5', nextRunAt: nextRun('0 8 * * 1-5') },
  ]);

  const wf = await Workflow.create({
    organizationId, name: 'High-value order follow-up', status: 'ACTIVE',
    steps: [
      { name: 'log', jobKey: 'system.noop', input: { order: '{{trigger.order.number}}' } },
      { name: 'notifyBig', jobKey: 'system.noop', input: { msg: 'Big order {{trigger.order.number}}' },
        condition: { field: 'trigger.order.totalMinor', op: 'gte', value: 20000 } },
    ],
  });

  await AutomationRule.insertMany([
    { organizationId, name: 'Large marketplace orders', event: 'order.created', workflowId: wf._id,
      condition: { all: [
        { field: 'order.totalMinor', op: 'gte', value: 10000 },
        { any: [{ field: 'order.channel', op: 'eq', value: 'amazon' }, { field: 'order.channel', op: 'eq', value: 'ebay' }] },
        { not: { field: 'order.status', op: 'eq', value: 'CANCELLED' } },
      ] } },
    { organizationId, name: 'Low stock -> reorder check', event: 'inventory.low_stock', jobKey: 'inventory.reorder-check', condition: {} },
  ]);

  // Security: retention policies and a partially-completed SOC2 checklist so the
  // readiness score is a real number rather than 0 or 100.
  await DataRetentionPolicy.insertMany([
    { organizationId, entity: 'SecurityEvent', ttlDays: 90, action: 'DELETE' },
    { organizationId, entity: 'LoginAttempt', ttlDays: 30, action: 'ANONYMIZE', piiFields: ['ip', 'userAgent'] },
  ]);

  const soc2 = STARTER_CONTROLS.SOC2.map((c, i) => ({
    organizationId, framework: 'SOC2', ...c,
    status: i === 0 ? 'IMPLEMENTED' : i === 1 ? 'IMPLEMENTED' : i === 2 ? 'IN_PROGRESS' : i === 4 ? 'NOT_APPLICABLE' : 'NOT_STARTED',
  }));
  await ComplianceControl.insertMany(soc2);

  // AI prompt templates with {{var}} placeholders.
  await AiPromptTemplate.insertMany([
    { organizationId, key: 'product.description', description: 'Marketing copy for a product',
      systemPrompt: 'You are an e-commerce copywriter. Be concise and benefit-led. Never invent specifications.',
      userTemplate: 'Write a description for {{product.title}}. Notes: {{product.notes}}' },
    { organizationId, key: 'product.keywords', description: 'SEO keywords', json: true,
      systemPrompt: 'Return ONLY a JSON array of 5-8 lowercase keywords.',
      userTemplate: 'Generate keywords for: {{product.title}}' },
    { organizationId, key: 'forecast.explain', description: 'Narrate computed forecast figures',
      systemPrompt: 'You are an inventory analyst. Explain the figures in 2-3 sentences. Never recompute a number.',
      userTemplate: 'Figures: {{numbers}}' },
  ]);

  // Developer platform: seed the supported API versions so the reference tab has content.
  for (const v of SUPPORTED_VERSIONS) await ApiVersion.create({ version: v }).catch(() => {});
  await ApiVersion.updateOne({ version: SUPPORTED_VERSIONS[0] }, { $set: { status: 'DEPRECATED', deprecatedAt: new Date() } });

  // Channels: an eBay store and the brand's own website, with DIFFERENT target margins.
  // eBay takes ~12.9%, so the same product lists higher there to hold its margin.
  const chKey = deriveKey(process.env.JWT_SECRET || 'dev-master-key');
  const ebayConn = await ChannelConnection.create({
    organizationId, name: 'eBay US -- main store', platform: 'EBAY', kind: 'MARKETPLACE', siteId: '0',
    credentialsEnc: encryptField(JSON.stringify({ clientId: 'demo-client-id', clientSecret: 'demo-secret', refreshToken: 'demo-refresh', siteId: '0' }), chKey),
    status: 'DISCONNECTED',
  });
  const siteConn = await ChannelConnection.create({
    organizationId, name: 'Brand website', platform: 'SHOPIFY', kind: 'OWNED_STORE',
    credentialsEnc: encryptField(JSON.stringify({ shopDomain: 'brand.myshopify.com', accessToken: 'shpat_demo_token' }), chKey),
    status: 'DISCONNECTED',
  });

  await ChannelPricingProfile.insertMany([
    { organizationId, connectionId: ebayConn._id, productId: null, priceMode: 'MARGIN',
      targetMarginBps: 2500, floorMarginBps: 1000, fees: PLATFORM_PRESETS.EBAY.fees, rounding: 'CHARM_99', autoPropagate: true },
    { organizationId, connectionId: siteConn._id, productId: null, priceMode: 'MARGIN',
      targetMarginBps: 4500, floorMarginBps: 2000, fees: PLATFORM_PRESETS.SHOPIFY.fees, rounding: 'CHARM_99', autoPropagate: true },
  ]);

  console.log('Seeded: admin@mccms.test / password123 (org_demo)');
  console.log('  3 products, 3 customers (1 near-duplicate), 1 warehouse, 3 stock levels (1 low, 1 out)');
  console.log('  pricing: costs + marketplace fees, a 25%-margin rule (CHARM_99), coupon SAVE10');
  console.log('  shipping: 3 package types, carrier rule (>=10kg -> FedEx)');
  console.log('  warehouse: 6 bins (aisles A/B), bin stock, receipt RCV-1001 from a PURCHASE_ORDER');
  console.log('  channels: AMAZON (buffer 5, +15% charm, system-wins), EBAY (priority-fill, marketplace-wins)');
  console.log(`  analytics: ${orders.length} orders across 45 days -- click "Rebuild rollups" to populate dashboards`);
  console.log('  notifications: 3 templates (order.shipped, inventory.low_stock, sync.failed)');
  console.log('  admin: 3 roles (owner/ops/analyst with wildcards), 3 feature flags (one 30% rollout)');
  console.log('  search: valid GTIN barcodes on products, 2 synonym groups -- hit "Rebuild all indices" first');
  console.log('  automation: 3 cron schedules, 2 event rules (one nested all/any/not), 1 conditional workflow');
  console.log('  security: 2 retention policies, SOC2 checklist (2 done, 1 in progress, 1 N/A)');
  console.log('  ai: 3 prompt templates; ECHO provider active (deterministic, free, no API key needed)');
  console.log('  developer: 3 API versions (oldest deprecated); create a key to call /api/v1/*');
  console.log('  channels: eBay store (25% margin) + brand website (45% margin), prices in GBP -- press Test, then Publish');
  await mongoose.disconnect();
}
seed().catch((e) => { console.error(e); process.exit(1); });
