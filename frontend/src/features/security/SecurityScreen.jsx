import { useState } from 'react';
import {
  Alert, Box, Button, Chip, LinearProgress, MenuItem, Paper, Stack, Tab, Tabs, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useSecDashboard, useSecEvents, useSessions, useIpAllowlist, useRetention, useGdpr, useControls, useReport, useSecurityMutations } from './hooks.js';
import { RequirePermission } from '../../auth/RequirePermission.jsx';

const SEV_COLOR = { INFO: 'default', LOW: 'info', MEDIUM: 'warning', HIGH: 'error', CRITICAL: 'error' };
const READY_COLOR = { 'not-ready': 'error', 'in-progress': 'warning', 'nearly-ready': 'info', 'audit-ready': 'success' };

function DashboardTab() {
  const { data: d } = useSecDashboard();
  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ mb: 3 }} flexWrap="wrap" useFlexGap>
        {Object.entries(d?.eventsBySeverity ?? {}).map(([sev, count]) => (
          <Paper key={sev} variant="outlined" sx={{ p: 2, minWidth: 120 }}>
            <Chip size="small" label={sev} color={SEV_COLOR[sev] ?? 'default'} />
            <Typography variant="h5" fontWeight={800} sx={{ mt: 0.5 }}>{count}</Typography>
          </Paper>
        ))}
        <Paper variant="outlined" sx={{ p: 2, minWidth: 120 }}>
          <Typography variant="caption" color="text.secondary">Active sessions</Typography>
          <Typography variant="h5" fontWeight={800}>{d?.activeSessions ?? 0}</Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 2, minWidth: 120 }}>
          <Typography variant="caption" color="text.secondary">Locked accounts</Typography>
          <Typography variant="h5" fontWeight={800} color={d?.activeLockouts ? 'error.main' : 'text.primary'}>{d?.activeLockouts ?? 0}</Typography>
        </Paper>
      </Stack>

      {!!d?.compliance?.length && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle2" fontWeight={800} gutterBottom>Compliance readiness</Typography>
          {d.compliance.map((c) => (
            <Box key={c.framework} sx={{ mb: 1.5 }}>
              <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                <Typography variant="body2">{c.framework}</Typography>
                <Chip size="small" label={c.readiness} color={READY_COLOR[c.readiness] ?? 'default'} />
              </Stack>
              <LinearProgress variant="determinate" value={c.score * 100} />
            </Box>
          ))}
        </Paper>
      )}

      <Typography variant="subtitle2" fontWeight={800} gutterBottom>Recent events</Typography>
      {!d?.recentEvents?.length && <Typography variant="body2" color="text.secondary">No events yet. Try a failed login.</Typography>}
      {(d?.recentEvents ?? []).map((e) => (
        <Stack key={e._id} direction="row" spacing={1.5} alignItems="center" sx={{ py: 0.6, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Chip size="small" label={e.severity} color={SEV_COLOR[e.severity] ?? 'default'} />
          <Typography variant="body2" sx={{ fontFamily: 'monospace', minWidth: 160 }}>{e.type}</Typography>
          <Typography variant="caption" sx={{ flexGrow: 1 }}>{e.email ?? e.userId ?? ''} {e.ip ? `· ${e.ip}` : ''}</Typography>
          {e.riskScore != null && <Chip size="small" variant="outlined" label={`risk ${e.riskScore}`} />}
          <Typography variant="caption" color="text.secondary">{new Date(e.createdAt).toLocaleTimeString()}</Typography>
        </Stack>
      ))}
    </Box>
  );
}

