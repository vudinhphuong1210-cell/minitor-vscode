import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import StudentList from './pages/StudentList';
import StudentDetail from './pages/StudentDetail';

const s = {
  nav: { background: '#1e293b', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 16 },
  title: { fontWeight: 700, fontSize: 18, color: '#38bdf8' },
  main: { padding: 24 },
};

function Layout({ children }) {
  return (
    <>
      <nav style={s.nav}>
        <span style={s.title}>🎓 EDU Monitor</span>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: '#94a3b8' }}>
          {localStorage.getItem('edu_email') || ''}
        </span>
        <button
          onClick={() => { localStorage.clear(); window.location.href = '/login'; }}
          style={{ background: 'none', border: '1px solid #475569', color: '#94a3b8', padding: '4px 12px', borderRadius: 6, cursor: 'pointer' }}
        >
          Đăng xuất
        </button>
      </nav>
      <main style={s.main}>{children}</main>
    </>
  );
}

function PrivateRoute({ children }) {
  return localStorage.getItem('edu_token') ? children : <Navigate to="/login" />;
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<PrivateRoute><Layout><StudentList /></Layout></PrivateRoute>} />
      <Route path="/students/:id" element={<PrivateRoute><Layout><StudentDetail /></Layout></PrivateRoute>} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  </BrowserRouter>
);
