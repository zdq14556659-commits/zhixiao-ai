# 智销AI — 部署上线指南

## 快速启动（生产模式）

### Windows 用户

双击运行 `start-prod.bat`，或打开 CMD 执行：

```cmd
cd /d D:\新建文件夹\2026-05-21-task-3\zhixiao-ai
start-prod.bat
```

### Git Bash / Linux 用户

```bash
cd /d/新建文件夹/2026-05-21-task-3/zhixiao-ai
./start-prod.sh
```

### 手动启动

```bash
# 1. 构建前端
cd frontend
npx vite build

# 2. 启动后端（含前端静态文件服务）
cd ../mock-server
node server.mjs
```

## 访问地址

浏览器打开：**http://localhost:8080**

## 登录账号

| 账号 | 密码 | 角色 |
|------|------|------|
| admin | admin123 | 管理员 |
| manager | admin123 | 销售经理 |
| sales01 | admin123 | 销售顾问 |

## 生产架构

```
用户浏览器
    │
    ▼
http://localhost:8080
    │
    ├─ /api/* → Express 后端 API  ← SQLite (data.db)
    │
    └─ /*      → index.html (SPA)  ← frontend/dist/
```

- **单端口部署**：前端和后端都通过 8080 端口访问
- **数据持久化**：SQLite 数据库文件 `mock-server/data.db`
- **零依赖**：不需要 Docker、Java、MySQL，只要 Node.js 就能跑
- **文件存储**：录音文件存储在 `mock-server/uploads/`

## 数据维护

- 删除 `mock-server/data.db` 并重启服务，可重新初始化种子数据
- 录音文件上传目录：`mock-server/uploads/`

## 后续升级

- 数据库从 SQLite 切换到 MySQL：修改 server.mjs 中的数据库初始化逻辑
- 文件存储切换到 MinIO/OSS：替换 upload 中间件
- ASR/AI 从模拟切换真实服务：配置阿里云/通义千问 API
