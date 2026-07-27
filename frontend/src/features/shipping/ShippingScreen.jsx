import { useState } from 'react';
import {
  Alert, Box, Button, Chip, Divider, MenuItem, Paper, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { usePackages, useShipments, useShippingMutations } from './hooks.js';
import { RequirePermission } from '../../auth/RequirePermission.jsx';
import { money } from '../../lib/money.js';

const STATUS_COLOR = {
  PENDING: 'default', LABEL_PURCHASED: 'info', SHIPPED: 'info', IN_TRANSIT: 'primary',
  DELIVERED: 'success', RETURNED: 'warning', CANCELLED: 'default', EXCEPTION: 'error',
};

/** Rate shopping: enter a destination + weight, compare every carrier's rates side by side. */
function RateShopper() {
  const { data: packages } = usePackages();
  const { shopRates } = useShippingMutations();
  const [toPostal, setToPostal] = useState('10001');
  const [weightG, setWeightG] = useState('1500');
  const [strategy, setStrategy] = useState('CHEAPEST');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const shop = () => {
    setError(''); setResult(null);
    shopRates.mutate(
      { from: { postalCode: '94105', country: 'US' }, to: { postalCode: toPostal, country: 'US' },
        items: [{ weightG: Number(weightG), quantity: 1 }], strategy },
      { onSuccess: setResult, onError: (e) => setError(e.response?.data?.error?.message ?? 'Rate shopping failed') },
    );
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
      <Typography variant="subtitle1" fontWeight={800} gutterBottom>Rate shopping</Typography>
      {!packages?.length && <Alert severity="warning" sx={{ mb: 1 }}>No package types defined — seed or create one first.</Alert>}
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}

      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        <TextField size="small" label="Destination ZIP" value={toPostal} onChange={(e) => setToPostal(e.target.value)} sx={{ width: 150 }} />
        <TextField size="small" label="Weight (g)" value={weightG} onChange={(e) => setWeightG(e.target.value)} sx={{ width: 130 }} />
        <TextField select size="small" label="Strategy" value={strategy} onChange={(e) => setStrategy(e.target.value)} sx={{ minWidth: 160 }}>
          {['CHEAPEST', 'FASTEST', 'BEST_VALUE'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
        </TextField>
        <Button variant="contained" onClick={shop} disabled={shopRates.isPending}>Compare rates</Button>
      </Stack>

      {result && (
        <>
          <Typography variant="caption" color="text.secondary">
            Packed into <strong>{result.package.name}</strong> · billable {result.parcel.weightG}g · zone {result.zone}
            {result.ruleApplied && <> · rule <strong>{result.ruleApplied}</strong></>}
          </Typography>
          <Divider sx={{ my: 1 }} />
          <Table size="small">
            <TableHead><TableRow><TableCell>Carrier</TableCell><TableCell>Service</TableCell><TableCell align="right">Price</TableCell><TableCell align="right">Days</TableCell><TableCell /></TableRow></TableHead>
            <TableBody>
              {result.rates.map((r, i) => {
                const isSelected = result.selected && r.carrier === result.selected.carrier && r.serviceCode === result.selected.serviceCode;
                return (
                  <TableRow key={`${r.carrier}-${r.serviceCode}`} sx={isSelected ? { bgcolor: 'action.hover' } : undefined}>
                    <TableCell>{r.carrier}</TableCell>
                    <TableCell>{r.service}</TableCell>
                    <TableCell align="right">{money(r.amount)}</TableCell>
                    <TableCell align="right">{r.estDeliveryDays}</TableCell>
                    <TableCell>{isSelected && <Chip size="small" color="success" label="selected" />}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </>
      )}
    </Paper>
  );
}

export default function ShippingScreen() {
  const { data: shipments } = useShipments({ limit: 50 });
  const { refresh } = useShippingMutations();

  return (
    <Box>
      <Typography variant="h5" fontWeight={800} gutterBottom>Shipping</Typography>
      <RateShopper />

      <Typography variant="subtitle1" fontWeight={800} gutterBottom>Shipments</Typography>
      <Table size="small">
        <TableHead>
          <TableRow><TableCell>Tracking</TableCell><TableCell>Carrier</TableCell><TableCell>Service</TableCell>
            <TableCell align="right">Cost</TableCell><TableCell>Status</TableCell><TableCell align="right" /></TableRow>
        </TableHead>
        <TableBody>
          {!shipments?.data?.length && (
            <TableRow><TableCell colSpan={6}><Typography variant="body2" color="text.secondary">No shipments yet. Buy a label from an order to create one.</Typography></TableCell></TableRow>
          )}
          {(shipments?.data ?? []).map((s) => (
            <TableRow key={s._id}>
              <TableCell sx={{ fontFamily: 'monospace' }}>{s.trackingNumber}</TableCell>
              <TableCell>{s.carrier}</TableCell>
              <TableCell>{s.service}</TableCell>
              <TableCell align="right">{money(s.amount)}</TableCell>
              <TableCell><Chip size="small" label={s.status} color={STATUS_COLOR[s.status] ?? 'default'} /></TableCell>
              <TableCell align="right">
                <RequirePermission permission="shipping:manage">
                  <Button size="small" onClick={() => refresh.mutate(s._id)}>Refresh</Button>
                </RequirePermission>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}
