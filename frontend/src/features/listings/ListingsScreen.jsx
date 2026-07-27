import { useState } from 'react';
import {
  Alert, Box, Button, Chip, MenuItem, Paper, Stack, Tab, Tabs, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useChannels, useListings, useOutbox, useConflicts, useListingMutations } from './hooks.js';
import { useProducts } from '../products/hooks.js';
import { RequirePermission } from '../../auth/RequirePermission.jsx';

const HEALTH_COLOR = { HEALTHY: 'success', AT_RISK: 'warning', ERROR: 'error', UNKNOWN: 'default' };
const SYNC_COLOR = { IDLE: 'default', PENDING: 'info', SYNCING: 'info', SYNCED: 'success', FAILED: 'error', CONFLICT: 'warning' };
const OUTBOX_COLOR = { PENDING: 'info', SENT: 'success', FAILED: 'warning', DEAD: 'error' };

function ListingsTab() {
  const { data: listings } = useListings({ limit: 50 });
  const { data: channels } = useChannels();
  const { data: products } = useProducts({ limit: 50 });
  const { publish, sync, syncAll, drain } = useListingMutations();
  const [productId, setProductId] = useState('');
  const [channelId, setChannelId] = useState('');
  const [msg, setMsg] = useState('');

  return (
    <Box>
      {msg && <Alert severity="info" sx={{ mb: 2 }} onClose={() => setMsg('')}>{msg}</Alert>}

      <RequirePermission permission="listings:manage">
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" fontWeight={800} gutterBottom>Publish a product to a channel</Typography>
          <Stack direction="row" spacing={1.5}>
            <TextField select size="small" label="Product" value={productId} onChange={(e) => setProductId(e.target.value)} sx={{ minWidth: 220 }}>
              {(products?.data ?? []).map((p) => <MenuItem key={p._id} value={p._id}>{p.sku} — {p.title}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Channel" value={channelId} onChange={(e) => setChannelId(e.target.value)} sx={{ minWidth: 160 }}>
              {(channels ?? []).map((c) => <MenuItem key={c._id} value={c._id}>{c.name}</MenuItem>)}
            </TextField>
            <Button variant="contained" disabled={!productId || !channelId} onClick={() => publish.mutate({ productId, channelId })}>Publish</Button>
            <Box sx={{ flexGrow: 1 }} />
            <Button onClick={() => syncAll.mutate(undefined, { onSuccess: (r) => setMsg(`Sync: ${r.enqueued} enqueued, ${r.skipped} unchanged (delta-skipped), ${r.conflicts} conflicts`) })}>Sync all</Button>
            <Button variant="outlined" onClick={() => drain.mutate(undefined, { onSuccess: (r) => setMsg(`Outbox drained: ${r.processed} entries processed`) })}>Drain outbox</Button>
          </Stack>
        </Paper>
      </RequirePermission>

      <Table size="small">
        <TableHead>
          <TableRow><TableCell>Product</TableCell><TableCell>Channel</TableCell><TableCell align="right">Pushed qty</TableCell>
            <TableCell align="right">Remote qty</TableCell><TableCell>Sync</TableCell><TableCell>Health</TableCell><TableCell align="right" /></TableRow>
        </TableHead>
        <TableBody>
          {!listings?.data?.length && <TableRow><TableCell colSpan={7}><Typography variant="body2" color="text.secondary">No listings. Publish a product above.</Typography></TableCell></TableRow>}
          {(listings?.data ?? []).map((l) => (
            <TableRow key={l._id}>
              <TableCell>{l.productId?.sku ?? '—'}</TableCell>
              <TableCell>{l.channelId?.code ?? '—'}</TableCell>
              <TableCell align="right">{l.lastPushedQty ?? '—'}</TableCell>
              <TableCell align="right">{l.remoteQty ?? '—'}</TableCell>
              <TableCell><Chip size="small" label={l.lastSyncStatus} color={SYNC_COLOR[l.lastSyncStatus] ?? 'default'} /></TableCell>
              <TableCell><Chip size="small" label={l.health} color={HEALTH_COLOR[l.health] ?? 'default'} /></TableCell>
              <TableCell align="right">
                <RequirePermission permission="listings:manage">
                  <Button size="small" onClick={() => sync.mutate(l._id, { onSuccess: (r) => setMsg(`${r.reason === 'no_change' ? 'No change — delta sync skipped the push' : r.reason === 'enqueued' ? `Enqueued qty ${r.quantityToPush}` : r.reason}`) })}>Sync</Button>
                </RequirePermission>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

/** The outbox makes retries safe: each entry carries an idempotency key. */
function OutboxTab() {
  const { data: outbox } = useOutbox({});
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
        Every marketplace write goes through this outbox. The unique idempotency key means a retry
        can never double-post; transient failures retry with exponential backoff.
      </Typography>
      <Table size="small">
        <TableHead><TableRow><TableCell>Field</TableCell><TableCell align="right">Value</TableCell><TableCell>Status</TableCell>
          <TableCell align="right">Attempt</TableCell><TableCell>Idempotency key</TableCell><TableCell>Error</TableCell></TableRow></TableHead>
        <TableBody>
          {!outbox?.length && <TableRow><TableCell colSpan={6}><Typography variant="body2" color="text.secondary">Outbox empty.</Typography></TableCell></TableRow>}
          {(outbox ?? []).map((o) => (
            <TableRow key={o._id}>
              <TableCell>{o.field}</TableCell>
              <TableCell align="right">{o.value}</TableCell>
              <TableCell><Chip size="small" label={o.status} color={OUTBOX_COLOR[o.status] ?? 'default'} /></TableCell>
              <TableCell align="right">{o.attempt}/{o.maxAttempts}</TableCell>
              <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{o.idempotencyKey.slice(0, 16)}…</TableCell>
              <TableCell><Typography variant="caption" color="error">{o.lastError ?? ''}</Typography></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

function ConflictsTab() {
  const { data: conflicts } = useConflicts();
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
        Drift = the marketplace quantity differs from what we last pushed (an external sale, or an
        edit in the marketplace UI). The channel's conflict policy decides who wins.
      </Typography>
      <Table size="small">
        <TableHead><TableRow><TableCell>Type</TableCell><TableCell>Resolution</TableCell>
          <TableCell align="right">System</TableCell><TableCell align="right">Marketplace</TableCell><TableCell>Detail</TableCell></TableRow></TableHead>
        <TableBody>
          {!conflicts?.length && <TableRow><TableCell colSpan={5}><Typography variant="body2" color="text.secondary">No conflicts.</Typography></TableCell></TableRow>}
          {(conflicts ?? []).map((c) => (
            <TableRow key={c._id}>
              <TableCell><Chip size="small" label={c.type} /></TableCell>
              <TableCell><Chip size="small" color={c.resolution === 'MARKETPLACE_WINS' ? 'warning' : 'info'} label={c.resolution} /></TableCell>
              <TableCell align="right">{c.systemQty}</TableCell>
              <TableCell align="right">{c.marketplaceQty ?? '—'}</TableCell>
              <TableCell><Typography variant="caption">{c.detail}</Typography></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

export default function ListingsScreen() {
  const [tab, setTab] = useState(0);
  return (
    <Box>
      <Typography variant="h5" fontWeight={800} gutterBottom>Listings &amp; Marketplace Sync</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Listings" /><Tab label="Outbox" /><Tab label="Conflicts" />
      </Tabs>
      {tab === 0 && <ListingsTab />}
      {tab === 1 && <OutboxTab />}
      {tab === 2 && <ConflictsTab />}
    </Box>
  );
}
