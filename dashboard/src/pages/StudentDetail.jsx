import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL || '';

export default function StudentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/dashboard/students/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('edu_token')}` },
    }).then(r => r.json()).then(setData);
  }, [id]);

  const s = {
    back: { background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', fontSize: 14, marginBottom: 16 },
    card: { background: '#1e293b', borderRadius: 10, padding: 20, marginBottom: 20 },
    h2: { fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 12 },
    row: { display: 'flex', gap: 32, flexWrap: 'wrap' },
    stat: { flex: 1, minWidth: 120 },
    label: { fontSize: 12, color: '#64748b', marginBottom: 4 },
    value: { fontSize: 22, fontWeight: 700, color: '#38bdf8' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
    th: { textAlign: 'left', padding: '8px 12px', color: '#64748b', borderBottom: '1px solid #334155' },
    td: { padding: '8px 12px', borderBottom: '1px solid #1e293b' },
  };

  if (!data) return <p style={{ color: '#94a3b8' }}>Đang tải...</p>;

  const latest = data.scores[0];
  const toNum = (v) => (v != null ? parseFloat(v) : null);

  return (
    <>
      <button style={s.back} onClick={() => navigate('/')}>← Quay lại</button>
      <div style={s.card}>
        <h2 style={s.h2}>{data.user.display_name} – {data.user.email}</h2>
        <div style={s.row}>
          <div style={s.stat}>
            <div style={s.label}>AI Level</div>
            <div style={s.value}>L{data.user.ai_level}</div>
          </div>
          <div style={s.stat}>
            <div style={s.label}>Suspicion Score</div>
            <div style={{ ...s.value, color: latest?.flagged ? '#ef4444' : '#22c55e' }}>
              {latest ? `${(toNum(latest.composite_score) * 100).toFixed(0)}%` : 'N/A'}
            </div>
          </div>
          <div style={s.stat}>
            <div style={s.label}>Keypress Entropy</div>
            <div style={s.value}>{latest ? toNum(latest.keypress_entropy)?.toFixed(3) : '—'}</div>
          </div>
          <div style={s.stat}>
            <div style={s.label}>Modification Ratio</div>
            <div style={s.value}>{latest ? toNum(latest.modification_ratio)?.toFixed(2) : '—'}</div>
          </div>
        </div>
      </div>

      <div style={s.card}>
        <h2 style={s.h2}>Explanation Gate – Lịch sử vấn đáp</h2>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Câu hỏi</th>
              <th style={s.th}>Điểm</th>
              <th style={s.th}>Kết quả</th>
              <th style={s.th}>Thời gian</th>
            </tr>
          </thead>
          <tbody>
            {data.gates.map(g => (
              <tr key={g.id}>
                <td style={s.td}>{g.question}</td>
                <td style={s.td}>{g.judge_score != null ? (toNum(g.judge_score) * 100).toFixed(0) + '%' : '—'}</td>
                <td style={{ ...s.td, color: g.passed ? '#22c55e' : g.passed === false ? '#ef4444' : '#64748b' }}>
                  {g.passed === true ? '✅ Đạt' : g.passed === false ? '❌ Không đạt' : 'Chờ'}
                </td>
                <td style={{ ...s.td, color: '#64748b' }}>{new Date(g.created_at).toLocaleString('vi-VN')}</td>
              </tr>
            ))}
            {!data.gates.length && <tr><td colSpan={4} style={{ ...s.td, color: '#475569' }}>Chưa có dữ liệu</td></tr>}
          </tbody>
        </table>
      </div>

      <div style={s.card}>
        <h2 style={s.h2}>AI Gateway – Lịch sử sử dụng</h2>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Model</th>
              <th style={s.th}>Tokens</th>
              <th style={s.th}>Socratic</th>
              <th style={s.th}>Thời gian</th>
            </tr>
          </thead>
          <tbody>
            {data.ai_usage.map((a, i) => (
              <tr key={i}>
                <td style={s.td}>{a.model}</td>
                <td style={s.td}>{a.total_tokens}</td>
                <td style={{ ...s.td, color: a.socratic_injected ? '#22c55e' : '#64748b' }}>
                  {a.socratic_injected ? '✅' : '—'}
                </td>
                <td style={{ ...s.td, color: '#64748b' }}>{new Date(a.created_at).toLocaleString('vi-VN')}</td>
              </tr>
            ))}
            {!data.ai_usage.length && <tr><td colSpan={4} style={{ ...s.td, color: '#475569' }}>Chưa có dữ liệu</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
