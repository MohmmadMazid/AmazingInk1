import { useState } from 'react';
import {
  Alert, Box, Button, Chip, Divider, Paper, Stack, Tab, Tabs, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useGlobalSearch, useSuggest, useIndexStatus, useSynonyms, useSearchAnalytics, useSearchMutations } from './hooks.js';
import { RequirePermission } from '../../auth/RequirePermission.jsx';

/** Renders <mark> tags the backend produced, safely (only mark tags are ever emitted). */
const Highlighted = ({ html }) => <span dangerouslySetInnerHTML={{ __html: html }} />;

function SearchTab() {
  const [q, setQ] = useState('');
  const { data: results } = useGlobalSearch(q);
  const { data: suggestions } = useSuggest(q);

  return (
    <Box>
      <TextField fullWidth size="small" label="Search products, customers, orders — or scan a barcode"
        value={q} onChange={(e) => setQ(e.target.value)} sx={{ mb: 1 }} />

      {!!suggestions?.completions?.length && (
        <Stack direction="row" spacing={0.5} sx={{ mb: 2 }}>
          {suggestions.completions.slice(0, 6).map((c) => <Chip key={c} size="small" label={c} onClick={() => setQ(c)} />)}
        </Stack>
      )}
      {suggestions?.didYouMean && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Did you mean <Button size="small" onClick={() => setQ(suggestions.didYouMean)}>{suggestions.didYouMean}</Button>?
        </Alert>
      )}

      {results?.mode === 'barcode' && (
        <Alert severity={results.barcodeValid ? 'success' : 'warning'} sx={{ mb: 2 }}>
          Barcode lookup — checksum {results.barcodeValid ? 'valid' : 'INVALID'}. {results.note ?? ''}
        </Alert>
      )}

      {q.length >= 2 && !results?.results?.length && <Typography variant="body2" color="text.secondary">No matches.</Typography>}

      {(results?.results ?? []).map((group) => (
        <Paper key={group.entity} variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <Typography variant="subtitle2" fontWeight={800}>{group.entity}</Typography>
            <Chip size="small" label={`${group.total} match${group.total === 1 ? '' : 'es'}`} />
          </Stack>
          {group.hits.map((h) => (
            <Box key={h.id} sx={{ py: 0.75, borderTop: '1px solid', borderColor: 'divider' }}>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2">
                  {h._highlight ? <Highlighted html={h._highlight} /> : (h.title ?? h.email ?? h.orderNumber)}
                </Typography>
                {h._score != null && <Chip size="small" variant="outlined" label={`score ${h._score}`} />}
              </Stack>
              {h._snippet && <Typography variant="caption" color="text.secondary">{h._snippet}</Typography>}
            </Box>
          ))}
        </Paper>
      ))}
    </Box>
  );
}

function IndexTab() {
  const { data: status } = useIndexStatus();
  const { rebuild } = useSearchMutations();
  const [msg, setMsg] = useState('');
  return (
    <Box>
      {msg && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMsg('')}>{msg}</Alert>}
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
        Engine: <strong>{status?.engine}</strong>. The in-memory engine is fully functional
        (scoring, facets, fuzzy, highlighting). Swap the adapter for OpenSearch at scale.
      </Typography>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        {Object.entries(status?.counts ?? {}).map(([entity, count]) => (
          <Paper key={entity} variant="outlined" sx={{ p: 2, minWidth: 130 }}>
            <Typography variant="caption" color="text.secondary">{entity}</Typography>
            <Typography variant="h5" fontWeight={800}>{count}</Typography>
            <Typography variant="caption">documents</Typography>
          </Paper>
        ))}
      </Stack>
      <RequirePermission permission="admin:manage">
        <Button variant="contained" onClick={() => rebuild.mutate(undefined, { onSuccess: (r) => setMsg(`Reindexed: ${r.results.map((x) => `${x.entity} ${x.indexed}`).join(', ')}`) })}>
          Rebuild all indices
        </Button>
      </RequirePermission>
    </Box>
  );
}

