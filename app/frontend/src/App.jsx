import { useEffect, useState } from 'react';

const API = '/api/messages';

export default function App() {
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState('');
  const [error, setError] = useState(null);

  async function load() {
    try {
      const res = await fetch(API);
      setMessages(await res.json());
    } catch (e) {
      setError('Failed to reach backend API');
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (!body.trim()) return;
    await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    setBody('');
    load();
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 640, margin: '40px auto', padding: 16 }}>
      <h1>3-Tier App on GKE</h1>
      <p style={{ color: '#666' }}>Frontend → Backend API → PostgreSQL</p>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      <form onSubmit={submit} style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a message…"
          style={{ flex: 1, padding: 8 }}
        />
        <button type="submit" style={{ padding: '8px 16px' }}>Send</button>
      </form>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {messages.map((m) => (
          <li key={m.id} style={{ borderBottom: '1px solid #eee', padding: '8px 0' }}>
            <strong>#{m.id}</strong> {m.body}
            <span style={{ color: '#999', marginLeft: 8, fontSize: 12 }}>
              {new Date(m.created_at).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
