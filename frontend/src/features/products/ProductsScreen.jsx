import { useState } from 'react';
import { Box, Button, Chip, IconButton, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import { useProducts, useProductMutations } from './hooks.js';
import { RequirePermission } from '../../auth/RequirePermission.jsx';
import { money } from '../../lib/money.js';


export default function ProductsScreen() {
  const { data } = useProducts({ limit: 50 });
  const { create, remove } = useProductMutations();
  const [sku, setSku] = useState('');
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');

  const add = () => {
    if (!sku || !title || !price) return;
    create.mutate({ sku, title, price: { amountMinor: Math.round(Number(price) * 100), currency: 'USD' }, status: 'ACTIVE' },
      { onSuccess: () => { setSku(''); setTitle(''); setPrice(''); } });
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={800} gutterBottom>Products</Typography>
      <RequirePermission permission="products:manage">
        <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
          <TextField size="small" label="SKU" value={sku} onChange={(e) => setSku(e.target.value)} />
          <TextField size="small" label="Title" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth />
          <TextField size="small" label="Price (USD)" value={price} onChange={(e) => setPrice(e.target.value)} sx={{ width: 140 }} />
          <Button variant="contained" onClick={add} disabled={create.isPending}>Add</Button>
        </Stack>
      </RequirePermission>
      <Table size="small">
        <TableHead>
          <TableRow><TableCell>SKU</TableCell><TableCell>Title</TableCell><TableCell>Price</TableCell><TableCell>Status</TableCell><TableCell /></TableRow>
        </TableHead>
        <TableBody>
          {(data?.data ?? []).map((p) => (
            <TableRow key={p._id}>
              <TableCell>{p.sku}</TableCell>
              <TableCell>{p.title}</TableCell>
              <TableCell>{money(p.price)}</TableCell>
              <TableCell><Chip size="small" label={p.status} color={p.status === 'ACTIVE' ? 'success' : 'default'} /></TableCell>
              <TableCell align="right">
                <RequirePermission permission="products:manage">
                  <IconButton size="small" color="error" onClick={() => remove.mutate(p._id)}><DeleteIcon fontSize="small" /></IconButton>
                </RequirePermission>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}
