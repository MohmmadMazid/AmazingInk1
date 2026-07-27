import { useState } from 'react';
import {
  Alert, Box, Button, Chip, MenuItem, Paper, Stack, Tab, Tabs, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useMonitoring, useHandlers, useRuns, useSchedules, useRules, useWorkflows, useWorkflowRuns, useAutomationMutations } from './hooks.js';
import { RequirePermission } from '../../auth/RequirePermission.jsx';

const STATE_COLOR = { QUEUED: 'default', ACTIVE: 'info', COMPLETED: 'success', FAILED: 'warning', RETRYING: 'warning', DEAD: 'error', PAUSED: 'default' };
const SEV_COLOR = { INFO: 'info', WARNING: 'warning', CRITICAL: 'error' };

function MonitoringTab() {
  const { data: m } = useMonitoring();
  const { pause, resume } = useAutomationMutations();
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
        Queue engine: <strong>{m?.engine}</strong>. The in-memory queue is fully functional but not
        durable — swap the adapter for BullMQ/Redis in production.
      </Typography>

      {(m?.alerts ?? []).map((a, i) => (
        <Alert key={i} severity={SEV_COLOR[a.severity] ?? 'info'} sx={{ mb: 1 }}>
          <strong>{a.kind}</strong> — {a.message}
        </Alert>
      ))}

      <Stack direction="row" spacing={2} sx={{ my: 2 }} flexWrap="wrap" useFlexGap>
        {[['Waiting', m?.queue?.waiting], ['Active', m?.queue?.active], ['Dead', m?.deadCount],
          ['Success rate', m ? `${Math.round(m.stats.successRate * 100)}%` : '—'],
          ['Avg duration', m ? `${m.stats.avgDurationMs}ms` : '—']].map(([label, value]) => (
          <Paper key={label} variant="outlined" sx={{ p: 2, minWidth: 130 }}>
            <Typography variant="caption" color="text.secondary">{label}</Typography>
            <Typography variant="h5" fontWeight={800}>{value ?? 0}</Typography>
          </Paper>
        ))}
      </Stack>

      <RequirePermission permission="automation:manage">
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" disabled={m?.queue?.paused} onClick={() => pause.mutate()}>Pause queue</Button>
          <Button variant="outlined" disabled={!m?.queue?.paused} onClick={() => resume.mutate()}>Resume</Button>
        </Stack>
      </RequirePermission>
    </Box>
  );
}

