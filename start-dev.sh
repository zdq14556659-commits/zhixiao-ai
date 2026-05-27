#!/bin/bash
# ============================================
# 智销AI - 开发环境启动脚本
# ============================================

echo "============================================"
echo "  智销AI (Smart Sales AI) - 开发环境启动"
echo "============================================"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] 未找到 Node.js，请先安装 Node.js 18+"
    exit 1
fi

# 检查 Docker
if ! command -v docker &> /dev/null; then
    echo "[ERROR] 未找到 Docker，请先安装 Docker Desktop"
    exit 1
fi

# 检查 Docker Compose
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "[ERROR] 未找到 Docker Compose"
    exit 1
fi

echo "[1/4] 启动基础设施 (MySQL + Redis + MinIO + RabbitMQ)..."
docker compose up -d mysql redis minio rabbitmq
echo "  ✅ 基础设施启动中（首次启动需等待MySQL初始化建表）"

echo ""
echo "[2/4] 等待 MySQL 就绪..."
sleep 15
echo "  ✅ MySQL 就绪"

echo ""
echo "[3/4] 构建并启动后端服务..."
docker compose build backend
docker compose up -d backend
echo "  ✅ 后端服务启动中 (端口 8080)"

echo ""
echo "[4/4] 启动前端开发服务器..."
cd frontend
npm install --silent 2>/dev/null
echo "  ✅ 前端依赖安装完成"
echo ""
echo "============================================"
echo "  启动完成！访问以下地址："
echo "============================================"
echo ""
echo "  前端页面:  http://localhost:3000"
echo "  后端 API:  http://localhost:8080"
echo "  Swagger:   http://localhost:8080/swagger-ui.html"
echo "  MinIO 控制台: http://localhost:9001 (zhixiao/zhixiao123)"
echo "  RabbitMQ 管理: http://localhost:15672 (zhixiao/zhixiao123)"
echo ""
echo "  默认管理员账号: admin  /  admin123"
echo "  销售经理账号:   manager / admin123"
echo "  销售顾问账号:   sales01 / admin123"
echo ""
echo "  按 Ctrl+C 停止"
echo "============================================"

# 启动前端开发服务器
npm run dev
