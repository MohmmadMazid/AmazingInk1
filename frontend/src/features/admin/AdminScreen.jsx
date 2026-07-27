import { useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Chip, Divider, MenuItem, Paper, Slider, Stack, Switch,
  Tab, Tabs, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useAudit, useCredentials, useWebhooks, useFlags, useEvaluatedFlags, useRoles, usePermissionCatalog, useAdminUsers, useAdminMutations, useCurrencies, useCurrency } from './hooks.js';
import { RequirePermission } from '../../auth/RequirePermission.jsx';

const KIND_COLOR = { CHANGE: 'info', SECURITY: 'warning', ACTIVITY: 'default' };

/** Credentials: plaintext key shown exactly once, then only a masked prefix forever. */
function CredentialsTab() {
  const { data: creds } = useCredentials();
  const { createCredential, revokeCredential } = useAdminMutations();
  const [name, setName] = useState('');
  const [newKey, setNewKey] = useState('');

  return (
    <Box>
      {newKey && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setNewKey('')}>
          <Typography variant="body2" fontWeight={700}>Copy this key now — it will never be shown again.</Typography>
          <Typography sx={{ fontFamily: 'monospace', mt: 0.5, wordBreak: 'break-all' }}>{newKey}</Typography>
        </Alert>
      )}
      <RequirePermission permission="admin:manage">
        <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
          <TextField size="small" label="Credential name" value={name} onChange={(e) => setName(e.target.value)} />
          <Button variant="contained" disabled={!name}
            onClick={() => createCredential.mutate({ name, scopes: ['read'] }, { onSuccess: (r) => { setNewKey(r.plaintextKey); setName(''); } })}>
            Create key
          </Button>
        </Stack>
      </RequirePermission>
      <Table size="small">
        <TableHead><TableRow><TableCell>Name</TableCell><TableCell>Key</TableCell><TableCell>Status</TableCell><TableCell>Last used</TableCell><TableCell align="right" /></TableRow></TableHead>
        <TableBody>
          {!creds?.length && <TableRow><TableCell colSpan={5}><Typography variant="body2" color="text.secondary">No credentials.</Typography></TableCell></TableRow>}
          {(creds ?? []).map((c) => (
            <TableRow key={c._id}>
              <TableCell>{c.name}</TableCell>
              <TableCell sx={{ fontFamily: 'monospace' }}>{c.maskedKey}</TableCell>
              <TableCell><Chip size="small" label={c.status} color={c.status === 'ACTIVE' ? 'success' : 'default'} /></TableCell>
              <TableCell><Typography variant="caption">{c.lastUsedAt ? new Date(c.lastUsedAt).toLocaleString() : 'never'}</Typography></TableCell>
              <TableCell align="right">
                {c.status === 'ACTIVE' && (
                  <RequirePermission permission="admin:manage">
                    <Button size="small" color="error" onClick={() => revokeCredential.mutate(c._id)}>Revoke</Button>
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

/** Feature flags with a live percentage-rollout slider. */
function FlagsTab() {
  const { data: flags } = useFlags();
  const { data: evaluated } = useEvaluatedFlags();
  const { upsertFlag } = useAdminMutations();
  const [key, setKey] = useState('');

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
        Percentage rollouts bucket users deterministically by hash — the same user always gets the
        same answer, so a 30% rollout is stable rather than flickering per request.
      </Typography>
      <RequirePermission permission="admin:manage">
        <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
          <TextField size="small" label="New flag key" value={key} onChange={(e) => setKey(e.target.value)} placeholder="new-checkout" />
          <Button variant="contained" disabled={!key} onClick={() => upsertFlag.mutate({ key, enabled: false, audience: 'ALL' }, { onSuccess: () => setKey('') })}>Add flag</Button>
        </Stack>
      </RequirePermission>

      {(flags ?? []).map((f) => (
        <Paper key={f._id} variant="outlined" sx={{ p: 2, mb: 1.5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography sx={{ fontFamily: 'monospace' }} fontWeight={700}>{f.key}</Typography>
              <Chip size="small" label={f.audience} variant="outlined" />
              {evaluated?.[f.key] !== undefined && (
                <Chip size="small" color={evaluated[f.key] ? 'success' : 'default'} label={evaluated[f.key] ? 'on for you' : 'off for you'} />
              )}
            </Stack>
            <RequirePermission permission="admin:manage">
              <Switch checked={f.enabled} onChange={(e) => upsertFlag.mutate({ key: f.key, enabled: e.target.checked, audience: f.audience, rolloutPct: f.rolloutPct })} />
            </RequirePermission>
          </Stack>
          <RequirePermission permission="admin:manage">
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1 }}>
              <TextField select size="small" label="Audience" value={f.audience} sx={{ minWidth: 150 }}
                onChange={(e) => upsertFlag.mutate({ key: f.key, enabled: f.enabled, audience: e.target.value, rolloutPct: f.rolloutPct })}>
                {['ALL', 'ROLE', 'PERCENTAGE', 'USERS'].map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
              </TextField>
              {f.audience === 'PERCENTAGE' && (
                <Box sx={{ flexGrow: 1, maxWidth: 300 }}>
                  <Typography variant="caption">Rollout: {f.rolloutPct}%</Typography>
                  <Slider size="small" value={f.rolloutPct} min={0} max={100}
                    onChangeCommitted={(_, v) => upsertFlag.mutate({ key: f.key, enabled: f.enabled, audience: 'PERCENTAGE', rolloutPct: v })} />
                </Box>
              )}
            </Stack>
          </RequirePermission>
        </Paper>
      ))}
    </Box>
  );
}

/** Roles with permission wildcards (orders:* grants every orders action). */
function RolesTab() {
  const { data: roles } = useRoles();
  const { data: catalog } = usePermissionCatalog();
  const { data: users } = useAdminUsers();
  const { upsertRole } = useAdminMutations();
  const [name, setName] = useState('');
  const [perms, setPerms] = useState([]);

  const wildcards = [...new Set((catalog ?? []).map((p) => `${p.split(':')[0]}:*`))];

  return (
    <Box>
      <RequirePermission permission="admin:manage">
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" fontWeight={800} gutterBottom>Create / update role</Typography>
          <Stack direction="row" spacing={1.5} alignItems="flex-start">
            <TextField size="small" label="Role name" value={name} onChange={(e) => setName(e.target.value)} />
            <Autocomplete multiple size="small" sx={{ flexGrow: 1 }} options={['*', ...wildcards, ...(catalog ?? [])]}
              value={perms} onChange={(_, v) => setPerms(v)}
              renderInput={(p) => <TextField {...p} label="Permissions (wildcards allowed)" />} />
            <Button variant="contained" disabled={!name || !perms.length}
              onClick={() => upsertRole.mutate({ name, permissions: perms }, { onSuccess: () => { setName(''); setPerms([]); } })}>Save</Button>
          </Stack>
        </Paper>
      </RequirePermission>

      <Table size="small">
        <TableHead><TableRow><TableCell>Role</TableCell><TableCell>Permissions</TableCell><TableCell>Users</TableCell></TableRow></TableHead>
        <TableBody>
          {(roles ?? []).map((r) => (
            <TableRow key={r._id}>
              <TableCell><Typography fontWeight={700}>{r.name}</Typography>{r.system && <Chip size="small" label="system" sx={{ ml: 1 }} />}</TableCell>
              <TableCell>{r.permissions.map((p) => <Chip key={p} size="small" variant="outlined" label={p} sx={{ mr: 0.5, mb: 0.5 }} />)}</TableCell>
              <TableCell>{(users ?? []).filter((u) => (u.roles ?? []).includes(r.name)).length}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

/** Webhooks: each payload is HMAC-signed and replay-protected. */
function WebhooksTab() {
  const { data: hooks } = useWebhooks();
  const { createWebhook, removeWebhook, testWebhook } = useAdminMutations();
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState(['order.created']);
  const [msg, setMsg] = useState('');

  const EVENTS = ['order.created', 'order.fulfilled', 'inventory.low_stock', 'listing.synced', 'sync.failed'];

  return (
    <Box>
      {msg && <Alert severity="info" sx={{ mb: 2 }} onClose={() => setMsg('')}>{msg}</Alert>}
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
        Each payload is signed <code>HMAC-SHA256(timestamp.body)</code> and sent as
        <code> X-MCCMS-Signature</code>. Receivers must reject signatures older than 5 minutes.
      </Typography>
      <RequirePermission permission="admin:manage">
        <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
          <TextField size="small" label="Endpoint URL" value={url} onChange={(e) => setUrl(e.target.value)} sx={{ flexGrow: 1 }} placeholder="https://example.com/hooks" />
          <Autocomplete multiple size="small" sx={{ minWidth: 260 }} options={EVENTS} value={events} onChange={(_, v) => setEvents(v)}
            renderInput={(p) => <TextField {...p} label="Events" />} />
          <Button variant="contained" disabled={!url || !events.length} onClick={() => createWebhook.mutate({ url, events }, { onSuccess: () => setUrl('') })}>Add</Button>
        </Stack>
      </RequirePermission>

      {(hooks ?? []).map((h) => (
        <Paper key={h._id} variant="outlined" sx={{ p: 2, mb: 1.5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="body2" fontWeight={700}>{h.url}</Typography>
              <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                {h.events.map((e) => <Chip key={e} size="small" variant="outlined" label={e} />)}
              </Stack>
            </Box>
            <RequirePermission permission="admin:manage">
              <Stack direction="row" spacing={1}>
                <Button size="small" onClick={() => testWebhook.mutate(h.events[0], { onSuccess: (r) => setMsg(`Dispatched ${r.event} to ${r.endpoints} endpoint(s)`) })}>Test</Button>
                <Button size="small" color="error" onClick={() => removeWebhook.mutate(h._id)}>Delete</Button>
              </Stack>
            </RequirePermission>
          </Stack>
          {!!h.recentDeliveries?.length && (
            <Stack direction="row" spacing={0.5} sx={{ mt: 1 }}>
              {h.recentDeliveries.slice(0, 8).map((d) => (
                <Chip key={d._id} size="small" color={d.status === 'SUCCESS' ? 'success' : 'error'} label={d.statusCode ?? d.status} />
              ))}
            </Stack>
          )}
        </Paper>
      ))}
    </Box>
  );
}

/** Audit trail — diffs arrive pre-redacted, so secrets never reach this table. */
function AuditTab() {
  const { data } = useAudit({ limit: 50 });
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
        Field-level diffs with secret-looking keys (password, token, apiKey, hash…) redacted before persistence.
      </Typography>
      <Table size="small">
        <TableHead><TableRow><TableCell>When</TableCell><TableCell>Kind</TableCell><TableCell>Actor</TableCell><TableCell>Summary</TableCell><TableCell>Changes</TableCell></TableRow></TableHead>
        <TableBody>
          {!data?.data?.length && <TableRow><TableCell colSpan={5}><Typography variant="body2" color="text.secondary">No audit entries yet — make a change.</Typography></TableCell></TableRow>}
          {(data?.data ?? []).map((a) => (
            <TableRow key={a._id}>
              <TableCell><Typography variant="caption">{new Date(a.createdAt).toLocaleString()}</Typography></TableCell>
              <TableCell><Chip size="small" label={a.kind} color={KIND_COLOR[a.kind] ?? 'default'} /></TableCell>
              <TableCell><Typography variant="caption">{a.actorEmail ?? '—'}</Typography></TableCell>
              <TableCell><Typography variant="body2">{a.summary}</Typography></TableCell>
              <TableCell>
                {Object.entries(a.diff ?? {}).slice(0, 3).map(([k, v]) => (
                  <Typography key={k} variant="caption" display="block" color="text.secondary">
                    {k}: {String(v.before ?? '—')} → {String(v.after ?? '—')}
                  </Typography>
                ))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

/** Platform currency. Changing it does NOT convert stored amounts — see the warning. */
function GeneralTab() {
  const { data: currencies } = useCurrencies();
  const { data: current } = useCurrency();
  const { setCurrency } = useAdminMutations();

  return (
    <Box sx={{ maxWidth: 560 }}>
      <Typography variant="subtitle2" fontWeight={800} gutterBottom>Currency</Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
        Every price, cost, and margin in the platform is stored as an integer count of minor
        units of this currency.
      </Typography>

      <Alert severity="warning" sx={{ mb: 2 }}>
        Switching currency <strong>does not convert existing amounts</strong> — no exchange rate is
        applied. A stored value of <code>1299</code> becomes £12.99 or $12.99 depending on this
        setting. Change it on a fresh dataset, or convert your data first.
      </Alert>

      <RequirePermission permission="admin:manage" fallback={<Chip label={current?.currency} />}>
        <TextField select size="small" label="Currency" sx={{ minWidth: 280 }}
          value={current?.currency ?? ''} onChange={(e) => setCurrency.mutate(e.target.value)}>
          {(currencies ?? []).map((c) => (
            <MenuItem key={c.code} value={c.code}>
              {c.symbol} — {c.code} · {c.label}
              {c.minorUnits === 0 && ' (no decimal places)'}
            </MenuItem>
          ))}
        </TextField>
      </RequirePermission>
    </Box>
  );
}

export default function AdminScreen() {
  const [tab, setTab] = useState(0);
  return (
    <RequirePermission permission="admin:view" fallback={<Alert severity="warning">You need the admin:view permission.</Alert>}>
      <Box>
        <Typography variant="h5" fontWeight={800} gutterBottom>Administration</Typography>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }} variant="scrollable" scrollButtons="auto">
          <Tab label="General" /><Tab label="Credentials" /><Tab label="Feature flags" /><Tab label="Roles" /><Tab label="Webhooks" /><Tab label="Audit log" />
        </Tabs>
        {tab === 0 && <GeneralTab />}
        {tab === 1 && <CredentialsTab />}
        {tab === 2 && <FlagsTab />}
        {tab === 3 && <RolesTab />}
        {tab === 4 && <WebhooksTab />}
        {tab === 5 && <AuditTab />}
      </Box>
    </RequirePermission>
  );
}
