export default function Home() {
  return (
    <main style={{ fontFamily: 'monospace', padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h1>GitHub Access Automation</h1>
      <p>Automated repository access provisioning for boilerplate sales.</p>

      <h2>Status</h2>
      <ul>
        <li>
          Webhook Endpoint: <code>/api/webhooks/polar</code>
        </li>
        <li>
          OAuth Endpoint: <code>/api/auth/github</code>
        </li>
      </ul>

      <h2>How It Works</h2>
      <ol>
        <li>Customer clicks Buy</li>
        <li>GitHub OAuth authenticates user</li>
        <li>Redirect to Polar checkout</li>
        <li>Payment completes</li>
        <li>Webhook fires → Customer added to private repo</li>
        <li>Welcome email sent with access instructions</li>
      </ol>

      <h2>Documentation</h2>
      <ul>
        <li>README.md - Setup and API overview</li>
        <li>SETUP.md - Detailed configuration guide</li>
        <li>SECURITY.md - Security architecture</li>
        <li>TESTING.md - Testing instructions</li>
      </ul>

      <hr />
      <p style={{ color: '#666', fontSize: '0.875rem' }}>GitHub Access Automation Tool</p>
    </main>
  );
}
