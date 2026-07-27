import { useState } from 'react';
import {
  Alert, Box, Button, Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useLevels, useReorderReport, useInventoryMutations } from './hooks.js';
import { RequirePermission } from '../../auth/RequirePermission.jsx';

const STATUS_COLOR = { in_stock: 'success', low: 'warning', out: 'error', overstock: 'info' };

export default function InventoryScreen() {
  const { data } = useLevels({ limit: 50 });
  const { data: reorder } = useReorderReport();
  const { adjust } = useInventoryMutations();
  const [error, setError] = useState('');

  const bump = (level, delta) => {
    setError('');
    adjust.mutate(
      { productId: level.productId?._id ?? level.productId, warehouseId: level.warehouseId?._id ?? level.warehouseId, delta, reason: 'CORRECTION' },
      { onError: (e) => setError(e.response?.data?.error?.message ?? 'Adjustment failed') },
    );
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={800} gutterBottom>Inventory</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!!reorder?.length && (
        <Box sx={{ mb: 2, p: 1.5, border: '1px dashed', borderColor: 'warning.main', borderRadius: 2 }}>
          <Typography variant="subtitle2" fontWeight={700} gutterBottom>Reorder suggestions ({reorder.length})</Typography>
          {reorder.slice(0, 5).map((r, i) => (
            <Typography key={i} variant="caption" display="block" color="text.secondary">
              {r.product?.sku} — {r.available} available · {r.daysOfCover ?? '∞'} days of cover · reorder {r.recommendedReorderQty}
            </Typography>
          ))}
        </Box>
      )}

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>SKU</TableCell><TableCell>Warehouse</TableCell>
            <TableCell align="right">On hand</TableCell><TableCell align="right">Reserved</TableCell>
            <TableCell align="right">Available</TableCell><TableCell>Status</TableCell><TableCell align="right">Adjust</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {(data?.data ?? []).map((l) => (
            <TableRow key={l._id ?? l.id}>
              <TableCell>{l.productId?.sku ?? '—'}</TableCell>
              <TableCell>{l.warehouseId?.code ?? '—'}</TableCell>
              <TableCell align="right">{l.onHand}</TableCell>
              <TableCell align="right">{l.reserved}</TableCell>
              <TableCell align="right"><strong>{l.available}</strong></TableCell>
              <TableCell><Chip size="small" label={l.status} color={STATUS_COLOR[l.status] ?? 'default'} /></TableCell>
              <TableCell align="right">
                <RequirePermission permission="inventory:manage">
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    <Button size="small" onClick={() => bump(l, -1)}>-1</Button>
                    <Button size="small" onClick={() => bump(l, +10)}>+10</Button>
                  </Stack>
                </RequirePermission>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        Available = on hand − reserved. Reservations can never exceed on hand.
      </Typography>
    </Box>
  );
}
