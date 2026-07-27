import { useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogContent, DialogTitle, Divider, IconButton, Stack, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import InsightsIcon from '@mui/icons-material/Insights';
import { useCustomers, useCustomerMutations, useCustomerMetrics, useDuplicates } from './hooks.js';
import { RequirePermission } from '../../auth/RequirePermission.jsx';
import { money } from '../../lib/money.js';

const SEGMENT_COLOR = { VIP: 'secondary', ACTIVE: 'success', NEW: 'info', AT_RISK: 'warning', LAPSED: 'error', PROSPECT: 'default' };

function MetricsDialog({ id, onClose }) {
  const { data } = useCustomerMetrics(id);
  return (
    <Dialog open={!!id} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Customer insights</DialogTitle>
      <DialogContent>
        {!data ? <Typography variant="body2">Loading…</Typography> : (
          <Stack spacing={1}>
            <Stack direction="row" justifyContent="space-between"><span>Segment</span><Chip size="small" label={data.rfm.segment} color={SEGMENT_COLOR[data.rfm.segment]} /></Stack>
            <Divider />
            <Row label="Lifetime value" value={money(data.metrics.ltv)} />
            <Row label="Orders" value={data.metrics.ordersCount} />
            <Row label="Avg order value" value={money(data.metrics.averageOrderValue)} />
            <Row label="Days since last order" value={data.metrics.daysSinceLastOrder ?? '—'} />
            <Row label="RFM (R/F/M)" value={`${data.rfm.recency} / ${data.rfm.frequency} / ${data.rfm.monetary}`} />
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
const Row = ({ label, value }) => (
  <Stack direction="row" justifyContent="space-between"><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="body2" fontWeight={600}>{value}</Typography></Stack>
);

export default function CustomersScreen() {
  const { data } = useCustomers({ limit: 50 });
  const { create, remove } = useCustomerMutations();
  const { data: dupes } = useDuplicates();
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [metricsId, setMetricsId] = useState(null);

  const add = () => {
    if (!email) return;
    create.mutate({ email, firstName, lastName }, { onSuccess: () => { setEmail(''); setFirstName(''); setLastName(''); } });
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={800} gutterBottom>Customers</Typography>

      <RequirePermission permission="customers:manage">
        <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
          <TextField size="small" label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextField size="small" label="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          <TextField size="small" label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          <Button variant="contained" onClick={add} disabled={create.isPending}>Add</Button>
        </Stack>
      </RequirePermission>

      {!!dupes?.length && (
        <Box sx={{ mb: 2, p: 1.5, border: '1px dashed', borderColor: 'warning.main', borderRadius: 2 }}>
          <Typography variant="subtitle2" fontWeight={700} gutterBottom>Possible duplicates ({dupes.length})</Typography>
          {dupes.slice(0, 5).map((d, i) => (
            <Typography key={i} variant="caption" display="block" color="text.secondary">
              {d.a?.email} ↔ {d.b?.email} — {Math.round(d.score * 100)}% ({d.reasons.join(', ')})
            </Typography>
          ))}
        </Box>
      )}

      <Table size="small">
        <TableHead>
          <TableRow><TableCell>Name</TableCell><TableCell>Email</TableCell><TableCell>Status</TableCell><TableCell>Tags</TableCell><TableCell align="right" /></TableRow>
        </TableHead>
        <TableBody>
          {(data?.data ?? []).map((c) => (
            <TableRow key={c._id}>
              <TableCell>{[c.firstName, c.lastName].filter(Boolean).join(' ') || '—'}</TableCell>
              <TableCell>{c.email}</TableCell>
              <TableCell><Chip size="small" label={c.status} color={c.status === 'ACTIVE' ? 'success' : c.status === 'BLOCKED' ? 'error' : 'default'} /></TableCell>
              <TableCell>{(c.tags ?? []).map((t) => <Chip key={t} size="small" variant="outlined" label={t} sx={{ mr: 0.5 }} />)}</TableCell>
              <TableCell align="right">
                <IconButton size="small" onClick={() => setMetricsId(c._id)}><InsightsIcon fontSize="small" /></IconButton>
                <RequirePermission permission="customers:manage">
                  <IconButton size="small" color="error" onClick={() => remove.mutate(c._id)}><DeleteIcon fontSize="small" /></IconButton>
                </RequirePermission>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <MetricsDialog id={metricsId} onClose={() => setMetricsId(null)} />
    </Box>
  );
}