/** Runs with their retry attempts. Try enqueueing system.always-fail to watch backoff → DEAD. */
function RunsTab() {
  const { data: runs } = useRuns({ limit: 50 });
  const { data: handlers } = useHandlers();
  const { enqueue, retryRun } = useAutomationMutations();
  const [jobKey, setJobKey] = useState('system.noop');

  return (
    <Box>
      <RequirePermission permission="automation:manage">
        <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} alignItems="center">
          <TextField select size="small" label="Job" value={jobKey} onChange={(e) => setJobKey(e.target.value)} sx={{ minWidth: 260 }}>
            {(handlers ?? []).map((h) => <MenuItem key={h} value={h}>{h}</MenuItem>)}
          </TextField>
          <Button variant="contained" onClick={() => enqueue.mutate({ jobKey, payload: {} })}>Run now</Button>
          <Typography variant="caption" color="text.secondary">
            Pick <code>system.always-fail</code> to watch exponential backoff and the DEAD state.
          </Typography>
        </Stack>
      </RequirePermission>

      <Table size="small">
        <TableHead><TableRow><TableCell>Job</TableCell><TableCell>Trigger</TableCell><TableCell>State</TableCell>
          <TableCell align="right">Attempt</TableCell><TableCell>Duration</TableCell><TableCell>Error</TableCell><TableCell align="right" /></TableRow></TableHead>
        <TableBody>
          {!runs?.data?.length && <TableRow><TableCell colSpan={7}><Typography variant="body2" color="text.secondary">No runs yet.</Typography></TableCell></TableRow>}
          {(runs?.data ?? []).map((r) => (
            <TableRow key={r._id}>
              <TableCell sx={{ fontFamily: 'monospace' }}>{r.jobKey}</TableCell>
              <TableCell><Chip size="small" variant="outlined" label={r.trigger} /></TableCell>
              <TableCell><Chip size="small" label={r.state} color={STATE_COLOR[r.state] ?? 'default'} /></TableCell>
              <TableCell align="right">{r.attempt}/{r.maxAttempts}</TableCell>
              <TableCell>{r.durationMs != null ? `${r.durationMs}ms` : '—'}</TableCell>
              <TableCell><Typography variant="caption" color="error">{r.error ?? ''}</Typography></TableCell>
              <TableCell align="right">
                {r.state === 'DEAD' && (
                  <RequirePermission permission="automation:manage">
                    <Button size="small" onClick={() => retryRun.mutate(r._id)}>Retry</Button>
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

function SchedulesTab() {
  const { data: schedules } = useSchedules();
  const { data: handlers } = useHandlers();
  const { upsertSchedule, removeSchedule, tick } = useAutomationMutations();
  const [name, setName] = useState('');
  const [cron, setCron] = useState('0 3 * * *');
  const [jobKey, setJobKey] = useState('analytics.rebuild-rollups');
  const [err, setErr] = useState('');

  return (
    <Box>
      {err && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr('')}>{err}</Alert>}
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
        5-field cron (min hour dom month dow), UTC. Supports lists, ranges, and steps: <code>*/15 * * * *</code>.
      </Typography>
      <RequirePermission permission="automation:manage">
        <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
          <TextField size="small" label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField size="small" label="Cron" value={cron} onChange={(e) => setCron(e.target.value)} sx={{ width: 150 }} />
          <TextField select size="small" label="Job" value={jobKey} onChange={(e) => setJobKey(e.target.value)} sx={{ minWidth: 240 }}>
            {(handlers ?? []).map((h) => <MenuItem key={h} value={h}>{h}</MenuItem>)}
          </TextField>
          <Button variant="contained" disabled={!name}
            onClick={() => upsertSchedule.mutate({ name, cron, jobKey }, { onSuccess: () => setName(''), onError: (e) => setErr(e.response?.data?.error?.message ?? 'Invalid cron') })}>Save</Button>
          <Button onClick={() => tick.mutate()}>Run due now</Button>
        </Stack>
      </RequirePermission>

      <Table size="small">
        <TableHead><TableRow><TableCell>Name</TableCell><TableCell>Cron</TableCell><TableCell>Job</TableCell><TableCell>Next run (UTC)</TableCell><TableCell align="right" /></TableRow></TableHead>
        <TableBody>
          {(schedules ?? []).map((s) => (
            <TableRow key={s._id}>
              <TableCell>{s.name}</TableCell>
              <TableCell sx={{ fontFamily: 'monospace' }}>{s.cron}</TableCell>
              <TableCell sx={{ fontFamily: 'monospace' }}>{s.jobKey}</TableCell>
              <TableCell>{s.nextRunAt ? new Date(s.nextRunAt).toISOString().replace('T', ' ').slice(0, 16) : '—'}</TableCell>
              <TableCell align="right">
                <RequirePermission permission="automation:manage">
                  <Button size="small" color="error" onClick={() => removeSchedule.mutate(s._id)}>Delete</Button>
                </RequirePermission>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

/** Rules fire jobs when an event matches a nested all/any/not condition tree. */
function RulesTab() {
  const { data: rules } = useRules();
  const { testRule, emit } = useAutomationMutations();
  const [result, setResult] = useState('');
  const [event, setEvent] = useState('order.created');

  return (
    <Box>
      {result && <Alert severity="info" sx={{ mb: 2 }} onClose={() => setResult('')}>{result}</Alert>}
      <RequirePermission permission="automation:manage">
        <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} alignItems="center">
          <TextField size="small" label="Emit event" value={event} onChange={(e) => setEvent(e.target.value)} sx={{ minWidth: 200 }} />
          <Button variant="outlined"
            onClick={() => emit.mutate({ event, payload: { order: { totalMinor: 25000, channel: 'amazon', status: 'PAID' } } },
              { onSuccess: (r) => setResult(`Event "${r.event}" matched ${r.matched} rule(s): ${r.rules.join(', ') || 'none'}`) })}>
            Emit test event
          </Button>
          <Typography variant="caption" color="text.secondary">Sends a $250 Amazon order payload.</Typography>
        </Stack>
      </RequirePermission>

      {(rules ?? []).map((r) => (
        <Paper key={r._id} variant="outlined" sx={{ p: 2, mb: 1.5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography fontWeight={700}>{r.name}</Typography>
              <Chip size="small" label={r.event} variant="outlined" />
              <Chip size="small" label={r.enabled ? 'enabled' : 'disabled'} color={r.enabled ? 'success' : 'default'} />
              {r.fireCount > 0 && <Chip size="small" label={`fired ${r.fireCount}×`} />}
            </Stack>
            <Button size="small"
              onClick={() => testRule.mutate({ id: r._id, payload: { order: { totalMinor: 25000, channel: 'amazon', status: 'PAID' } } },
                { onSuccess: (t) => setResult(`Rule "${t.rule}" ${t.matches ? 'MATCHES' : 'does not match'} the sample payload`) })}>
              Dry run
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary" component="pre" sx={{ mt: 1, fontFamily: 'monospace' }}>
            {JSON.stringify(r.condition)} → {r.jobKey ?? 'workflow'}
          </Typography>
        </Paper>
      ))}
    </Box>
  );
}

function WorkflowsTab() {
  const { data: workflows } = useWorkflows();
  const { data: runs } = useWorkflowRuns();
  const { runWorkflow } = useAutomationMutations();

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
        Steps run in order. Each step's input can interpolate <code>{'{{trigger.x}}'}</code> or a prior
        step's result, and a per-step condition can skip it.
      </Typography>
      {(workflows ?? []).map((w) => (
        <Paper key={w._id} variant="outlined" sx={{ p: 2, mb: 1.5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography fontWeight={700}>{w.name}</Typography>
              <Chip size="small" label={w.status} color={w.status === 'ACTIVE' ? 'success' : 'default'} />
            </Stack>
            <RequirePermission permission="automation:manage">
              <Button size="small" disabled={w.status !== 'ACTIVE'}
                onClick={() => runWorkflow.mutate({ id: w._id, payload: { order: { number: 'SO-1234', totalMinor: 25000 } } })}>Run</Button>
            </RequirePermission>
          </Stack>
          {w.steps.map((s, i) => (
            <Typography key={s._id ?? i} variant="caption" display="block" color="text.secondary" sx={{ fontFamily: 'monospace', ml: 1 }}>
              {i + 1}. {s.name} → {s.jobKey}{Object.keys(s.condition ?? {}).length ? ' (conditional)' : ''}
            </Typography>
          ))}
        </Paper>
      ))}

      <Typography variant="subtitle2" fontWeight={800} sx={{ mt: 3, mb: 1 }}>Recent workflow runs</Typography>
      {!runs?.length && <Typography variant="body2" color="text.secondary">No runs yet.</Typography>}
      {(runs ?? []).map((r) => (
        <Stack key={r._id} direction="row" spacing={1} alignItems="center" sx={{ py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Chip size="small" label={r.status} color={r.status === 'SUCCEEDED' ? 'success' : r.status === 'FAILED' ? 'error' : 'info'} />
          <Typography variant="caption">{r.stepResults.map((s) => `${s.name}:${s.status}`).join(' → ')}</Typography>
        </Stack>
      ))}
    </Box>
  );
}

export default function AutomationScreen() {
  const [tab, setTab] = useState(0);
  return (
    <Box>
      <Typography variant="h5" fontWeight={800} gutterBottom>Automation</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Monitoring" /><Tab label="Runs" /><Tab label="Schedules" /><Tab label="Rules" /><Tab label="Workflows" />
      </Tabs>
      {tab === 0 && <MonitoringTab />}
      {tab === 1 && <RunsTab />}
      {tab === 2 && <SchedulesTab />}
      {tab === 3 && <RulesTab />}
      {tab === 4 && <WorkflowsTab />}
    </Box>
  );
}
