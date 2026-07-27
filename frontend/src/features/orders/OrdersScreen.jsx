import { Box, Chip, MenuItem, Select, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { useOrders, useOrderMutations } from './hooks.js';
import { RequirePermission } from '../../auth/RequirePermission.jsx';
import { money } from '../../lib/money.js';

const STATUSES = ['PENDING', 'PAID', 'FULFILLED', 'CANCELLED'];
const COLOR = { PENDING: 'default', PAID: 'info', FULFILLED: 'success', CANCELLED: 'error' };

export default function OrdersScreen() {
  const { data } = useOrders({ limit: 50 });
  const { setStatus } = useOrderMutations();

  return (
    <Box>
      <Typography variant="h5" fontWeight={800} gutterBottom>Orders</Typography>
      <Table size="small">
        <TableHead>
          <TableRow><TableCell>Order #</TableCell><TableCell>Channel</TableCell><TableCell>Lines</TableCell><TableCell>Total</TableCell><TableCell>Status</TableCell></TableRow>
        </TableHead>
        <TableBody>
          {(data?.data ?? []).map((o) => (
            <TableRow key={o._id}>
              <TableCell>{o.orderNumber}</TableCell>
              <TableCell>{o.channel}</TableCell>
              <TableCell>{o.lines?.length ?? 0}</TableCell>
              <TableCell>{money(o.totalMinor)}</TableCell>
              <TableCell>
                <RequirePermission permission="orders:manage" fallback={<Chip size="small" label={o.status} color={COLOR[o.status]} />}>
                  <Select size="small" value={o.status} onChange={(e) => setStatus.mutate({ id: o._id, status: e.target.value })}>
                    {STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                  </Select>
                </RequirePermission>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}
