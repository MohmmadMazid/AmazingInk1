import { useState } from 'react';
import {
  Alert, Box, Button, Chip, Divider, MenuItem, Paper, Stack, Tab, Tabs, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useProviders, useAiUsage, useAiCalls, useForecast, useDuplicates, useAiMutations } from './hooks.js';
import { useProducts } from '../products/hooks.js';
import { RequirePermission } from '../../auth/RequirePermission.jsx';
import { money, moneyPrecise } from '../../lib/money.js';

const TREND_COLOR = { rising: 'success', falling: 'error', flat: 'default' };

/** Every number here is computed deterministically; the prose is the model's only job. */
function ForecastTab() {
  const { data: products } = useProducts({ limit: 50 });
  const [productId, setProductId] = useState('');
  const { data: f } = useForecast(productId);

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        <strong>The model narrates; it never calculates.</strong> Holt's linear trend, safety stock
        (z·σ·√leadTime), and the reorder point are computed in code. The LLM only explains them —
        so a hallucinated number is structurally impossible.
      </Alert>

      <TextField select size="small" label="Product" value={productId} onChange={(e) => setProductId(e.target.value)} sx={{ minWidth: 280, mb: 2 }}>
        {(products?.data ?? []).map((p) => <MenuItem key={p._id} value={p._id}>{p.sku} — {p.title}</MenuItem>)}
      </TextField>

      {f && (
        <>
          <Stack direction="row" spacing={2} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
            {[['Avg daily demand', f.avgDailyDemand], ['Available', f.available], ['Safety stock', f.safetyStock],
              ['Reorder point', f.reorderPoint], ['Order now', f.recommendedOrderQty]].map(([label, v]) => (
              <Paper key={label} variant="outlined" sx={{ p: 2, minWidth: 130 }}>
                <Typography variant="caption" color="text.secondary">{label}</Typography>
                <Typography variant="h5" fontWeight={800}>{v}</Typography>
              </Paper>
            ))}
            <Paper variant="outlined" sx={{ p: 2, minWidth: 130 }}>
              <Typography variant="caption" color="text.secondary">Trend</Typography>
              <Box sx={{ mt: 1 }}><Chip label={f.trend.direction} color={TREND_COLOR[f.trend.direction]} /></Box>
              <Typography variant="caption">{f.trend.pctPerPeriod}% / day</Typography>
            </Paper>
          </Stack>

          <Typography variant="caption" color="text.secondary">
            History ({f.historyDays} days): {f.series.join(', ') || 'no sales'} · Projected next {f.projected.length}: {f.projected.join(', ')}
          </Typography>

          {!!f.anomalies?.length && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              Anomalies detected (robust MAD z-score): {f.anomalies.map((a) => `day ${a.index} = ${a.value}`).join(', ')}
            </Alert>
          )}

          {f.explanation && (
            <Paper variant="outlined" sx={{ p: 2, mt: 2, bgcolor: 'action.hover' }}>
              <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                <Chip size="small" label={f.provider} />
                <Chip size="small" variant="outlined" label={`cost ${moneyPrecise(f.costMinor)}`} />
              </Stack>
              <Typography variant="body2">{f.explanation}</Typography>
            </Paper>
          )}
        </>
      )}
    </Box>
  );
}