function SessionsTab() {
  const { data: sessions } = useSessions();
  const { revokeSession, revokeAll, clearLockout } = useSecurityMutations();
  const [email, setEmail] = useState('');
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
        Only the token hash is stored. A concurrent-session cap evicts the oldest session automatically.
      </Typography>
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        <Button variant="outlined" color="error" onClick={() => revokeAll.mutate()}>Revoke all my sessions</Button>
        <RequirePermission permission="security:manage">
          <TextField size="small" label="Unlock account (email)" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button disabled={!email} onClick={() => clearLockout.mutate(email, { onSuccess: () => setEmail('') })}>Clear lockout</Button>
        </RequirePermission>
      </Stack>
      <Table size="small">
        <TableHead><TableRow><TableCell>Device</TableCell><TableCell>IP</TableCell><TableCell>Status</TableCell><TableCell>Last seen</TableCell><TableCell align="right" /></TableRow></TableHead>
        <TableBody>
          {!sessions?.length && <TableRow><TableCell colSpan={5}><Typography variant="body2" color="text.secondary">No sessions recorded.</Typography></TableCell></TableRow>}
          {(sessions ?? []).map((s) => (
            <TableRow key={s._id}>
              <TableCell>{s.deviceLabel}</TableCell>
              <TableCell>{s.ip ?? '—'}</TableCell>
              <TableCell><Chip size="small" label={s.status} color={s.status === 'ACTIVE' ? 'success' : 'default'} /></TableCell>
              <TableCell>{new Date(s.lastSeenAt).toLocaleString()}</TableCell>
              <TableCell align="right">{s.status === 'ACTIVE' && <Button size="small" color="error" onClick={() => revokeSession.mutate(s._id)}>Revoke</Button>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

function AccessTab() {
  const { data: ips } = useIpAllowlist();
  const { addIp, removeIp } = useSecurityMutations();
  const [cidr, setCidr] = useState('');
  const [label, setLabel] = useState('');
  return (
    <Box>
      <Alert severity="warning" sx={{ mb: 2 }}>
        An <strong>empty allowlist allows all IPs</strong>. Adding your first entry immediately restricts
        access to that range — make sure it includes you.
      </Alert>
      <RequirePermission permission="security:manage">
        <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
          <TextField size="small" label="CIDR" placeholder="10.0.0.0/8" value={cidr} onChange={(e) => setCidr(e.target.value)} />
          <TextField size="small" label="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
          <Button variant="contained" disabled={!cidr} onClick={() => addIp.mutate({ cidr, label }, { onSuccess: () => { setCidr(''); setLabel(''); } })}>Add</Button>
        </Stack>
      </RequirePermission>
      {!ips?.length && <Typography variant="body2" color="text.secondary">Allowlist empty — all IPs permitted.</Typography>}
      {(ips ?? []).map((e) => (
        <Stack key={e._id} direction="row" alignItems="center" spacing={2} sx={{ py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography sx={{ fontFamily: 'monospace', minWidth: 160 }}>{e.cidr}</Typography>
          <Typography variant="body2" sx={{ flexGrow: 1 }}>{e.label}</Typography>
          <RequirePermission permission="security:manage">
            <Button size="small" color="error" onClick={() => removeIp.mutate(e._id)}>Remove</Button>
          </RequirePermission>
        </Stack>
      ))}
    </Box>
  );
}

function PrivacyTab() {
  const { data: retention } = useRetention();
  const { data: requests } = useGdpr();
  const m = useSecurityMutations();
  const [email, setEmail] = useState('');
  const [type, setType] = useState('ACCESS');
  const [msg, setMsg] = useState('');

  return (
    <Box>
      {msg && <Alert severity="info" sx={{ mb: 2 }} onClose={() => setMsg('')}>{msg}</Alert>}

      <Typography variant="subtitle2" fontWeight={800} gutterBottom>Data retention</Typography>
      <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
        <RequirePermission permission="security:manage">
          <Button size="small" variant="outlined" onClick={() => m.runRetention.mutate(undefined, { onSuccess: (r) => setMsg(`Retention run: ${r.results.map((x) => `${x.entity} ${x.affected ?? 0}`).join(', ')}`) })}>Run retention now</Button>
        </RequirePermission>
      </Stack>
      {(retention ?? []).map((p) => (
        <Typography key={p._id} variant="caption" display="block" color="text.secondary">
          {p.entity}: {p.action} after {p.ttlDays} days {p.lastRunAt ? `· last run ${new Date(p.lastRunAt).toLocaleDateString()}` : ''}
        </Typography>
      ))}

      <Typography variant="subtitle2" fontWeight={800} sx={{ mt: 3 }} gutterBottom>GDPR requests</Typography>
      <RequirePermission permission="security:manage">
        <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
          <TextField size="small" label="Subject email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextField select size="small" label="Type" value={type} onChange={(e) => setType(e.target.value)} sx={{ minWidth: 150 }}>
            {['ACCESS', 'ERASURE', 'PORTABILITY', 'RECTIFICATION'].map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </TextField>
          <Button variant="contained" disabled={!email} onClick={() => m.createGdpr.mutate({ subjectEmail: email, type }, { onSuccess: () => setEmail('') })}>Create</Button>
        </Stack>
      </RequirePermission>

      {(requests ?? []).map((r) => (
        <Paper key={r._id} variant="outlined" sx={{ p: 1.5, mb: 1 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip size="small" label={r.type} />
              <Typography variant="body2">{r.subjectEmail}</Typography>
              <Chip size="small" label={r.status} color={r.status === 'COMPLETED' ? 'success' : 'default'} />
            </Stack>
            <RequirePermission permission="security:manage">
              <Stack direction="row" spacing={1}>
                {r.type === 'ACCESS' || r.type === 'PORTABILITY' ? (
                  <Button size="small" onClick={() => m.processAccess.mutate(r._id, { onSuccess: (x) => setMsg(`Export built: ${x.totalRecords} records across ${x.sections.length} sources`) })}>Build export</Button>
                ) : (
                  <>
                    <Button size="small" onClick={() => m.processErasure.mutate({ id: r._id, dryRun: true }, { onSuccess: (x) => setMsg(`Dry run: would affect ${x.plan.total} records`) })}>Dry run</Button>
                    <Button size="small" color="error" onClick={() => m.processErasure.mutate({ id: r._id, dryRun: false }, { onSuccess: (x) => setMsg(`Erased ${x.plan.total} records`) })}>Execute</Button>
                  </>
                )}
              </Stack>
            </RequirePermission>
          </Stack>
        </Paper>
      ))}
    </Box>
  );
}

function ComplianceTab() {
  const [framework, setFramework] = useState('SOC2');
  const { data: controls } = useControls(framework);
  const { data: report } = useReport(framework);
  const { seedFramework, updateControl } = useSecurityMutations();

  return (
    <Box>
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} alignItems="center">
        <TextField select size="small" label="Framework" value={framework} onChange={(e) => setFramework(e.target.value)} sx={{ minWidth: 140 }}>
          {['SOC2', 'GDPR'].map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
        </TextField>
        <RequirePermission permission="security:manage">
          <Button variant="outlined" onClick={() => seedFramework.mutate(framework)}>Seed starter checklist</Button>
        </RequirePermission>
        {report && <Chip label={`${Math.round(report.score * 100)}% · ${report.readiness}`} color={READY_COLOR[report.readiness] ?? 'default'} />}
      </Stack>

      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
        Score excludes NOT_APPLICABLE controls from the denominator — marking a control N/A doesn't inflate readiness.
      </Typography>

      <Table size="small">
        <TableHead><TableRow><TableCell>Control</TableCell><TableCell>Title</TableCell><TableCell>Status</TableCell></TableRow></TableHead>
        <TableBody>
          {!controls?.length && <TableRow><TableCell colSpan={3}><Typography variant="body2" color="text.secondary">No controls — seed the checklist.</Typography></TableCell></TableRow>}
          {(controls ?? []).map((c) => (
            <TableRow key={c._id}>
              <TableCell sx={{ fontFamily: 'monospace' }}>{c.controlId}</TableCell>
              <TableCell>{c.title}</TableCell>
              <TableCell>
                <RequirePermission permission="security:manage" fallback={<Chip size="small" label={c.status} />}>
                  <TextField select size="small" value={c.status} sx={{ minWidth: 160 }}
                    onChange={(e) => updateControl.mutate({ id: c._id, body: { status: e.target.value } })}>
                    {['NOT_STARTED', 'IN_PROGRESS', 'IMPLEMENTED', 'NOT_APPLICABLE'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                  </TextField>
                </RequirePermission>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {!!report?.gaps?.length && (
        <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
          <Typography variant="subtitle2" fontWeight={800} gutterBottom>Gaps to close (not-started first)</Typography>
          {report.gaps.map((g) => (
            <Typography key={g.controlId} variant="caption" display="block" color={g.status === 'NOT_STARTED' ? 'error.main' : 'warning.main'}>
              {g.controlId} — {g.title} ({g.status})
            </Typography>
          ))}
        </Paper>
      )}
    </Box>
  );
}

export default function SecurityScreen() {
  const [tab, setTab] = useState(0);
  return (
    <Box>
      <Typography variant="h5" fontWeight={800} gutterBottom>Security</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Dashboard" /><Tab label="Sessions" /><Tab label="Access" /><Tab label="Privacy" /><Tab label="Compliance" />
      </Tabs>
      {tab === 0 && <DashboardTab />}
      {tab === 1 && <SessionsTab />}
      {tab === 2 && <AccessTab />}
      {tab === 3 && <PrivacyTab />}
      {tab === 4 && <ComplianceTab />}
    </Box>
  );
}
