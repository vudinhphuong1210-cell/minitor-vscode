# EDU Monitor – Local Docker Setup

Hệ thống giám sát hành vi lập trình trong IDE, hỗ trợ 500 sinh viên đồng thời.

## Kiến trúc

```
┌─────────────────────────────────────────────────────────┐
│                    VS Code Extension                     │
│  (Keystroke, Paste, Cursor Jump, AI Accept events)      │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS batch (30-60s)
                       ▼
┌──────────────────────────────────────────────────────────┐
│                    Nginx (port 80)                        │
│              Reverse Proxy + Rate Limit                   │
└──────┬───────────────────────────────────┬───────────────┘
       │                                   │
       ▼                                   ▼
┌─────────────┐                   ┌────────────────┐
│  API Server │                   │   Dashboard    │
│  (Node.js)  │                   │   (React/Vite) │
│  port 3000  │                   │   port 5173    │
└──────┬──────┘                   └────────────────┘
       │
       ├── PostgreSQL (events, scores, gates)
       ├── Redis (quota, session cache)
       └── RabbitMQ → Worker (async scoring)
```

## Tính năng

| Module | Mô tả |
|--------|-------|
| **Keystroke Dynamics** | Tính Keypress Entropy từ Inter-Keystroke Interval |
| **Code Jump Magnitude** | Phát hiện paste lớn qua cursor jump |
| **Modification Ratio** | Tỷ lệ sửa đổi code AI suggest |
| **Explanation Gate** | Chặn paste + LLM-as-Judge vấn đáp |
| **AI Gateway** | Proxy OpenAI + Socratic Nudging + Token Quota |
| **Chain Hash** | Bằng chứng toàn vẹn kiểu blockchain |
| **Dashboard** | Giảng viên xem điểm nghi vấn real-time |

## Khởi động nhanh

### 1. Chuẩn bị

```bash
cd edu-monitor
cp .env.example .env
# Chỉnh sửa .env, đặc biệt là OPENAI_API_KEY nếu muốn dùng AI thật
```

### 2. Chạy toàn bộ stack

```bash
docker compose up --build
```

### 3. Truy cập

| Service | URL |
|---------|-----|
| Dashboard (giảng viên) | http://localhost |
| API | http://localhost/api |
| RabbitMQ Management | http://localhost:15672 |
| API trực tiếp | http://localhost:3000 |

### 4. Tài khoản mặc định

- Email: `admin@edu.local`
- Cần đăng ký mật khẩu qua `POST /api/auth/register` trước

## API Endpoints

### Auth
```
POST /api/auth/register   – Đăng ký
POST /api/auth/login      – Đăng nhập → JWT token
```

### Events (VS Code Extension gọi)
```
POST /api/events/batch    – Gửi batch event log
GET  /api/events/session/:id – Lấy events của session
```

### Explanation Gate
```
POST /api/gate/challenge  – Tạo câu hỏi cho đoạn code bị chặn
POST /api/gate/answer     – Sinh viên trả lời, LLM chấm điểm
```

### AI Gateway
```
POST /api/gateway/chat    – Proxy đến OpenAI với Socratic Nudging
GET  /api/gateway/quota   – Xem token quota còn lại
```

### Dashboard (instructor only)
```
GET /api/dashboard/students           – Danh sách + điểm nghi vấn
GET /api/dashboard/students/:id       – Chi tiết sinh viên
GET /api/dashboard/sessions/:id/integrity – Kiểm tra chain hash
```

## Cấu trúc thư mục

```
edu-monitor/
├── docker-compose.yml
├── .env.example
├── api/                    # Node.js API + Worker
│   ├── src/
│   │   ├── index.js        # API Server
│   │   ├── worker.js       # Async event processor
│   │   ├── lib/            # db, redis, rabbitmq, chainHash
│   │   ├── middleware/     # auth JWT
│   │   └── routes/         # auth, events, gate, gateway, dashboard
│   ├── Dockerfile
│   └── Dockerfile.worker
├── dashboard/              # React dashboard cho giảng viên
│   └── src/pages/
├── db/init/                # SQL schema tự động chạy khi khởi tạo
├── nginx/                  # Reverse proxy config
└── rabbitmq/               # RabbitMQ config
```

## Bước tiếp theo

- [ ] VS Code Extension (gửi keystroke events về API)
- [ ] WebSocket để dashboard cập nhật real-time
- [ ] Biểu đồ timeline keystroke entropy
- [ ] Export báo cáo PDF cho giảng viên
- [ ] HTTPS với self-signed cert cho local