function SynonymsTab() {
  const { data: synonyms } = useSynonyms();
  const { createSynonym, removeSynonym } = useSearchMutations();
  const [terms, setTerms] = useState('');
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
        A query term expands to every term in its group, so searching "mouse" also finds "pointer".
      </Typography>
      <RequirePermission permission="admin:manage">
        <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
          <TextField size="small" label="Comma-separated terms" value={terms} onChange={(e) => setTerms(e.target.value)} sx={{ flexGrow: 1 }} placeholder="mouse, mice, pointer" />
          <Button variant="contained" onClick={() => createSynonym.mutate(terms.split(',').map((t) => t.trim()).filter(Boolean), { onSuccess: () => setTerms('') })}>Add group</Button>
        </Stack>
      </RequirePermission>
      {(synonyms ?? []).map((s) => (
        <Stack key={s._id} direction="row" alignItems="center" spacing={1} sx={{ py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Box sx={{ flexGrow: 1 }}>{s.terms.map((t) => <Chip key={t} size="small" label={t} sx={{ mr: 0.5 }} />)}</Box>
          <RequirePermission permission="admin:manage">
            <Button size="small" color="error" onClick={() => removeSynonym.mutate(s._id)}>Delete</Button>
          </RequirePermission>
        </Stack>
      ))}
    </Box>
  );
}

/** Zero-result queries are the useful signal: they reveal catalog gaps. */
function AnalyticsTab() {
  const { data } = useSearchAnalytics();
  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <Paper variant="outlined" sx={{ p: 2, minWidth: 140 }}><Typography variant="caption">Queries ({data?.days}d)</Typography><Typography variant="h5" fontWeight={800}>{data?.totalQueries ?? 0}</Typography></Paper>
        <Paper variant="outlined" sx={{ p: 2, minWidth: 140 }}><Typography variant="caption">Avg latency</Typography><Typography variant="h5" fontWeight={800}>{data?.avgTookMs ?? 0}ms</Typography></Paper>
        <Paper variant="outlined" sx={{ p: 2, minWidth: 140 }}><Typography variant="caption">Zero-result rate</Typography><Typography variant="h5" fontWeight={800} color={(data?.zeroResultRate ?? 0) > 20 ? 'error.main' : 'text.primary'}>{data?.zeroResultRate ?? 0}%</Typography></Paper>
      </Stack>
      <Stack direction="row" spacing={2}>
        <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
          <Typography variant="subtitle2" fontWeight={800} gutterBottom>Top queries</Typography>
          {!data?.topQueries?.length && <Typography variant="body2" color="text.secondary">No searches yet.</Typography>}
          {(data?.topQueries ?? []).map((t) => (
            <Stack key={t.query} direction="row" justifyContent="space-between" sx={{ py: 0.3 }}>
              <Typography variant="body2">{t.query}</Typography>
              <Typography variant="caption">{t.count}× · {t.avgResults} results</Typography>
            </Stack>
          ))}
        </Paper>
        <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
          <Typography variant="subtitle2" fontWeight={800} gutterBottom>Zero-result queries</Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>What customers wanted but you don't stock.</Typography>
          {!data?.zeroResultQueries?.length && <Typography variant="body2" color="text.secondary">None — good.</Typography>}
          {(data?.zeroResultQueries ?? []).map((z) => (
            <Stack key={z.query} direction="row" justifyContent="space-between" sx={{ py: 0.3 }}>
              <Typography variant="body2" color="error.main">{z.query}</Typography>
              <Typography variant="caption">{z.count}×</Typography>
            </Stack>
          ))}
        </Paper>
      </Stack>
    </Box>
  );
}

export default function SearchScreen() {
  const [tab, setTab] = useState(0);
  return (
    <Box>
      <Typography variant="h5" fontWeight={800} gutterBottom>Search</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Search" /><Tab label="Index" /><Tab label="Synonyms" /><Tab label="Analytics" />
      </Tabs>
      {tab === 0 && <SearchTab />}
      {tab === 1 && <IndexTab />}
      {tab === 2 && <SynonymsTab />}
      {tab === 3 && <AnalyticsTab />}
    </Box>
  );
}
