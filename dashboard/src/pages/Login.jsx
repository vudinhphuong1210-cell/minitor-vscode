import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL || '';

export default function Login() {
  const [email, setEmail]   = useState('admin@edu.local');
  const [pass, setPass]     = useState('');
  const [error, setError]   = useState('');
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const res  = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      localStorage.setItem('edu_token', data.token);
      localStorage.setItem('edu_email', data.user.email);
      navigate('/');
    } catch (err) {
      setError(err.message);
    }
  }

  const s = {
    wrap: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a' },
    card: { background: '#1e293b', padding: 40, borderRadius: 12, width: 360 },
    title: { fontSize: 22, fontWeight: 700, color: '#38bdf8', marginBottom: 24, textAlign: 'center' },
    label: { display: 'block', marginBottom: 4, fontSize: 13, color: '#94a3b8' },
    input: { width: '100%', padding: '10px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0', fontSize: 14, marginBottom: 16 },
    btn: { width: '100%', padding: '12px', background: '#0ea5e9', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 600, fontSize: 15, cursor: 'pointer' },
    err: { color: '#f87171', fontSize: 13, marginBottom: 12 },
  };

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={s.title}>🎓 EDU Monitor</div>
        <form onSubmit={handleSubmit}>
          {error && <div style={s.err}>{error}</div>}
          <label style={s.label}>Email</label>
          <input style={s.input} type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          <label style={s.label}>Mật khẩu</label>
          <input style={s.input} type="password" value={pass} onChange={e => setPass(e.target.value)} required />
          <button style={s.btn} type="submit">Đăng nhập</button>
        </form>
      </div>
    </div>
  );
}
