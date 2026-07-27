import { useState } from 'react';
import {
  Alert, Box, Button, Chip, Paper, Stack, Tab, Tabs, Table, TableBody, TableCell, TableHead,
  TableRow, Typography, LinearProgress,
} from '@mui/material';
import { useBins, useReceipts, usePickLists, usePickList, usePutawaySuggestions, useWarehouseMutations } from './hooks.js';
import { RequirePermission } from '../../auth/RequirePermission.jsx';

const RECEIPT_COLOR = { EXPECTED: 'default', PARTIAL: 'warning', RECEIVED: 'info', PUTAWAY: 'success', CANCELLED: 'error' };
const PICK_COLOR = { PENDING: 'default', ASSIGNED: 'info', PICKING: 'primary', PICKED: 'success', PACKED: 'success', SHIPPED: 'success', CANCELLED: 'error' };

/** Receiving: record arrivals, then get bin suggestions from the put-away algorithm. */
function ReceivingTab() {
  const { data: receipts } = useReceipts();
  const [selected, setSelected] = useState(null);
  const { data: putaway } = usePutawaySuggestions(selected);
  const { receive, confirmPutaway } = useWarehouseMutations();
  const [error, setError] = useState('');

  const receiveAll = (r) => {
    setError('');
    const lines = r.items.filter((i) => i.receivedQuantity < i.expectedQuantity)
      .map((i) => ({ itemId: i._id, quantity: i.expectedQuantity - i.receivedQuantity }));
    if (!lines.length) return;
    receive.mutate({ id: r._id, body: { lines } }, { onError: (e) => setError(e.response?.data?.error?.message ?? 'Receive failed') });
  };

  const doPutaway = () => {
    const placements = (putaway?.suggestions ?? []).filter((s) => s.binId).map((s) => ({ itemId: s.itemId, binId: s.binId, quantity: s.quantity }));
    if (!placements.length) return;
    confirmPutaway.mutate({ id: selected, body: { placements } }, { onSuccess: () => setSelected(null) });
  };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Table size="small">
        <TableHead><TableRow><TableCell>Reference</TableCell><TableCell>Source</TableCell><TableCell>Items</TableCell><TableCell>Status</TableCell><TableCell align="right" /></TableRow></TableHead>
        <TableBody>
          {!receipts?.length && <TableRow><TableCell colSpan={5}><Typography variant="body2" color="text.secondary">No receipts. Seed creates one.</Typography></TableCell></TableRow>}
          {(receipts ?? []).map((r) => (
            <TableRow key={r._id}>
              <TableCell>{r.reference}</TableCell>
              <TableCell><Chip size="small" variant="outlined" label={r.source} /></TableCell>
              <TableCell>{r.items.reduce((s, i) => s + i.receivedQuantity, 0)} / {r.items.reduce((s, i) => s + i.expectedQuantity, 0)}</TableCell>
              <TableCell><Chip size="small" label={r.status} color={RECEIPT_COLOR[r.status] ?? 'default'} /></TableCell>
              <TableCell align="right">
                <RequirePermission permission="warehouse:manage">
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    {r.status !== 'PUTAWAY' && r.status !== 'CANCELLED' && <Button size="small" onClick={() => receiveAll(r)}>Receive all</Button>}
                    {(r.status === 'RECEIVED' || r.status === 'PARTIAL') && <Button size="small" onClick={() => setSelected(r._id)}>Put away</Button>}
                  </Stack>
                </RequirePermission>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {selected && (
        <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
          <Typography variant="subtitle2" fontWeight={800} gutterBottom>Suggested bins</Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            Consolidates with bins already holding the product, else picks the emptiest storage bin that fits.
          </Typography>
          {(putaway?.suggestions ?? []).map((s, i) => (
            <Typography key={i} variant="body2">
              {s.quantity} units → <strong>{s.binCode ?? 'no bin fits'}</strong>
            </Typography>
          ))}
          <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
            <Button size="small" variant="contained" onClick={doPutaway}>Confirm put-away</Button>
            <Button size="small" onClick={() => setSelected(null)}>Cancel</Button>
          </Stack>
        </Paper>
      )}
    </Box>
  );
}

/** Picking: shows the serpentine walk order the algorithm produced. */
function PickingTab() {
  const { data: lists } = usePickLists();
  const [selected, setSelected] = useState(null);
  const { data: pl } = usePickList(selected);
  const { recordPick } = useWarehouseMutations();

  return (
    <Box>
      <Table size="small">
        <TableHead><TableRow><TableCell>Reference</TableCell><TableCell>Items</TableCell><TableCell>Status</TableCell><TableCell align="right" /></TableRow></TableHead>
        <TableBody>
          {!lists?.length && <TableRow><TableCell colSpan={4}><Typography variant="body2" color="text.secondary">No pick lists yet.</Typography></TableCell></TableRow>}
          {(lists ?? []).map((l) => (
            <TableRow key={l._id}>
              <TableCell>{l.reference}</TableCell>
              <TableCell>{l.items.reduce((s, i) => s + i.pickedQuantity, 0)} / {l.items.reduce((s, i) => s + i.quantity, 0)}</TableCell>
              <TableCell><Chip size="small" label={l.status} color={PICK_COLOR[l.status] ?? 'default'} /></TableCell>
              <TableCell align="right"><Button size="small" onClick={() => setSelected(l._id)}>Open</Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {pl && (
        <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
          <Typography variant="subtitle2" fontWeight={800}>{pl.reference} — serpentine walk order</Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            Bins are sequenced so the picker snakes down one aisle and back up the next.
          </Typography>
          <LinearProgress variant="determinate" sx={{ mb: 2 }}
            value={(pl.items.reduce((s, i) => s + i.pickedQuantity, 0) / Math.max(1, pl.items.reduce((s, i) => s + i.quantity, 0))) * 100} />
          {pl.items.map((i, idx) => (
            <Stack key={i._id} direction="row" alignItems="center" spacing={2} sx={{ py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Chip size="small" label={idx + 1} />
              <Typography variant="body2" sx={{ fontFamily: 'monospace', minWidth: 90 }}>{i.binCode ?? 'unbinned'}</Typography>
              <Typography variant="body2" sx={{ flexGrow: 1 }}>{i.productId?.sku ?? i.productId}</Typography>
              <Typography variant="body2">{i.pickedQuantity} / {i.quantity}</Typography>
              {i.pickedQuantity < i.quantity && (
                <RequirePermission permission="warehouse:manage">
                  <Button size="small" onClick={() => recordPick.mutate({ id: pl._id, body: { itemId: i._id, quantity: i.quantity - i.pickedQuantity } })}>Pick</Button>
                </RequirePermission>
              )}
            </Stack>
          ))}
        </Paper>
      )}
    </Box>
  );
}

function BinsTab() {
  const { data: bins } = useBins();
  return (
    <Table size="small">
      <TableHead><TableRow><TableCell>Code</TableCell><TableCell>Zone</TableCell><TableCell>Type</TableCell><TableCell align="right">Max units</TableCell><TableCell align="right">Sort key</TableCell></TableRow></TableHead>
      <TableBody>
        {(bins ?? []).map((b) => (
          <TableRow key={b._id}>
            <TableCell sx={{ fontFamily: 'monospace' }}>{b.code}</TableCell>
            <TableCell><Chip size="small" variant="outlined" label={b.zoneType} /></TableCell>
            <TableCell>{b.binType}</TableCell>
            <TableCell align="right">{b.maxUnits ?? '∞'}</TableCell>
            <TableCell align="right">{b.sortKey}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function WarehouseScreen() {
  const [tab, setTab] = useState(0);
  return (
    <Box>
      <Typography variant="h5" fontWeight={800} gutterBottom>Warehouse</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Receiving" /><Tab label="Picking" /><Tab label="Bins" />
      </Tabs>
      {tab === 0 && <ReceivingTab />}
      {tab === 1 && <PickingTab />}
      {tab === 2 && <BinsTab />}
    </Box>
  );
}
