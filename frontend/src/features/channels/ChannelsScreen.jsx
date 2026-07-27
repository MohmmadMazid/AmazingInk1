import { useState } from 'react';
import {
  Alert, Box, Button, Chip, Divider, LinearProgress, MenuItem, Paper, Slider, Stack, Switch,
  Tab, Tabs, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { usePlatforms, useConnections, useProfiles, usePriceMatrix, useChannelListings, useChannelMutations } from './hooks.js';
import { useProducts } from '../products/hooks.js';
import { RequirePermission } from '../../auth/RequirePermission.jsx';
import { money } from '../../lib/money.js';

const pct = (bps) => `${(bps / 100).toFixed(1)}%`;
const HEALTH_COLOR = { HEALTHY: 'success', DEGRADED: 'warning', STALE: 'warning', ERROR: 'error', DISCONNECTED: 'default' };
const STATUS_COLOR = { CONNECTED: 'success', ERROR: 'error', DISCONNECTED: 'default' };

/** Attach an eBay account or your brand website. Credentials are encrypted at rest. */
function ConnectionsTab() {
  const { data: platforms } = usePlatforms();
  const { data: connections } = useConnections();
  const { createConnection, testConnection, removeConnection } = useChannelMutations();
  const [platform, setPlatform] = useState('EBAY');
  const [name, setName] = useState('');
  const [creds, setCreds] = useState({});
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const preset = (platforms ?? []).find((p) => p.platform === platform);

  const submit = () => {
    setError('');
    createConnection.mutate({ name, platform, credentials: creds }, {
      onSuccess: () => { setName(''); setCreds({}); setMsg('Store attached. Now press Test to verify the credentials.'); },
      onError: (e) => setError(e.response?.data?.error?.message ?? 'Failed'),
    });
  };

  return (
    <Box>
      {msg && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMsg('')}>{msg}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Alert severity="info" sx={{ mb: 2 }}>
        Attach as many stores as you like — several eBay accounts, your Shopify or WooCommerce site.
        Credentials are <strong>encrypted with AES-256-GCM</strong> before they touch the database and
        are never returned by the API.
      </Alert>

      <RequirePermission permission="channels:manage">
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle2" fontWeight={800} gutterBottom>Attach a store</Typography>
          <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
            <TextField select size="small" label="Platform" value={platform} onChange={(e) => { setPlatform(e.target.value); setCreds({}); }} sx={{ minWidth: 220 }}>
              {(platforms ?? []).map((p) => <MenuItem key={p.platform} value={p.platform}>{p.label}</MenuItem>)}
            </TextField>
            <TextField size="small" label="Store name" placeholder="eBay US — main store" value={name} onChange={(e) => setName(e.target.value)} sx={{ flexGrow: 1 }} />
          </Stack>

          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
            {(preset?.credentialFields ?? []).map((f) => (
              <TextField key={f} size="small" label={f} sx={{ minWidth: 220 }}
                type={/secret|token|key|password/i.test(f) ? 'password' : 'text'}
                value={creds[f] ?? ''} onChange={(e) => setCreds({ ...creds, [f]: e.target.value })} />
            ))}
          </Stack>

          {preset && (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
              Default fees for {preset.label}: {preset.fees.referralBps / 100}% commission
              {preset.fees.paymentBps ? ` + ${preset.fees.paymentBps / 100}% payment` : ''}
              {preset.fees.paymentFixed ? ` + ${money(preset.fees.paymentFixed)} per order` : ''} — editable per channel.
            </Typography>
          )}

          <Button variant="contained" disabled={!name || !(preset?.credentialFields ?? []).every((f) => creds[f])} onClick={submit}>
            Attach store
          </Button>
        </Paper>
      </RequirePermission>

      {!connections?.length && <Typography variant="body2" color="text.secondary">No stores attached yet.</Typography>}
      {(connections ?? []).map((c) => (
        <Paper key={c._id} variant="outlined" sx={{ p: 2, mb: 1.5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography fontWeight={700}>{c.name}</Typography>
                <Chip size="small" label={c.platform} variant="outlined" />
                <Chip size="small" label={c.kind === 'OWNED_STORE' ? 'own store' : 'marketplace'} />
                <Chip size="small" label={c.status} color={STATUS_COLOR[c.status]} />
                <Chip size="small" label={c.health} color={HEALTH_COLOR[c.health]} variant="outlined" />
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {c.externalAccountId ? `account ${c.externalAccountId} · ` : ''}
                {c.lastSyncAt ? `last sync ${new Date(c.lastSyncAt).toLocaleString()}` : 'never synced'}
                {c.lastError ? ` · ${c.lastError}` : ''}
              </Typography>
            </Box>
            <RequirePermission permission="channels:manage">
              <Stack direction="row" spacing={1}>
                <Button size="small" variant="outlined" onClick={() => testConnection.mutate(c._id)}>Test</Button>
                <Button size="small" color="error" onClick={() => removeConnection.mutate(c._id)}>Disconnect</Button>
              </Stack>
            </RequirePermission>
          </Stack>
        </Paper>
      ))}
    </Box>
  );
}

/** Set a target MARGIN per store. The engine solves for the list price after that store's fees. */
function MarginsTab() {
  const { data: connections } = useConnections();
  const { data: profiles } = useProfiles();
  const { upsertProfile } = useChannelMutations();
  const [draft, setDraft] = useState({});

  const profileFor = (connId) => (profiles ?? []).find((p) => p.connectionId?._id === connId && p.productId == null);

  const save = (conn, patch) => {
    const p = profileFor(conn._id) ?? {};
    upsertProfile.mutate({
      connectionId: conn._id,
      priceMode: patch.priceMode ?? p.priceMode ?? 'MARGIN',
      targetMarginBps: patch.targetMarginBps ?? p.targetMarginBps ?? 3000,
      floorMarginBps: patch.floorMarginBps ?? p.floorMarginBps ?? 1000,
      rounding: patch.rounding ?? p.rounding ?? 'CHARM_99',
      handlingFeeMinor: patch.handlingFeeMinor ?? p.handlingFeeMinor ?? 0,
      shippingCostMinor: patch.shippingCostMinor ?? p.shippingCostMinor ?? 0,
      autoPropagate: patch.autoPropagate ?? p.autoPropagate ?? true,
      fees: patch.fees ?? p.fees,
    });
  };

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        You set a <strong>target margin</strong>, not a markup. Because eBay takes ~12.9% and your own
        site only pays ~2.9% payment processing, the same margin needs a <em>different list price on
        each store</em> — the engine solves for it. A <strong>margin floor</strong> is a hard clamp:
        no rounding or promotion can publish below it.
      </Alert>

      {!connections?.length && <Typography variant="body2" color="text.secondary">Attach a store first.</Typography>}

      {(connections ?? []).map((c) => {
        const p = profileFor(c._id) ?? {};
        const d = draft[c._id] ?? {};
        const target = d.targetMarginBps ?? p.targetMarginBps ?? 3000;
        const floor = d.floorMarginBps ?? p.floorMarginBps ?? 1000;

        return (
          <Paper key={c._id} variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography fontWeight={700}>{c.name}</Typography>
                <Chip size="small" label={c.platform} variant="outlined" />
              </Stack>
              <RequirePermission permission="channels:manage">
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="caption">auto-propagate</Typography>
                  <Switch size="small" checked={p.autoPropagate ?? true} onChange={(e) => save(c, { autoPropagate: e.target.checked })} />
                </Stack>
              </RequirePermission>
            </Stack>

            <RequirePermission permission="channels:manage" fallback={<Typography variant="body2">Target {pct(target)} · floor {pct(floor)}</Typography>}>
              <Stack direction="row" spacing={3} alignItems="center" sx={{ mb: 1 }}>
                <TextField select size="small" label="Mode" value={p.priceMode ?? 'MARGIN'} onChange={(e) => save(c, { priceMode: e.target.value })} sx={{ minWidth: 150 }}>
                  {['MARGIN', 'MARKUP', 'FIXED', 'PASSTHROUGH'].map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                </TextField>
                <Box sx={{ flexGrow: 1, maxWidth: 260 }}>
                  <Typography variant="caption">Target margin: <strong>{pct(target)}</strong></Typography>
                  <Slider size="small" min={0} max={8000} step={250} value={target}
                    onChange={(_, v) => setDraft({ ...draft, [c._id]: { ...d, targetMarginBps: v } })}
                    onChangeCommitted={(_, v) => save(c, { targetMarginBps: v })} />
                </Box>
                <Box sx={{ flexGrow: 1, maxWidth: 220 }}>
                  <Typography variant="caption">Margin floor: <strong>{pct(floor)}</strong></Typography>
                  <Slider size="small" color="warning" min={0} max={5000} step={250} value={floor}
                    onChange={(_, v) => setDraft({ ...draft, [c._id]: { ...d, floorMarginBps: v } })}
                    onChangeCommitted={(_, v) => save(c, { floorMarginBps: v })} />
                </Box>
                <TextField select size="small" label="Rounding" value={p.rounding ?? 'CHARM_99'} onChange={(e) => save(c, { rounding: e.target.value })} sx={{ minWidth: 150 }}>
                  {['NONE', 'CHARM_99', 'CHARM_95', 'NEAREST_UNIT'].map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                </TextField>
              </Stack>
            </RequirePermission>

            <Typography variant="caption" color="text.secondary">
              Fees: {(p.fees?.referralBps ?? 0) / 100}% commission
              {p.fees?.paymentBps ? ` + ${p.fees.paymentBps / 100}% payment` : ''}
              {p.fees?.paymentFixed ? ` + ${money(p.fees.paymentFixed)}/order` : ''}
              {p.handlingFeeMinor ? ` · handling ${money(p.handlingFeeMinor)}` : ''}
              {p.shippingCostMinor ? ` · absorbed shipping ${money(p.shippingCostMinor)}` : ''}
            </Typography>
          </Paper>
        );
      })}
    </Box>
  );
}

/** One product, one cost, every store: the price we'd publish and the margin it nets. */
function PriceMatrixTab() {
  const { data: products } = useProducts({ limit: 50 });
  const [productId, setProductId] = useState('');
  const { data: matrix, error } = usePriceMatrix(productId);
  const { propagate, publish, propagateAll, drain } = useChannelMutations();
  const { data: connections } = useConnections();
  const [msg, setMsg] = useState('');

  return (
    <Box>
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} alignItems="center">
        <TextField select size="small" label="Product" value={productId} onChange={(e) => setProductId(e.target.value)} sx={{ minWidth: 300 }}>
          {(products?.data ?? []).map((p) => <MenuItem key={p._id} value={p._id}>{p.sku} — {p.title}</MenuItem>)}
        </TextField>
        <RequirePermission permission="channels:manage">
          <Button variant="contained" disabled={!productId}
            onClick={() => propagate.mutate({ productId, force: true }, { onSuccess: (r) => setMsg(`Propagated: ${r.pushed} enqueued, ${r.unchanged} unchanged, ${r.blocked} blocked`) })}>
            Push prices now
          </Button>
          <Button variant="outlined" onClick={() => propagateAll.mutate(undefined, { onSuccess: (r) => setMsg(`All products: ${r.enqueued} price changes enqueued across ${r.products} products`) })}>
            Reprice everything
          </Button>
          <Button variant="outlined" onClick={() => drain.mutate(undefined, { onSuccess: (r) => setMsg(`Sent ${r.processed} updates to the stores`) })}>
            Send queue
          </Button>
        </RequirePermission>
      </Stack>

      {msg && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMsg('')}>{msg}</Alert>}
      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error.response?.data?.error?.message ?? 'Cannot price this product'}</Alert>}

      {matrix && (
        <>
          <Typography variant="body2" sx={{ mb: 1 }}>
            <strong>{matrix.sku}</strong> — cost <strong>{money(matrix.costMinor)}</strong>
            {matrix.basePriceMinor != null && <> · base price {money(matrix.basePriceMinor)}</>}
          </Typography>

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Store</TableCell><TableCell>Mode</TableCell><TableCell align="right">Target</TableCell>
                <TableCell align="right">List price</TableCell><TableCell align="right">Fees</TableCell>
                <TableCell align="right">Net</TableCell><TableCell align="right">Profit</TableCell>
                <TableCell align="right">Realized margin</TableCell><TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {matrix.channels.map((c) => (
                <TableRow key={c.connectionId}>
                  <TableCell>
                    {c.channel}
                    {c.isOverride && <Chip size="small" label="override" sx={{ ml: 0.5 }} />}
                    {c.floorApplied && <Chip size="small" color="warning" label="floor" sx={{ ml: 0.5 }} />}
                  </TableCell>
                  <TableCell><Chip size="small" variant="outlined" label={c.priceMode} /></TableCell>
                  <TableCell align="right">{pct(c.targetMarginBps ?? 0)}</TableCell>
                  <TableCell align="right"><strong>{money(c.priceMinor)}</strong></TableCell>
                  <TableCell align="right">{money(c.fees.total)}</TableCell>
                  <TableCell align="right">{money(c.netProceeds)}</TableCell>
                  <TableCell align="right" sx={{ color: c.profitable ? 'success.main' : 'error.main' }}>{money(c.profit)}</TableCell>
                  <TableCell align="right">{pct(c.marginBps)}</TableCell>
                  <TableCell align="right">
                    <RequirePermission permission="channels:manage">
                      <Button size="small" onClick={() => publish.mutate({ connectionId: c.connectionId, productId })}>Publish</Button>
                    </RequirePermission>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {!!matrix.channels.length && (
            <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
              <Typography variant="caption" fontWeight={700}>How each price was reached</Typography>
              {matrix.channels.map((c) => (
                <Typography key={c.connectionId} variant="caption" display="block" color="text.secondary">
                  {c.channel}: {c.steps.join(' → ')}
                </Typography>
              ))}
            </Paper>
          )}
        </>
      )}

      {!connections?.length && <Alert severity="warning" sx={{ mt: 2 }}>Attach a store to see the price matrix.</Alert>}
    </Box>
  );
}

/** What's live on each store, and whether anyone edited it there. */
function ListingsTab() {
  const { data: listings } = useChannelListings();
  const { refresh } = useChannelMutations();

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
        <strong>Drift</strong> means the store's price differs from what we last pushed — usually
        someone edited it directly in the eBay or Shopify admin. Refresh to detect it.
      </Typography>
      <Table size="small">
        <TableHead>
          <TableRow><TableCell>Product</TableCell><TableCell>Store</TableCell><TableCell align="right">Pushed price</TableCell>
            <TableCell align="right">Remote price</TableCell><TableCell>Sync</TableCell><TableCell align="right" /></TableRow>
        </TableHead>
        <TableBody>
          {!listings?.length && <TableRow><TableCell colSpan={6}><Typography variant="body2" color="text.secondary">Nothing published yet.</Typography></TableCell></TableRow>}
          {(listings ?? []).map((l) => {
            const drift = l.remotePriceMinor != null && l.lastPushedPriceMinor != null && l.remotePriceMinor !== l.lastPushedPriceMinor;
            return (
              <TableRow key={l._id}>
                <TableCell>{l.productId?.sku ?? '—'}</TableCell>
                <TableCell>{l.connectionId?.name ?? '—'}</TableCell>
                <TableCell align="right">{money(l.lastPushedPriceMinor)}</TableCell>
                <TableCell align="right" sx={{ color: drift ? 'error.main' : 'inherit' }}>{money(l.remotePriceMinor)}</TableCell>
                <TableCell>
                  <Chip size="small" label={drift ? 'DRIFT' : l.lastSyncStatus} color={drift ? 'error' : l.lastSyncStatus === 'SYNCED' ? 'success' : 'default'} />
                </TableCell>
                <TableCell align="right"><Button size="small" onClick={() => refresh.mutate(l._id)}>Refresh</Button></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Box>
  );
}

export default function ChannelsScreen() {
  const [tab, setTab] = useState(0);
  return (
    <Box>
      <Typography variant="h5" fontWeight={800} gutterBottom>Sales Channels</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Stores" /><Tab label="Margins" /><Tab label="Price matrix" /><Tab label="Live listings" />
      </Tabs>
      {tab === 0 && <ConnectionsTab />}
      {tab === 1 && <MarginsTab />}
      {tab === 2 && <PriceMatrixTab />}
      {tab === 3 && <ListingsTab />}
    </Box>
  );
}
