import { useState } from 'react'
import { Link, Route, Switch } from 'wouter'
import { Costs } from './pages/Costs'
import { DiffReview } from './pages/DiffReview'
import { Login } from './pages/Login'
import { Overview } from './pages/Overview'

const navItems = [
  { href: '/', label: 'Overview' },
  { href: '/costs', label: 'Costs' },
  { href: '/diffs', label: 'Diff Review' },
]

export function App() {
  const [authed, setAuthed] = useState(() => !!localStorage.getItem('olay_token'))

  function handleLogout() {
    localStorage.removeItem('olay_token')
    setAuthed(false)
  }

  if (!authed) {
    return <Login onLogin={() => setAuthed(true)} />
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">OrchestraLay</p>
          <h1>AI orchestration with explicit cost and diff control.</h1>
        </div>
        <nav className="nav">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="nav-link">
              {item.label}
            </Link>
          ))}
          <button
            onClick={handleLogout}
            style={{
              padding: '10px 16px', borderRadius: 999, border: 'none',
              background: 'rgba(23,42,58,0.08)', color: '#172a3a',
              cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500,
            }}
          >
            Sign out
          </button>
        </nav>
      </header>

      <main className="page-shell">
        <Switch>
          <Route path="/" component={Overview} />
          <Route path="/costs" component={Costs} />
          <Route path="/diffs" component={DiffReview} />
        </Switch>
      </main>
    </div>
  )
}