function CatalogTab() {
  const { data: products } = useProducts({ limit: 50 });
  const [productId, setProductId] = useState('');
  const { data: dupes } = useDuplicates(productId);
  const { description, keywords, priceSuggestion } = useAiMutations();
  const [elasticity, setElasticity] = useState('-1.5');
  const [floor, setFloor] = useState('30');

  return (
    <Box>
      <TextField select size="small" label="Product" value={productId} onChange={(e) => setProductId(e.target.value)} sx={{ minWidth: 280, mb: 2 }}>
        {(products?.data ?? []).map((p) => <MenuItem key={p._id} value={p._id}>{p.sku} — {p.title}</MenuItem>)}
      </TextField>

      <RequirePermission permission="ai:use">
        <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
          <Button variant="outlined" disabled={!productId} onClick={() => description.mutate(productId)}>Generate description</Button>
          <Button variant="outlined" disabled={!productId} onClick={() => keywords.mutate(productId)}>Suggest keywords</Button>
        </Stack>
      </RequirePermission>

      {description.data && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="caption" color="text.secondary">Generated description ({description.data.provider}, {moneyPrecise(description.data.costMinor)})</Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>{description.data.description}</Typography>
        </Paper>
      )}
      {keywords.data && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="caption" color="text.secondary">Keywords</Typography>
          <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
            {keywords.data.keywords.map((k) => <Chip key={k} size="small" label={k} />)}
          </Stack>
        </Paper>
      )}

      <Divider sx={{ my: 2 }} />
      <Typography variant="subtitle2" fontWeight={800} gutterBottom>Price suggestion</Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
        The margin floor is a hard clamp, and any move is capped at ±25% of today's price —
        the model cannot talk the price past either guardrail.
      </Typography>
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} alignItems="center">
        <TextField size="small" label="Elasticity" value={elasticity} onChange={(e) => setElasticity(e.target.value)} sx={{ width: 110 }} />
        <TextField size="small" label="Floor margin %" value={floor} onChange={(e) => setFloor(e.target.value)} sx={{ width: 130 }} />
        <RequirePermission permission="ai:use">
          <Button variant="contained" disabled={!productId}
            onClick={() => priceSuggestion.mutate({ id: productId, params: { elasticity, floorMarginPct: floor } })}>Suggest</Button>
        </RequirePermission>
      </Stack>
      {priceSuggestion.data && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Typography variant="body2">Current: <strong>{money(priceSuggestion.data.currentMinor)}</strong></Typography>
            <Typography variant="body2">→ Suggested: <strong>{money(priceSuggestion.data.suggestedMinor)}</strong></Typography>
            <Chip size="small" label={priceSuggestion.data.rationale} color={priceSuggestion.data.rationale === 'raise' ? 'success' : priceSuggestion.data.rationale === 'lower' ? 'warning' : 'default'} />
            <Chip size="small" variant="outlined" label={`margin ${priceSuggestion.data.marginPct}%`} />
            {priceSuggestion.data.floorApplied && <Chip size="small" color="error" label="margin floor applied" />}
            {priceSuggestion.data.moveCapped && <Chip size="small" color="warning" label="move capped at 25%" />}
          </Stack>
          {priceSuggestion.data.explanation && <Typography variant="body2" sx={{ mt: 1 }}>{priceSuggestion.data.explanation}</Typography>}
        </Paper>
      )}

      {!!dupes?.matches?.length && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" fontWeight={800} gutterBottom>Possible duplicates (Jaccard + trigram, deterministic)</Typography>
          {dupes.matches.map((m) => (
            <Stack key={m.id} direction="row" justifyContent="space-between" sx={{ py: 0.3 }}>
              <Typography variant="body2">{m.title}</Typography>
              <Chip size="small" label={`${Math.round(m.score * 100)}% similar`} />
            </Stack>
          ))}
        </Paper>
      )}
    </Box>
  );
}

function InsightsTab() {
  const { insights } = useAiMutations();
  return (
    <Box>
      <RequirePermission permission="ai:use">
        <Button variant="contained" sx={{ mb: 2 }} onClick={() => insights.mutate()}>Generate business insights</Button>
      </RequirePermission>
      {insights.error && <Alert severity="warning">{insights.error.response?.data?.error?.message ?? 'Failed'}</Alert>}
      {insights.data && (
        <>
          <Stack direction="row" spacing={2} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
            <Paper variant="outlined" sx={{ p: 2 }}><Typography variant="caption">Revenue ({insights.data.days}d)</Typography><Typography variant="h5" fontWeight={800}>{money(insights.data.totalRevenueMinor)}</Typography></Paper>
            <Paper variant="outlined" sx={{ p: 2 }}><Typography variant="caption">Orders</Typography><Typography variant="h5" fontWeight={800}>{insights.data.totalOrders}</Typography></Paper>
            <Paper variant="outlined" sx={{ p: 2 }}><Typography variant="caption">Revenue trend</Typography><Box sx={{ mt: 1 }}><Chip label={insights.data.revenueTrend.direction} color={TREND_COLOR[insights.data.revenueTrend.direction]} /></Box></Paper>
          </Stack>
          <Paper variant="outlined" sx={{ p: 2, bgcolor: 'action.hover' }}>
            <Chip size="small" label={insights.data.provider} sx={{ mb: 1 }} />
            <Typography variant="body2">{insights.data.summary}</Typography>
          </Paper>
        </>
      )}
    </Box>
  );
}

