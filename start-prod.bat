@echo off
chcp 65001 >nul
echo ========================================
echo   智销AI 生产模式启动脚本
echo ========================================
echo.

:: 获取当前目录（脚本所在目录）
set PROJECT_DIR=%~dp0
cd /d "%PROJECT_DIR%"

echo [1/3] 安装后端依赖...
cd /d "%PROJECT_DIR%mock-server"
call npm install --silent 2>nul
if %errorlevel% neq 0 (
    echo [WARN] npm install 可能有警告，继续执行
)

echo [2/3] 构建前端...
cd /d "%PROJECT_DIR%frontend"
npx vite build
if %errorlevel% neq 0 (
    echo [ERROR] 前端构建失败！
    pause
    exit /b 1
)

echo.
echo [3/3] 启动后端服务...
cd /d "%PROJECT_DIR%mock-server"
start "智销AI" cmd /c "node server.mjs & pause"

echo.
echo ========================================
echo   启动完成！
echo.
echo   访问地址: http://localhost:8080
echo.
echo   登录账号: admin / admin123
echo ========================================
echo.
echo 按任意键退出...
pause >nul
