import { useEffect, useState } from 'react'
import { trpc } from '../lib/trpc'

type ModelCostRow = {
  modelId: string
  totalCostCents: number | null
  totalInputTokens: number | null
  totalOutputTokens: number | null
  callCount: number | null
  avgDurationMs: number | null
}

type DailySpendRow = {
  day: string
  totalCostCents: number | null
  taskCount: number | null
}

type CostData = {
  byModel: ModelCostRow[]
  dailySpend: DailySpendRow[]
  monthToDateCents: number
  monthlyBudgetCents: number
}

function fmt(cents: number | null) {
  if (cents === null) return '—'
  return `$${(cents / 100).toFixed(4)}`
}

function fmtTokens(n: number | null) {
  if (!n) return '—'
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

function fmtMs(ms: number | null) {
  if (!ms) return '—'
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`
}

const MODEL_COLORS: Record<string, string> = {
  'claude-3-5-sonnet': '#2a9d8f',
  'claude-3-haiku': '#52b788',
  'gpt-4o': '#457b9d',
  'gpt-4o-mini': '#a8c5da',
  'perplexity-sonar-large': '#e9c46a',
  'perplexity-sonar-small': '#f4a261',
}

export function Costs() {
  const [data, setData] = useState<CostData | null>(null)
  const [days, setDays] = useState(7)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const result = await trpc.dashboard.getCosts.query({ days })
      setData(result as CostData)
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load cost data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [days])

  const maxDaily = Math.max(...(data?.dailySpend.map((d) => d.totalCostCents ?? 0) ?? [1]))
  const budgetPct = data && data.monthlyBudgetCents > 0
    ? Math.min(100, Math.round((data.monthToDateCents / data.monthlyBudgetCents) * 100))
    : 0

  return (
    <section className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Costs</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              style={{
                padding: '6px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                background: days === d ? '#172a3a' : '#eee', color: days === d ? '#fff' : '#555',
              }}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: 12, background: '#fff0ed', color: '#e76f51', marginBottom: 20, fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      {/* MTD summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        <article className="metric-card">
          <span>Month-to-Date</span>
          <strong>{fmt(data?.monthToDateCents ?? null)}</strong>
        </article>
        <article className="metric-card">
          <span>Monthly Budget</span>
          <strong>{data?.monthlyBudgetCents ? fmt(data.monthlyBudgetCents) : 'Unlimited'}</strong>
        </article>
        <article className="metric-card">
          <span>Total Model Calls</span>
          <strong>{data?.byModel.reduce((s, m) => s + (m.callCount ?? 0), 0) ?? '—'}</strong>
        </article>
      </div>

      {/* Budget bar */}
      {data && data.monthlyBudgetCents > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 6, color: '#555' }}>
            <span>Budget used: {budgetPct}%</span>
            <span>{fmt(data.monthToDateCents)} / {fmt(data.monthlyBudgetCents)}</span>
          </div>
          <div style={{ height: 10, borderRadius: 999, background: '#eee' }}>
            <div style={{ height: '100%', width: `${budgetPct}%`, background: budgetPct > 80 ? '#e76f51' : '#2a9d8f', borderRadius: 999, transition: 'width 0.4s' }} />
          </div>
        </div>
      )}

      {/* Daily spend chart */}
      {data && data.dailySpend.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '0.95rem', fontWeight: 600 }}>Daily Spend — last {days} days</h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80, padding: '0 4px' }}>
            {data.dailySpend.map((d) => {
              const pct = maxDaily > 0 ? ((d.totalCostCents ?? 0) / maxDaily) * 100 : 0
              return (
                <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div
                    title={`${d.day}: ${fmt(d.totalCostCents)} (${d.taskCount ?? 0} tasks)`}
                    style={{ width: '100%', height: `${Math.max(4, pct)}%`, background: '#2a9d8f', borderRadius: '4px 4px 0 0', transition: 'height 0.3s' }}
                  />
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#999', padding: '4px 4px 0' }}>
            <span>{data.dailySpend[0]?.day?.slice(5)}</span>
            <span>{data.dailySpend[data.dailySpend.length - 1]?.day?.slice(5)}</span>
          </div>
        </div>
      )}

      {/* Per-model breakdown */}
      <h3 style={{ margin: '0 0 12px', fontSize: '0.95rem', fontWeight: 600 }}>Cost by Model</h3>
      {!data || data.byModel.length === 0 ? (
        <p style={{ color: '#888', fontSize: '0.875rem' }}>No model calls in this period.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(23,42,58,0.1)', textAlign: 'left' }}>
                <th style={{ padding: '8px 12px' }}>Model</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Calls</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Input Tokens</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Output Tokens</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Avg Latency</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Total Cost</th>
              </tr>
            </thead>
            <tbody>
              {data.byModel.map((m) => (
                <tr key={m.modelId} style={{ borderBottom: '1px solid rgba(23,42,58,0.05)' }}>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: MODEL_COLORS[m.modelId] ?? '#ccc', flexShrink: 0 }} />
                      <span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{m.modelId}</span>
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{m.callCount ?? 0}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace' }}>{fmtTokens(m.totalInputTokens)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace' }}>{fmtTokens(m.totalOutputTokens)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{fmtMs(m.avgDurationMs)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{fmt(m.totalCostCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid rgba(23,42,58,0.12)' }}>
                <td style={{ padding: '10px 12px', fontWeight: 700 }} colSpan={5}>Total ({days}d)</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                  {fmt(data.byModel.reduce((s, m) => s + (m.totalCostCents ?? 0), 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}
