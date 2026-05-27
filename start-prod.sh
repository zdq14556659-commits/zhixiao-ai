#!/bin/bash

# 智销AI 生产模式启动脚本 (Unix/Git Bash)
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "========================================"
echo "  智销AI 生产模式启动脚本"
echo "========================================"
echo ""

# Step 1: Install backend dependencies
echo "[1/3] 安装后端依赖..."
cd "$PROJECT_DIR/mock-server"
npm install --silent 2>/dev/null || echo "[WARN] npm install 完成（或已有依赖）"

# Step 2: Build frontend
echo "[2/3] 构建前端..."
cd "$PROJECT_DIR/frontend"
npx vite build

# Step 3: Start backend
echo "[3/3] 启动后端服务..."
cd "$PROJECT_DIR/mock-server"

echo ""
echo "========================================"
echo "  启动完成！"
echo ""
echo "  访问地址: http://localhost:8080"
echo ""
echo "  登录账号: admin / admin123"
echo "========================================"
echo ""

node server.mjs
