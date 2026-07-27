import { useState } from 'react';
import {
  Alert, Box, Button, Chip, Divider, MenuItem, Paper, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useRules, useQuote, usePricingMutations } from './hooks.js';
import { useProducts } from '../products/hooks.js';
import { RequirePermission } from '../../auth/RequirePermission.jsx';
import { money } from '../../lib/money.js';

const bps = (b) => (b == null ? '—' : `${(b / 100).toFixed(2)}%`);

/** Shows the engine's output for one product: prices, fees, margin, flags, and audit trail. */
function QuotePanel({ productId }) {
  const { data: q } = useQuote(productId);
  const { applyQuote } = usePricingMutations();
  if (!productId) return <Typography variant="body2" color="text.secondary">Select a product to see its quote.</Typography>;
  if (!q) return <Typography variant="body2">Computing…</Typography>;

  const activeFlags = Object.entries(q.flags).filter(([, v]) => v).map(([k]) => k);

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="subtitle1" fontWeight={800}>{q.sku} — {q.title}</Typography>
        <RequirePermission permission="pricing:manage">
          <Button size="small" variant="contained" onClick={() => applyQuote.mutate(productId)}>Apply list price</Button>
        </RequirePermission>
      </Stack>

      <Stack direction="row" spacing={3} sx={{ my: 1.5 }}>
        <Metric label="List price" value={money(q.listPrice)} />
        <Metric label="Final price" value={money(q.finalPrice)} highlight={q.onSale} />
        <Metric label="Cost" value={money(q.cost)} />
        <Metric label="Net proceeds" value={money(q.netProceeds)} />
        <Metric label="Profit" value={money(q.profit)} />
        <Metric label="Margin" value={bps(q.marginBps)} />
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
        {q.ruleApplied && <Chip size="small" label={`rule: ${q.ruleApplied}`} />}
        {q.promotionApplied && <Chip size="small" color="secondary" label={`promo: ${q.promotionApplied}`} />}
        {activeFlags.map((f) => <Chip key={f} size="small" color="warning" label={f} />)}
      </Stack>

      <Divider sx={{ my: 1 }} />
      <Typography variant="caption" color="text.secondary">
        Fees — referral {money(q.fees.referral)} · payment {money(q.fees.payment)} · fixed {money(q.fees.fixed)} · total {money(q.fees.total)}
      </Typography>
      <Box sx={{ mt: 1 }}>
        <Typography variant="caption" fontWeight={700}>Calculation steps</Typography>
        {q.steps.map((s, i) => <Typography key={i} variant="caption" display="block" color="text.secondary">{i + 1}. {s}</Typography>)}
      </Box>
    </Paper>
  );
}
const Metric = ({ label, value, highlight }) => (
  <Box><Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
    <Typography variant="h6" fontWeight={800} color={highlight ? 'secondary.main' : 'text.primary'}>{value}</Typography></Box>
);

export default function PricingScreen() {
  const { data: products } = useProducts({ limit: 50 });
  const { data: rules } = useRules();
  const { createRule, removeRule, bulkApply } = usePricingMutations();
  const [productId, setProductId] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('COST_PLUS_MARGIN');
  const [marginPct, setMarginPct] = useState('20');
  const [rounding, setRounding] = useState('CHARM_99');
  const [msg, setMsg] = useState('');

  const addRule = () => {
    if (!name) return;
    createRule.mutate({ name, type, marginBps: Math.round(Number(marginPct) * 100), rounding, priority: 1 },
      { onSuccess: () => setName('') });
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={800} gutterBottom>Pricing</Typography>
      {msg && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMsg('')}>{msg}</Alert>}

      <TextField select size="small" label="Product" value={productId} onChange={(e) => setProductId(e.target.value)} sx={{ minWidth: 280, mb: 2 }}>
        {(products?.data ?? []).map((p) => <MenuItem key={p._id} value={p._id}>{p.sku} — {p.title}</MenuItem>)}
      </TextField>

      <Box sx={{ mb: 3 }}><QuotePanel productId={productId} /></Box>

      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="subtitle1" fontWeight={800}>Pricing rules</Typography>
        <RequirePermission permission="pricing:manage">
          <Button size="small" onClick={() => bulkApply.mutate(undefined, { onSuccess: (r) => setMsg(`Bulk apply: ${r.changed} of ${r.total} prices changed`) })}>
            Recompute all prices
          </Button>
        </RequirePermission>
      </Stack>

      <RequirePermission permission="pricing:manage">
        <Stack direction="row" spacing={1.5} sx={{ my: 1.5 }}>
          <TextField size="small" label="Rule name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField select size="small" label="Type" value={type} onChange={(e) => setType(e.target.value)} sx={{ minWidth: 190 }}>
            {['COST_PLUS_MARGIN', 'MARKUP_PERCENT', 'FIXED_PRICE', 'COMPETITIVE', 'MARGIN_FLOOR'].map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </TextField>
          <TextField size="small" label="Margin %" value={marginPct} onChange={(e) => setMarginPct(e.target.value)} sx={{ width: 110 }} />
          <TextField select size="small" label="Rounding" value={rounding} onChange={(e) => setRounding(e.target.value)} sx={{ minWidth: 150 }}>
            {['NONE', 'CHARM_99', 'CHARM_95', 'NEAREST_UNIT', 'NEAREST_10'].map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
          </TextField>
          <Button variant="contained" onClick={addRule}>Add rule</Button>
        </Stack>
      </RequirePermission>

      <Table size="small">
        <TableHead><TableRow><TableCell>Name</TableCell><TableCell>Type</TableCell><TableCell>Margin</TableCell><TableCell>Rounding</TableCell><TableCell>Scope</TableCell><TableCell align="right" /></TableRow></TableHead>
        <TableBody>
          {(rules ?? []).map((r) => (
            <TableRow key={r._id}>
              <TableCell>{r.name}</TableCell>
              <TableCell><Chip size="small" label={r.type} /></TableCell>
              <TableCell>{bps(r.marginBps ?? r.markupBps)}</TableCell>
              <TableCell>{r.rounding}</TableCell>
              <TableCell>{r.productId ? 'product' : 'global'}</TableCell>
              <TableCell align="right">
                <RequirePermission permission="pricing:manage">
                  <Button size="small" color="error" onClick={() => removeRule.mutate(r._id)}>Delete</Button>
                </RequirePermission>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}
