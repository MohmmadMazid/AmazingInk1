import { useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, Divider, FormControlLabel, LinearProgress, MenuItem, Paper, Stack,
  Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import { useImportColumns, useImportMutations } from './hooks.js';
import { importsApi } from './api.js';
import { money, currencyCode } from '../../lib/money.js';
import { RequirePermission } from '../../auth/RequirePermission.jsx';

const ACTION_COLOR = { create: 'success', update: 'info', skip: 'default', error: 'error' };

export default function ImportScreen() {
  const fileRef = useRef(null);
  const { data: columns } = useImportColumns();
  const { preview, commit } = useImportMutations();

  const [csv, setCsv] = useState('');
  const [filename, setFilename] = useState('');
  const [mapping, setMapping] = useState(null);
  const [applyStock, setApplyStock] = useState(true);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  const plan = preview.data;

  const readFile = (file) => {
    setError(''); setDone(null);
    if (!file) return;
    if (!/\.(csv|txt|tsv)$/i.test(file.name)) { setError('Please choose a .csv file'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('File is larger than 5MB'); return; }

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result);
      setCsv(text); setFilename(file.name); setMapping(null);
      preview.mutate({ csv: text }, {
        onSuccess: (p) => setMapping(p.mapping),
        onError: (e) => setError(e.response?.data?.error?.message ?? 'Could not read that file'),
      });
    };
    reader.onerror = () => setError('Could not read that file');
    reader.readAsText(file);
  };

  const remap = (field, header) => {
    const next = { ...mapping };
    if (header === '') delete next[field]; else next[field] = header;
    setMapping(next);
    preview.mutate({ csv, mapping: next }, { onError: (e) => setError(e.response?.data?.error?.message ?? 'Mapping failed') });
  };

  const run = () => {
    setError('');
    commit.mutate({ csv, mapping, applyStock }, {
      onSuccess: setDone,
      onError: (e) => setError(e.response?.data?.error?.message ?? 'Import failed'),
    });
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={800} gutterBottom>Import products</Typography>

      <Alert severity="info" sx={{ mb: 2 }}>
        Prices and costs are read in <strong>{currencyCode()}</strong>. Values like{' '}
        <code>£12.99</code>, <code>12.99</code>, <code>1,299.00</code> all parse correctly.
        Nothing is written until you approve the preview — and importing a supplier cost list
        <strong> automatically reprices every connected store</strong>.
      </Alert>

      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <Button variant="contained" startIcon={<UploadFileIcon />} onClick={() => fileRef.current?.click()}>
          Choose CSV file
        </Button>
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" hidden onChange={(e) => readFile(e.target.files?.[0])} />
        <Button startIcon={<DownloadIcon />} href={importsApi.templateUrl}>Download template</Button>
        <Button startIcon={<DownloadIcon />} href={importsApi.exportUrl}>Export current catalogue</Button>
        {filename && <Chip label={filename} onDelete={() => { setCsv(''); setFilename(''); setMapping(null); preview.reset(); }} />}
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {(preview.isPending || commit.isPending) && <LinearProgress sx={{ mb: 2 }} />}

      {done && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setDone(null)}>
          <Typography variant="body2" fontWeight={700}>
            Imported: {done.created} created, {done.updated} updated, {done.skipped} unchanged
            {done.failed ? `, ${done.failed} failed` : ''}.
          </Typography>
          {done.channelsRepriced > 0 && (
            <Typography variant="body2">
              {done.channelsRepriced} channel price update{done.channelsRepriced === 1 ? '' : 's'} queued —
              open <strong>Channels → Price matrix → Send queue</strong> to push them live.
            </Typography>
          )}
        </Alert>
      )}

      {plan && (
        <>
          {/* ---- column mapping ---- */}
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle2" fontWeight={800} gutterBottom>Column mapping</Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
              Auto-detected from your headers. Change anything that looks wrong.
            </Typography>
            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
              {(columns ?? []).map((c) => (
                <TextField
                  key={c.field} select size="small" sx={{ minWidth: 190 }}
                  label={`${c.field}${c.required ? ' *' : ''}`}
                  helperText={c.type === 'money' ? currencyCode() : c.type}
                  value={mapping?.[c.field] ?? ''}
                  onChange={(e) => remap(c.field, e.target.value)}
                >
                  <MenuItem value=""><em>— not imported —</em></MenuItem>
                  {plan.headers.map((h, i) => (
                    <MenuItem key={h} value={h}>{plan.rawHeaders?.[i] ?? h}</MenuItem>
                  ))}
                </TextField>
              ))}
            </Stack>
            {!!plan.unmapped?.length && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Ignored columns: {plan.unmapped.join(', ')}
              </Typography>
            )}
          </Paper>

          {/* ---- summary ---- */}
          <Stack direction="row" spacing={2} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
            {[['Rows', plan.summary.total], ['Create', plan.summary.create], ['Update', plan.summary.update],
              ['Unchanged', plan.summary.skip], ['Errors', plan.summary.error]].map(([label, v]) => (
              <Paper key={label} variant="outlined" sx={{ p: 2, minWidth: 110 }}>
                <Typography variant="caption" color="text.secondary">{label}</Typography>
                <Typography variant="h5" fontWeight={800}
                  color={label === 'Errors' && v > 0 ? 'error.main' : 'text.primary'}>{v}</Typography>
              </Paper>
            ))}
          </Stack>

          {plan.summary.error > 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {plan.summary.error} row{plan.summary.error === 1 ? '' : 's'} will be skipped. The rest still import.
            </Alert>
          )}

          <RequirePermission permission="products:manage">
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <Button variant="contained" size="large" disabled={commit.isPending || plan.summary.valid === 0} onClick={run}>
                Import {plan.summary.create + plan.summary.update} row
                {plan.summary.create + plan.summary.update === 1 ? '' : 's'}
              </Button>
              <FormControlLabel
                control={<Switch checked={applyStock} onChange={(e) => setApplyStock(e.target.checked)} />}
                label="Also set stock levels" />
            </Stack>
          </RequirePermission>

          {/* ---- row-by-row preview ---- */}
          <Paper variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Line</TableCell><TableCell>SKU</TableCell><TableCell>Action</TableCell>
                  <TableCell>Title</TableCell><TableCell align="right">Cost</TableCell>
                  <TableCell align="right">Price</TableCell><TableCell align="right">Qty</TableCell>
                  <TableCell>Detail</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {plan.plan.map((r) => (
                  <TableRow key={r.line} sx={r.action === 'error' ? { bgcolor: 'error.50' } : undefined}>
                    <TableCell>{r.line}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{r.sku ?? '—'}</TableCell>
                    <TableCell><Chip size="small" label={r.action} color={ACTION_COLOR[r.action]} /></TableCell>
                    <TableCell>{r.value?.title ?? ''}</TableCell>
                    <TableCell align="right">{r.value?.cost != null ? money(r.value.cost) : ''}</TableCell>
                    <TableCell align="right">{r.value?.price != null ? money(r.value.price) : ''}</TableCell>
                    <TableCell align="right">{r.value?.quantity ?? ''}</TableCell>
                    <TableCell>
                      {r.action === 'error' && <Typography variant="caption" color="error">{r.errors.join('; ')}</Typography>}
                      {r.action === 'update' && (
                        <Typography variant="caption" color="text.secondary">
                          {Object.entries(r.changes).map(([k, v]) =>
                            `${k}: ${k === 'cost' || k === 'price' ? `${money(v.from)} → ${money(v.to)}` : `${v.from} → ${v.to}`}`
                          ).join(', ')}
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {plan.truncated && (
              <Typography variant="caption" color="text.secondary" sx={{ p: 2, display: 'block' }}>
                Showing the first 500 rows. All rows will be imported.
              </Typography>
            )}
          </Paper>
        </>
      )}

      {!plan && !preview.isPending && (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            Choose a CSV to begin. Columns are auto-detected — <code>SKU</code>, <code>Product Code</code>,
            <code> Unit Cost (£)</code>, <code>RRP</code>, <code>Qty</code> and similar names all work.
          </Typography>
        </Paper>
      )}
    </Box>
  );
}
