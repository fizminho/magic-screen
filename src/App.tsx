export default function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Magic Folio home">
          <span className="brand-mark" aria-hidden="true">M</span>
          <span>MAGIC <span className="brand-light">FOLIO</span><small>PERSONAL PORTFOLIO INTELLIGENCE</small></span>
        </a>
        <span className="market-pill">US · BURSA MALAYSIA</span>
      </header>
      <main className="content">
        <section className="page-heading">
          <span className="eyebrow"><span className="eyebrow-line" /> YOUR PORTFOLIO, CLEARER</span>
          <h1>Invest with <em>clarity.</em></h1>
          <p className="intro">Your personal portfolio workspace is being prepared.</p>
        </section>
        <section className="empty-state" aria-live="polite">
          <b>Magic Folio is getting a fresh start.</b>
          <span>Portfolio tools and secure passkey access will appear here soon.</span>
        </section>
      </main>
      <footer className="content"><span>MAGIC FOLIO</span><span>Research and education only. Not investment advice.</span></footer>
    </div>
  );
}