/** Every LLM call is metered: tokens, cost in minor units, latency, errors. */
function UsageTab() {
  const { data: providers } = useProviders();
  const { data: usage } = useAiUsage();
  const { data: calls } = useAiCalls();

  return (
    <Box>
      <Alert severity="success" sx={{ mb: 2 }}>
        Active provider: <strong>{providers?.active}</strong>. The <code>ECHO</code> provider is
        deterministic and free — every AI feature works with no API key. Set{' '}
        <code>OPENAI_API_KEY</code> or <code>ANTHROPIC_API_KEY</code> and <code>AI_PROVIDER</code> to go live.
      </Alert>

      <Stack direction="row" spacing={2} sx={{ mb: 3 }} flexWrap="wrap" useFlexGap>
        {[['Calls', usage?.calls], ['Prompt tokens', usage?.promptTokens], ['Completion tokens', usage?.completionTokens],
          ['Total cost', moneyPrecise(usage?.costMinor)], ['Error rate', `${Math.round((usage?.errorRate ?? 0) * 100)}%`],
          ['Avg latency', `${usage?.avgLatencyMs ?? 0}ms`]].map(([label, v]) => (
          <Paper key={label} variant="outlined" sx={{ p: 2, minWidth: 130 }}>
            <Typography variant="caption" color="text.secondary">{label}</Typography>
            <Typography variant="h6" fontWeight={800}>{v ?? 0}</Typography>
          </Paper>
        ))}
      </Stack>

      <Typography variant="subtitle2" fontWeight={800} gutterBottom>Spend by feature</Typography>
      {!usage?.byFeature?.length && <Typography variant="body2" color="text.secondary">No AI calls yet.</Typography>}
      {(usage?.byFeature ?? []).map((f) => (
        <Stack key={f.name} direction="row" justifyContent="space-between" sx={{ py: 0.3 }}>
          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{f.name}</Typography>
          <Typography variant="caption">{f.calls} calls · {moneyPrecise(f.costMinor)}{f.errors ? ` · ${f.errors} errors` : ''}</Typography>
        </Stack>
      ))}

      <Typography variant="subtitle2" fontWeight={800} sx={{ mt: 3 }} gutterBottom>Recent calls</Typography>
      <Table size="small">
        <TableHead><TableRow><TableCell>Feature</TableCell><TableCell>Provider</TableCell><TableCell align="right">Tokens</TableCell><TableCell align="right">Cost</TableCell><TableCell align="right">Latency</TableCell><TableCell>Status</TableCell></TableRow></TableHead>
        <TableBody>
          {(calls ?? []).slice(0, 15).map((c) => (
            <TableRow key={c._id}>
              <TableCell sx={{ fontFamily: 'monospace' }}>{c.feature}</TableCell>
              <TableCell>{c.provider}</TableCell>
              <TableCell align="right">{c.promptTokens + c.completionTokens}</TableCell>
              <TableCell align="right">{moneyPrecise(c.costMinor)}</TableCell>
              <TableCell align="right">{c.latencyMs}ms</TableCell>
              <TableCell><Chip size="small" label={c.status} color={c.status === 'SUCCESS' ? 'success' : 'error'} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

export default function AiScreen() {
  const [tab, setTab] = useState(0);
  return (
    <Box>
      <Typography variant="h5" fontWeight={800} gutterBottom>AI</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Forecast" /><Tab label="Catalog" /><Tab label="Insights" /><Tab label="Usage & cost" />
      </Tabs>
      {tab === 0 && <ForecastTab />}
      {tab === 1 && <CatalogTab />}
      {tab === 2 && <InsightsTab />}
      {tab === 3 && <UsageTab />}
    </Box>
  );
}
