import { Router } from 'express';
import authRoutes from './modules/auth/auth.routes.js';
import { rateLimit } from './middleware/security.middleware.js';
import productRoutes from './modules/products/product.routes.js';
import orderRoutes from './modules/orders/order.routes.js';
import customerRoutes from './modules/customers/customer.routes.js';
import inventoryRoutes from './modules/inventory/inventory.routes.js';
import pricingRoutes from './modules/pricing/pricing.routes.js';
import shippingRoutes from './modules/shipping/shipping.routes.js';
import warehouseRoutes from './modules/warehouse/warehouse.routes.js';
import listingsRoutes from './modules/listings/listings.routes.js';
import analyticsRoutes from './modules/analytics/analytics.routes.js';
import notificationsRoutes from './modules/notifications/notifications.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import searchRoutes from './modules/search/search.routes.js';
import automationRoutes from './modules/automation/automation.routes.js';
import securityRoutes from './modules/security/security.routes.js';
import aiRoutes from './modules/ai/ai.routes.js';
import devplatformRoutes from './modules/devplatform/devplatform.routes.js';
import publicApiRoutes from './modules/devplatform/public-api.routes.js';
import channelsRoutes from './modules/channels/channels.routes.js';
import settingsRoutes from './modules/settings/settings.routes.js';
import importsRoutes from './modules/imports/imports.routes.js';

/**
 * Mounts every feature module. To port another module from the original platform, add its
 * <module>.routes.js here (see docs/CONVERSION_GUIDE.md).
 */
const api = Router();
api.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));
// Auth is the highest-value target: rate-limit it before the handler runs.
api.use('/auth', rateLimit({ windowSec: 300, maxRequests: 10 }), authRoutes);
api.use('/products', productRoutes);
api.use('/orders', orderRoutes);
api.use('/customers', customerRoutes);
api.use('/inventory', inventoryRoutes);
api.use('/pricing', pricingRoutes);
api.use('/shipping', shippingRoutes);
api.use('/warehouse', warehouseRoutes);
api.use('/listings', listingsRoutes);
api.use('/channels', channelsRoutes);
api.use('/settings', settingsRoutes);
api.use('/imports', importsRoutes);
api.use('/analytics', analyticsRoutes);
api.use('/notifications', notificationsRoutes);
api.use('/admin', adminRoutes);
api.use('/search', searchRoutes);
api.use('/automation', automationRoutes);
api.use('/security', securityRoutes);
api.use('/ai', aiRoutes);
api.use('/developer', devplatformRoutes);

// The PUBLIC versioned API. Authenticated by platform key or OAuth token via the gateway,
// not by the console's JWT — this is what external developers call.
api.use('/v1', publicApiRoutes);
export default api;
