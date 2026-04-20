import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL || '';

function badge(score) {
  if (score == null) return { label: 'N/A', color: '#475569' };
  if (score > 0.7)   return { label: '🔴 Cao', color: '#ef4444' };
  if (score > 0.4)   return { label: '🟡 Trung bình', color: '#f59e0b' };
  return               { label: '🟢 Thấp', color: '#22c55e' };
}

export default function StudentList() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading]   = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${API}/api/dashboard/students`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('edu_token')}` },
    })
      .then(r => r.json())
      .then(d => { setStudents(d.students || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const s = {
    h1: { fontSize: 20, fontWeight: 700, marginBottom: 20, color: '#f1f5f9' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
    th: { textAlign: 'left', padding: '10px 14px', background: '#1e293b', color: '#94a3b8', fontWeight: 600 },
    td: { padding: '10px 14px', borderBottom: '1px solid #1e293b', cursor: 'pointer' },
    row: { background: '#0f172a' },
  };

  if (loading) return <p style={{ color: '#94a3b8' }}>Đang tải...</p>;

  return (
    <>
      <h1 style={s.h1}>Danh sách sinh viên ({students.length})</h1>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>Tên</th>
            <th style={s.th}>Email</th>
            <th style={s.th}>AI Level</th>
            <th style={s.th}>Suspicion Score</th>
            <th style={s.th}>Cập nhật</th>
          </tr>
        </thead>
        <tbody>
          {students.map(st => {
            const b = badge(st.composite_score);
            return (
              <tr key={st.id} style={s.row} onClick={() => navigate(`/students/${st.id}`)}>
                <td style={s.td}>{st.display_name}</td>
                <td style={s.td}>{st.email}</td>
                <td style={s.td}>L{st.ai_level}</td>
                <td style={{ ...s.td, color: b.color, fontWeight: 600 }}>
                  {b.label} {st.composite_score != null ? `(${(parseFloat(st.composite_score) * 100).toFixed(0)}%)` : ''}
                </td>
                <td style={{ ...s.td, color: '#64748b', fontSize: 12 }}>
                  {st.computed_at ? new Date(st.computed_at).toLocaleString('vi-VN') : '—'}
                </td>
              </tr>
            );
          })}
          {!students.length && (
            <tr><td colSpan={5} style={{ ...s.td, color: '#475569', textAlign: 'center' }}>Chưa có dữ liệu</td></tr>
          )}
        </tbody>
      </table>
    </>
  );
}
