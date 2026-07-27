import { useState } from 'react';
import {
  Alert, Box, Button, Chip, Divider, FormControlLabel, MenuItem, Paper, Stack, Switch,
  Tab, Tabs, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useInbox, useNotifSettings, useTemplates, useDigest, useProviderOutbox, useNotifMutations } from './hooks.js';
import { RequirePermission } from '../../auth/RequirePermission.jsx';

const PRIORITY_COLOR = { LOW: 'default', NORMAL: 'info', HIGH: 'warning', URGENT: 'error' };
const hhmm = (mins) => (mins == null ? '' : `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`);
const toMins = (s) => { const [h, m] = s.split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };

function InboxTab() {
  const { data } = useInbox({ limit: 50 });
  const { markRead, markAllRead } = useNotifMutations();
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="caption" color="text.secondary">{data?.meta?.unread ?? 0} unread of {data?.meta?.total ?? 0}</Typography>
        <Button size="small" onClick={() => markAllRead.mutate()}>Mark all read</Button>
      </Stack>
      {!data?.data?.length && <Typography variant="body2" color="text.secondary">No notifications. Send a test from the Templates tab.</Typography>}
      {(data?.data ?? []).map((n) => (
        <Paper key={n._id} variant="outlined" sx={{ p: 1.5, mb: 1, bgcolor: n.readAt ? undefined : 'action.hover' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip size="small" label={n.priority} color={PRIORITY_COLOR[n.priority] ?? 'default'} />
              <Typography variant="body2" fontWeight={n.readAt ? 400 : 700}>{n.title}</Typography>
              {n.deferred && <Chip size="small" variant="outlined" label="deferred (quiet hours)" />}
            </Stack>
            {!n.readAt && <Button size="small" onClick={() => markRead.mutate(n._id)}>Mark read</Button>}
          </Stack>
          {n.body && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{n.body}</Typography>}
          <Stack direction="row" spacing={0.5} sx={{ mt: 0.75 }}>
            {(n.deliveries ?? []).map((d, i) => (
              <Chip key={i} size="small" variant="outlined"
                color={d.status === 'SENT' ? 'success' : d.status === 'FAILED' ? 'error' : 'default'}
                label={`${d.channel}: ${d.status}`} />
            ))}
          </Stack>
        </Paper>
      ))}
    </Box>
  );
}

function SettingsTab() {
  const { data: s } = useNotifSettings();
  const { data: digest } = useDigest();
  const { updateSettings } = useNotifMutations();
  const set = (patch) => updateSettings.mutate(patch);
  if (!s) return <Typography variant="body2">Loading…</Typography>;

  return (
    <Box sx={{ maxWidth: 560 }}>
      <Typography variant="subtitle2" fontWeight={800} gutterBottom>Channels</Typography>
      {[['inAppEnabled', 'In-app'], ['emailEnabled', 'Email'], ['smsEnabled', 'SMS'], ['pushEnabled', 'Push']].map(([k, label]) => (
        <FormControlLabel key={k} control={<Switch checked={!!s[k]} onChange={(e) => set({ [k]: e.target.checked })} />} label={label} />
      ))}

      <Divider sx={{ my: 2 }} />
      <Typography variant="subtitle2" fontWeight={800} gutterBottom>Quiet hours</Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
        During quiet hours, non-urgent email/SMS/push are held for your digest. In-app always lands,
        and URGENT alerts always break through.
      </Typography>
      <Stack direction="row" spacing={1.5}>
        <TextField size="small" label="Start" type="time" value={hhmm(s.quietHoursStart)} InputLabelProps={{ shrink: true }}
          onChange={(e) => set({ quietHoursStart: toMins(e.target.value) })} />
        <TextField size="small" label="End" type="time" value={hhmm(s.quietHoursEnd)} InputLabelProps={{ shrink: true }}
          onChange={(e) => set({ quietHoursEnd: toMins(e.target.value) })} />
      </Stack>

      <Divider sx={{ my: 2 }} />
      <Typography variant="subtitle2" fontWeight={800} gutterBottom>Digest</Typography>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <TextField select size="small" label="Cadence" value={s.digest} onChange={(e) => set({ digest: e.target.value })} sx={{ minWidth: 130 }}>
          {['NONE', 'DAILY', 'WEEKLY'].map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
        </TextField>
        <TextField size="small" type="number" label="Hour (UTC)" value={s.digestHour} onChange={(e) => set({ digestHour: Number(e.target.value) })} sx={{ width: 120 }} />
        {digest?.nextDigestAt && <Chip size="small" label={`next: ${new Date(digest.nextDigestAt).toLocaleString()}`} />}
      </Stack>
      {!!digest?.total && (
        <Alert severity="info" sx={{ mt: 2 }}>
          {digest.total} deferred notifications pending: {digest.byCategory.map((c) => `${c.count} ${c.category}`).join(', ')}
        </Alert>
      )}
    </Box>
  );
}

function TemplatesTab() {
  const { data: templates } = useTemplates();
  const { emit } = useNotifMutations();
  const [msg, setMsg] = useState('');
  const [priority, setPriority] = useState('NORMAL');

  const sendTest = (tpl) => {
    emit.mutate(
      { category: tpl.category, templateKey: tpl.key, priority, vars: { user: { name: 'Admin' }, order: { number: 'SO-1234' }, sku: 'SKU-002', count: 3 } },
      { onSuccess: (r) => setMsg(r.suppressed ? `Suppressed: ${r.reason} (dedupe window)` : `Sent on ${r.channels.join(', ')}${r.deferred.length ? ` · deferred ${r.deferred.join(', ')}` : ''}${r.missingVars?.length ? ` · missing vars: ${r.missingVars.join(', ')}` : ''}`) },
    );
  };

  return (
    <Box>
      {msg && <Alert severity="info" sx={{ mb: 2 }} onClose={() => setMsg('')}>{msg}</Alert>}
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} alignItems="center">
        <TextField select size="small" label="Test priority" value={priority} onChange={(e) => setPriority(e.target.value)} sx={{ minWidth: 150 }}>
          {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
        </TextField>
        <Typography variant="caption" color="text.secondary">Try URGENT during quiet hours — it breaks through.</Typography>
      </Stack>
      <Table size="small">
        <TableHead><TableRow><TableCell>Key</TableCell><TableCell>Category</TableCell><TableCell>Subject</TableCell><TableCell align="right" /></TableRow></TableHead>
        <TableBody>
          {(templates ?? []).map((t) => (
            <TableRow key={t._id}>
              <TableCell sx={{ fontFamily: 'monospace' }}>{t.key}</TableCell>
              <TableCell><Chip size="small" label={t.category} /></TableCell>
              <TableCell><Typography variant="caption">{t.subject}</Typography></TableCell>
              <TableCell align="right">
                <RequirePermission permission="notifications:manage">
                  <Button size="small" onClick={() => sendTest(t)}>Send test</Button>
                </RequirePermission>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

/** What the simulated email/SMS/push providers "sent" — proves the fan-out without credentials. */
function ProviderTab() {
  const { data: outbox } = useProviderOutbox();
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
        Email/SMS/push adapters are runnable simulations. This is what they would have sent —
        swap one adapter's <code>send()</code> for a provider call to go live.
      </Typography>
      <Table size="small">
        <TableHead><TableRow><TableCell>Channel</TableCell><TableCell>To</TableCell><TableCell>Subject</TableCell><TableCell>Sent</TableCell></TableRow></TableHead>
        <TableBody>
          {!outbox?.length && <TableRow><TableCell colSpan={4}><Typography variant="body2" color="text.secondary">Nothing sent yet.</Typography></TableCell></TableRow>}
          {(outbox ?? []).map((o, i) => (
            <TableRow key={i}>
              <TableCell><Chip size="small" label={o.channel} /></TableCell>
              <TableCell>{o.to}</TableCell>
              <TableCell><Typography variant="caption">{o.subject ?? o.text}</Typography></TableCell>
              <TableCell><Typography variant="caption">{new Date(o.at).toLocaleTimeString()}</Typography></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

export default function NotificationsScreen() {
  const [tab, setTab] = useState(0);
  return (
    <Box>
      <Typography variant="h5" fontWeight={800} gutterBottom>Notifications</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Inbox" /><Tab label="Preferences" /><Tab label="Templates" /><Tab label="Provider outbox" />
      </Tabs>
      {tab === 0 && <InboxTab />}
      {tab === 1 && <SettingsTab />}
      {tab === 2 && <TemplatesTab />}
      {tab === 3 && <ProviderTab />}
    </Box>
  );
}
