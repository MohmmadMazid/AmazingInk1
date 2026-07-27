import { useState } from 'react';
import {
  Alert, Box, Button, Chip, Grid, MenuItem, Paper, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useDashboard, usePnl, useByChannel, useTopProducts, useInventoryValuation, useAnalyticsMutations } from './hooks.js';
import { analyticsApi } from './api.js';
import { RequirePermission } from '../../auth/RequirePermission.jsx';
import { money } from '../../lib/money.js';

const fmt = (k) => (k.unit === 'money' ? money(k.value) : k.value);

/** A KPI tile with its period-over-period delta. null deltaPct = "n/a" (zero base). */
function KpiCard({ k }) {
  const up = (k.delta ?? 0) > 0;
  const neutral = (k.delta ?? 0) === 0;
  const isBad = k.key === 'refunds' && up;
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="caption" color="text.secondary">{k.label}</Typography>
      <Typography variant="h5" fontWeight={800}>{fmt(k)}</Typography>
      {k.delta !== undefined && (
        <Chip size="small" sx={{ mt: 0.5 }}
          color={neutral ? 'default' : isBad ? 'error' : up ? 'success' : 'warning'}
          label={k.deltaPct == null ? 'n/a' : `${up ? '+' : ''}${k.deltaPct}%`} />
      )}
    </Paper>
  );
}

export default function AnalyticsScreen() {
  const [preset, setPreset] = useState('last_30_days');
  const [grain, setGrain] = useState('DAY');
  const params = { preset, grain };
  const { data: dash } = useDashboard(params);
  const { data: pnl } = usePnl({ preset });
  const { data: channels } = useByChannel({ preset });
  const { data: products } = useTopProducts({ preset, limit: 5 });
  const { data: inventory } = useInventoryValuation();
  const { rebuild } = useAnalyticsMutations();
  const [msg, setMsg] = useState('');

  const series = (dash?.revenueSeries ?? []).map((p) => ({ date: p.date.slice(5), revenue: p.value / 100, previous: (p.compare ?? 0) / 100 }));

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={800}>Analytics</Typography>
        <Stack direction="row" spacing={1.5}>
          <TextField select size="small" label="Period" value={preset} onChange={(e) => setPreset(e.target.value)} sx={{ minWidth: 160 }}>
            {['today', 'last_7_days', 'last_30_days', 'last_90_days', 'this_month', 'this_year'].map((p) => <MenuItem key={p} value={p}>{p.replace(/_/g, ' ')}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Grain" value={grain} onChange={(e) => setGrain(e.target.value)} sx={{ minWidth: 110 }}>
            {['DAY', 'WEEK', 'MONTH'].map((g) => <MenuItem key={g} value={g}>{g}</MenuItem>)}
          </TextField>
          <RequirePermission permission="analytics:manage">
            <Button variant="outlined" onClick={() => rebuild.mutate({}, { onSuccess: (r) => setMsg(`Rollups rebuilt: ${r.documents} docs from ${r.ordersScanned} orders (${r.days} days)`) })}>
              Rebuild rollups
            </Button>
          </RequirePermission>
        </Stack>
      </Stack>

      {msg && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMsg('')}>{msg}</Alert>}
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
        Dashboards read pre-aggregated daily rollups — never the orders collection — so cost stays
        O(days) regardless of order volume. Comparison window: {dash?.comparisonRange?.from} → {dash?.comparisonRange?.to}.
      </Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {(dash?.kpis ?? []).map((k) => <Grid item xs={6} md={2} key={k.key}><KpiCard k={k} /></Grid>)}
      </Grid>

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle2" fontWeight={800} gutterBottom>Net revenue vs previous period</Typography>
        <Box sx={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" fontSize={11} /><YAxis fontSize={11} />
              <Tooltip formatter={(v) => money(Math.round(Number(v) * 100))} /><Legend />
              <Area type="monotone" dataKey="previous" stroke="#bbb" fill="#eee" name="Previous" />
              <Area type="monotone" dataKey="revenue" stroke="#4f46e5" fill="#c7d2fe" name="Net revenue" />
            </AreaChart>
          </ResponsiveContainer>
        </Box>
      </Paper>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="subtitle2" fontWeight={800}>Profit &amp; loss</Typography>
              <Button size="small" href={analyticsApi.exportUrl('sales', { preset })}>Export CSV</Button>
            </Stack>
            {(pnl?.lines ?? []).map((l) => (
              <Stack key={l.key} direction="row" justifyContent="space-between" sx={{ py: 0.5, borderTop: l.kind === 'subtotal' || l.kind === 'total' ? '1px solid' : 'none', borderColor: 'divider' }}>
                <Typography variant="body2" fontWeight={l.kind === 'total' ? 800 : l.kind === 'subtotal' ? 600 : 400}>{l.label}</Typography>
                <Typography variant="body2" fontWeight={l.kind === 'total' ? 800 : 400} color={l.amount < 0 ? 'error.main' : 'text.primary'}>{money(l.amount)}</Typography>
              </Stack>
            ))}
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Chip size="small" label={`Gross margin ${pnl?.grossMarginPct ?? 0}%`} />
              <Chip size="small" color="primary" label={`Net margin ${pnl?.netMarginPct ?? 0}%`} />
            </Stack>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle2" fontWeight={800} gutterBottom>Revenue by channel</Typography>
            {!channels?.slices?.length && <Typography variant="body2" color="text.secondary">No channel data.</Typography>}
            {(channels?.slices ?? []).map((s) => (
              <Stack key={s.key} direction="row" justifyContent="space-between" sx={{ py: 0.4 }}>
                <Typography variant="body2">{s.label}</Typography>
                <Typography variant="body2">{money(s.value)} <Chip size="small" variant="outlined" label={`${s.sharePct}%`} sx={{ ml: 1 }} /></Typography>
              </Stack>
            ))}
          </Paper>

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="subtitle2" fontWeight={800}>Top products</Typography>
              <Button size="small" href={analyticsApi.exportUrl('products', { preset })}>Export CSV</Button>
            </Stack>
            {!products?.slices?.length && <Typography variant="body2" color="text.secondary">No sales in this period.</Typography>}
            {(products?.slices ?? []).map((s) => (
              <Stack key={s.key} direction="row" justifyContent="space-between" sx={{ py: 0.4 }}>
                <Typography variant="body2" noWrap sx={{ maxWidth: 260 }}>{s.label}</Typography>
                <Typography variant="body2">{money(s.value)} <Chip size="small" variant="outlined" label={`${s.sharePct}%`} sx={{ ml: 1 }} /></Typography>
              </Stack>
            ))}
          </Paper>
        </Grid>
      </Grid>

      <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="subtitle2" fontWeight={800}>Inventory valuation (at cost)</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip size="small" label={`${inventory?.totalUnits ?? 0} units`} />
            <Chip size="small" color="primary" label={money(inventory?.totalValue)} />
            <Button size="small" href={analyticsApi.exportUrl('inventory', {})}>Export CSV</Button>
          </Stack>
        </Stack>
        <Table size="small">
          <TableHead><TableRow><TableCell>SKU</TableCell><TableCell align="right">On hand</TableCell><TableCell align="right">Unit cost</TableCell><TableCell align="right">Value</TableCell></TableRow></TableHead>
          <TableBody>
            {(inventory?.rows ?? []).map((r, i) => (
              <TableRow key={i}>
                <TableCell>{r.sku}</TableCell>
                <TableCell align="right">{r.onHand}</TableCell>
                <TableCell align="right">{money(r.unitCost)}</TableCell>
                <TableCell align="right">{money(r.valueAtCost)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
