import { useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Chip, Divider, LinearProgress, MenuItem, Paper, Stack,
  Tab, Tabs, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import {
  useKeys, useClients, useSubscriptions, useDeliveries, useUsage, useQuota, useVersions,
  useOpenApi, useSdk, useEventCatalog, useDevMutations,
} from './hooks.js';
import { RequirePermission } from '../../auth/RequirePermission.jsx';

const ENV_COLOR = { LIVE: 'success', SANDBOX: 'warning' };
const DELIVERY_COLOR = { PENDING: 'default', SUCCEEDED: 'success', FAILED: 'warning', DEAD: 'error' };
const METHOD_COLOR = { GET: 'default', POST: 'success', PUT: 'info', DELETE: 'error' };

/** The plaintext key/secret appears exactly once. */
function SecretReveal({ label, secret, onDismiss }) {
  return (
    <Alert severity="success" sx={{ mb: 2 }} onClose={onDismiss}>
      <Typography variant="body2" fontWeight={700}>{label} — copy it now, it will never be shown again</Typography>
      <Box component="code" sx={{ display: 'block', mt: 0.5, p: 1, bgcolor: 'grey.900', color: 'grey.100', borderRadius: 1, wordBreak: 'break-all', fontSize: 12 }}>{secret}</Box>
    </Alert>
  );
}

function KeysTab() {
  const { data: keys } = useKeys();
  const { createKey, revokeKey } = useDevMutations();
  const [name, setName] = useState('');
  const [environment, setEnvironment] = useState('SANDBOX');
  const [tier, setTier] = useState('FREE');
  const [secret, setSecret] = useState('');

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        The key <strong>prefix is the environment</strong>: <code>dk_test_</code> keys can read and
        write sandbox data but can never trigger an external side effect; <code>dk_live_</code> keys can.
      </Alert>
      {secret && <SecretReveal label="API key" secret={secret} onDismiss={() => setSecret('')} />}

      <RequirePermission permission="developer:manage">
        <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
          <TextField size="small" label="Key name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField select size="small" label="Environment" value={environment} onChange={(e) => setEnvironment(e.target.value)} sx={{ minWidth: 130 }}>
            {['SANDBOX', 'LIVE'].map((x) => <MenuItem key={x} value={x}>{x}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Tier" value={tier} onChange={(e) => setTier(e.target.value)} sx={{ minWidth: 130 }}>
            {['FREE', 'STANDARD', 'ENTERPRISE'].map((x) => <MenuItem key={x} value={x}>{x}</MenuItem>)}
          </TextField>
          <Button variant="contained" disabled={!name}
            onClick={() => createKey.mutate({ name, environment, rateTier: tier, scopes: ['products:read', 'orders:read'] },
              { onSuccess: (r) => { setSecret(r.secret); setName(''); } })}>Create key</Button>
        </Stack>
      </RequirePermission>

      <Table size="small">
        <TableHead><TableRow><TableCell>Name</TableCell><TableCell>Key</TableCell><TableCell>Env</TableCell><TableCell>Tier</TableCell><TableCell>Status</TableCell><TableCell align="right" /></TableRow></TableHead>
        <TableBody>
          {!keys?.length && <TableRow><TableCell colSpan={6}><Typography variant="body2" color="text.secondary">No keys yet.</Typography></TableCell></TableRow>}
          {(keys ?? []).map((k) => (
            <TableRow key={k._id}>
              <TableCell>{k.name}</TableCell>
              <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{k.maskedKey}</TableCell>
              <TableCell><Chip size="small" label={k.environment} color={ENV_COLOR[k.environment]} /></TableCell>
              <TableCell>{k.rateTier}</TableCell>
              <TableCell><Chip size="small" label={k.status} color={k.status === 'ACTIVE' ? 'success' : 'default'} /></TableCell>
              <TableCell align="right">
                {k.status === 'ACTIVE' && (
                  <RequirePermission permission="developer:manage">
                    <Button size="small" color="error" onClick={() => revokeKey.mutate(k._id)}>Revoke</Button>
                  </RequirePermission>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

function OAuthTab() {
  const { data: clients } = useClients();
  const { createClient, removeClient } = useDevMutations();
  const [name, setName] = useState('');
  const [grants, setGrants] = useState(['CLIENT_CREDENTIALS']);
  const [secret, setSecret] = useState('');

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        Supports <strong>client_credentials</strong>, <strong>authorization_code with PKCE</strong>,
        and <strong>refresh_token</strong>. Authorization codes are single-use; refresh rotates.
      </Alert>
      {secret && <SecretReveal label="Client secret" secret={secret} onDismiss={() => setSecret('')} />}

      <RequirePermission permission="developer:manage">
        <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} alignItems="flex-start">
          <TextField size="small" label="Client name" value={name} onChange={(e) => setName(e.target.value)} />
          <Autocomplete multiple size="small" sx={{ minWidth: 320 }}
            options={['CLIENT_CREDENTIALS', 'AUTHORIZATION_CODE', 'REFRESH_TOKEN']}
            value={grants} onChange={(_, v) => setGrants(v)}
            renderInput={(p) => <TextField {...p} label="Grant types" />} />
          <Button variant="contained" disabled={!name || !grants.length}
            onClick={() => createClient.mutate({ name, grantTypes: grants, scopes: ['products:read', 'orders:read'] },
              { onSuccess: (r) => { setSecret(r.clientSecret); setName(''); } })}>Create client</Button>
        </Stack>
      </RequirePermission>

      {(clients ?? []).map((c) => (
        <Paper key={c._id} variant="outlined" sx={{ p: 2, mb: 1.5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography fontWeight={700}>{c.name}</Typography>
                <Chip size="small" label={c.environment} color={ENV_COLOR[c.environment]} />
                {!c.active && <Chip size="small" label="disabled" />}
              </Stack>
              <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{c.clientId}</Typography>
              <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                {c.grantTypes.map((g) => <Chip key={g} size="small" variant="outlined" label={g.toLowerCase().replace(/_/g, ' ')} />)}
              </Stack>
            </Box>
            <RequirePermission permission="developer:manage">
              <Button size="small" color="error" onClick={() => removeClient.mutate(c._id)}>Disable</Button>
            </RequirePermission>
          </Stack>
        </Paper>
      ))}
    </Box>
  );
}

function WebhooksTab() {
  const { data: subs } = useSubscriptions();
  const { data: deliveries } = useDeliveries({ limit: 30 });
  const { data: catalog } = useEventCatalog();
  const m = useDevMutations();
  const [url, setUrl] = useState('');
  const [types, setTypes] = useState(['order.created']);
  const [secret, setSecret] = useState('');
  const [msg, setMsg] = useState('');

  const options = [...(catalog?.events ?? []).map((e) => e.type), 'order.*', '*'];

  return (
    <Box>
      {msg && <Alert severity="info" sx={{ mb: 2 }} onClose={() => setMsg('')}>{msg}</Alert>}
      {secret && <SecretReveal label="Signing secret" secret={secret} onDismiss={() => setSecret('')} />}
      <Alert severity="info" sx={{ mb: 2 }}>
        Payloads are signed <code>HMAC-SHA256(timestamp.body)</code>. Failed deliveries retry with
        exponential backoff (1s → 1h) up to 8 attempts, then dead-letter.
      </Alert>

      <RequirePermission permission="developer:manage">
        <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} alignItems="flex-start">
          <TextField size="small" label="Endpoint URL" value={url} onChange={(e) => setUrl(e.target.value)} sx={{ flexGrow: 1 }} placeholder="https://example.com/hooks" />
          <Autocomplete multiple freeSolo size="small" sx={{ minWidth: 300 }} options={options} value={types} onChange={(_, v) => setTypes(v)}
            renderInput={(p) => <TextField {...p} label="Event types" />} />
          <Button variant="contained" disabled={!url || !types.length}
            onClick={() => m.createSubscription.mutate({ endpointUrl: url, eventTypes: types },
              { onSuccess: (r) => { setSecret(r.signingSecret); setUrl(''); if (r.ignored?.length) setMsg(`Ignored unknown patterns: ${r.ignored.join(', ')}`); } })}>Subscribe</Button>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <Button size="small" variant="outlined" onClick={() => m.testEvent.mutate('order.created', { onSuccess: (r) => setMsg(`Dispatched to ${r.matched} subscription(s)`) })}>Send test event</Button>
          <Button size="small" variant="outlined" onClick={() => m.drain.mutate(undefined, { onSuccess: (r) => setMsg(`Drained ${r.processed} deliveries`) })}>Drain queue</Button>
        </Stack>
      </RequirePermission>

      {(subs ?? []).map((s) => (
        <Stack key={s._id} direction="row" alignItems="center" spacing={1} sx={{ py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="body2" sx={{ flexGrow: 1, wordBreak: 'break-all' }}>{s.endpointUrl}</Typography>
          {s.eventTypes.map((t) => <Chip key={t} size="small" variant="outlined" label={t} />)}
          <Chip size="small" label={s.status} color={s.status === 'ACTIVE' ? 'success' : 'default'} />
          <RequirePermission permission="developer:manage">
            <Button size="small" color="error" onClick={() => m.removeSubscription.mutate(s._id)}>Remove</Button>
          </RequirePermission>
        </Stack>
      ))}

      <Typography variant="subtitle2" fontWeight={800} sx={{ mt: 3 }} gutterBottom>Deliveries</Typography>
      <Table size="small">
        <TableHead><TableRow><TableCell>Event</TableCell><TableCell>Status</TableCell><TableCell align="right">Attempt</TableCell><TableCell>Response</TableCell><TableCell align="right" /></TableRow></TableHead>
        <TableBody>
          {!deliveries?.data?.length && <TableRow><TableCell colSpan={5}><Typography variant="body2" color="text.secondary">No deliveries. Send a test event.</Typography></TableCell></TableRow>}
          {(deliveries?.data ?? []).map((d) => (
            <TableRow key={d._id}>
              <TableCell sx={{ fontFamily: 'monospace' }}>{d.eventType}</TableCell>
              <TableCell><Chip size="small" label={d.status} color={DELIVERY_COLOR[d.status]} /></TableCell>
              <TableCell align="right">{d.attempt}/{d.maxAttempts}</TableCell>
              <TableCell><Typography variant="caption" color={d.lastError ? 'error' : 'inherit'}>{d.lastStatusCode ? `HTTP ${d.lastStatusCode}` : ''} {d.lastError ?? ''}</Typography></TableCell>
              <TableCell align="right">
                {(d.status === 'FAILED' || d.status === 'DEAD') && (
                  <RequirePermission permission="developer:manage">
                    <Button size="small" onClick={() => m.redeliver.mutate(d._id)}>Redeliver</Button>
                  </RequirePermission>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

function UsageTab() {
  const { data: usage } = useUsage();
  const [tier, setTier] = useState('FREE');
  const { data: q } = useQuota(tier);
  const pct = q?.remaining == null ? 0 : Math.round((q.used / (q.used + q.remaining || 1)) * 100);

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ mb: 3 }} flexWrap="wrap" useFlexGap>
        {[['Requests (24h)', usage?.total], ['Error rate', `${Math.round((usage?.errorRate ?? 0) * 100)}%`],
          ['p50', `${usage?.latency?.p50 ?? 0}ms`], ['p95', `${usage?.latency?.p95 ?? 0}ms`], ['p99', `${usage?.latency?.p99 ?? 0}ms`]].map(([l, v]) => (
          <Paper key={l} variant="outlined" sx={{ p: 2, minWidth: 120 }}>
            <Typography variant="caption" color="text.secondary">{l}</Typography>
            <Typography variant="h5" fontWeight={800}>{v ?? 0}</Typography>
          </Paper>
        ))}
      </Stack>

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="subtitle2" fontWeight={800}>Monthly quota</Typography>
          <TextField select size="small" value={tier} onChange={(e) => setTier(e.target.value)} sx={{ minWidth: 140 }}>
            {['FREE', 'STANDARD', 'ENTERPRISE'].map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </TextField>
        </Stack>
        {q?.remaining == null
          ? <Typography variant="body2" color="text.secondary">{q?.used ?? 0} requests · unlimited on {tier}</Typography>
          : <>
              <LinearProgress variant="determinate" value={pct} color={q?.exceeded ? 'error' : 'primary'} sx={{ height: 8, borderRadius: 1 }} />
              <Typography variant="caption">{q?.used} used · {q?.remaining} remaining</Typography>
            </>}
      </Paper>

      <Typography variant="subtitle2" fontWeight={800} gutterBottom>By endpoint</Typography>
      {!usage?.byEndpoint?.length && <Typography variant="body2" color="text.secondary">No public-API traffic yet. Call /api/v1/products with a platform key.</Typography>}
      {(usage?.byEndpoint ?? []).map((e) => (
        <Stack key={e.path} direction="row" justifyContent="space-between" sx={{ py: 0.3 }}>
          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{e.path}</Typography>
          <Typography variant="caption">{e.count} calls · {e.avgLatencyMs}ms · {Math.round(e.errorRate * 100)}% err</Typography>
        </Stack>
      ))}
    </Box>
  );
}

/** OpenAPI doc, SDK plan, and event catalog — all generated from ONE endpoint registry. */
function ReferenceTab() {
  const { data: spec } = useOpenApi();
  const { data: sdk } = useSdk();
  const { data: versions } = useVersions();
  const { data: catalog } = useEventCatalog();
  const { seedVersions } = useDevMutations();

  return (
    <Box>
      <Alert severity="success" sx={{ mb: 2 }}>
        The OpenAPI document, the SDK plan, and the live <code>/api/v1</code> routes are all driven
        by a <strong>single endpoint registry</strong> — they can never drift apart.
      </Alert>

      <Typography variant="subtitle2" fontWeight={800} gutterBottom>
        {spec?.info?.title} · {spec?.info?.version} · OpenAPI {spec?.openapi}
      </Typography>
      {Object.entries(spec?.paths ?? {}).map(([path, methods]) => (
        <Box key={path} sx={{ py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{path}</Typography>
          <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
            {Object.entries(methods).map(([method, op]) => (
              <Chip key={method} size="small" color={METHOD_COLOR[method.toUpperCase()] ?? 'default'} label={`${method.toUpperCase()} · ${op.summary}`} />
            ))}
          </Stack>
        </Box>
      ))}

      <Divider sx={{ my: 3 }} />
      <Typography variant="subtitle2" fontWeight={800} gutterBottom>SDK plan</Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
        {sdk?.endpointCount} endpoints → {sdk?.resourceCount} resources · {(sdk?.languages ?? []).join(', ')}
      </Typography>
      {(sdk?.resources ?? []).map((r) => (
        <Box key={r.resource} sx={{ mb: 1 }}>
          <Typography variant="body2" fontWeight={700}>{r.resource}</Typography>
          {r.methods.map((mth) => (
            <Typography key={`${r.resource}.${mth.name}.${mth.method}`} variant="caption" display="block" sx={{ fontFamily: 'monospace', ml: 1 }} color="text.secondary">
              {r.resource}.{mth.name}() → {mth.method} {mth.path}
            </Typography>
          ))}
        </Box>
      ))}

      <Divider sx={{ my: 3 }} />
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="subtitle2" fontWeight={800}>API versions</Typography>
        {!versions?.length && (
          <RequirePermission permission="developer:manage">
            <Button size="small" variant="contained" onClick={() => seedVersions.mutate()}>Seed versions</Button>
          </RequirePermission>
        )}
      </Stack>
      {(versions ?? []).map((v) => (
        <Stack key={v._id} direction="row" spacing={1} alignItems="center" sx={{ py: 0.4 }}>
          <Typography sx={{ fontFamily: 'monospace' }}>{v.version}</Typography>
          <Chip size="small" label={v.status} color={v.status === 'ACTIVE' ? 'success' : v.status === 'DEPRECATED' ? 'warning' : 'error'} />
        </Stack>
      ))}

      <Divider sx={{ my: 3 }} />
      <Typography variant="subtitle2" fontWeight={800} gutterBottom>Event catalog</Typography>
      {(catalog?.events ?? []).map((e) => (
        <Stack key={e.type} direction="row" justifyContent="space-between" sx={{ py: 0.3 }}>
          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{e.type}</Typography>
          <Typography variant="caption" color="text.secondary">{e.description}</Typography>
        </Stack>
      ))}
    </Box>
  );
}

export default function DeveloperScreen() {
  const [tab, setTab] = useState(0);
  return (
    <Box>
      <Typography variant="h5" fontWeight={800} gutterBottom>Developer Platform</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }} variant="scrollable" scrollButtons="auto">
        <Tab label="API Keys" /><Tab label="OAuth Clients" /><Tab label="Webhooks" /><Tab label="Usage" /><Tab label="Reference" />
      </Tabs>
      {tab === 0 && <KeysTab />}
      {tab === 1 && <OAuthTab />}
      {tab === 2 && <WebhooksTab />}
      {tab === 3 && <UsageTab />}
      {tab === 4 && <ReferenceTab />}
    </Box>
  );
}
