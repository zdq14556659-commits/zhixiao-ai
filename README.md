# 智销AI (Smart Sales AI)

> 面向全屋定制家具行业的AI驱动销售赋能与客户关系管理系统

## 系统概述

智销AI 是一款专为全屋定制家具行业（工厂/门店）设计的AI销售CRM系统。通过电话/微信/会议等全场景沟通数据自动采集、AI智能分析，帮助销售团队提升转化率、帮助管理者精准诊断业绩瓶颈。

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| **前端** | Vue 3 + Element Plus + Vite + TypeScript | 响应式Web管理端 |
| **后端** | Java Spring Boot 3.2 + Spring Security + JPA | RESTful API |
| **数据库** | MySQL 8 | 关系型数据存储 |
| **缓存** | Redis 7 | 会话缓存、热点数据 |
| **对象存储** | MinIO (S3兼容) | 录音文件存储 |
| **消息队列** | RabbitMQ | 异步任务（录音转写） |
| **AI引擎** | 模拟服务（可替换为阿里云ASR/通义千问） | 语音转写、NLP分析 |
| **容器化** | Docker + Docker Compose | 一键部署 |

## 项目结构

```
zhixiao-ai/
├── backend/                           # Spring Boot 后端
│   ├── zhixiao-common/               # 公共模块（工具、异常、响应）
│   ├── zhixiao-auth/                 # 认证授权（JWT）
│   ├── zhixiao-user/                 # 用户管理
│   ├── zhixiao-customer/             # 客户管理（360视图）
│   ├── zhixiao-sales/                # 销售漏斗
│   ├── zhixiao-recording/            # 录音管理
│   ├── zhixiao-asr/                  # 语音转写
│   ├── zhixiao-ai/                   # AI分析引擎
│   ├── zhixiao-report/               # 数据报表
│   └── zhixiao-gateway/              # 应用入口
├── frontend/                          # Vue3 前端
│   ├── src/views/login/              # 登录
│   ├── src/views/dashboard/          # 仪表盘
│   ├── src/views/customer/           # 客户管理（列表+详情360）
│   ├── src/views/sales/              # 销售漏斗（商机+订单）
│   ├── src/views/recording/          # 录音管理
│   ├── src/views/transcription/      # 转写记录
│   ├── src/views/ai/                 # AI分析看板
│   └── src/views/system/             # 系统设置（用户/角色/知识库）
├── db/
│   ├── init.sql                      # 数据库建表脚本
│   └── seed.sql                      # 测试种子数据
├── docker-compose.yml                # Docker编排
├── start-dev.sh                      # 开发启动脚本
└── README.md                         # 本文件
```

## 快速启动（开发环境）

### 前置条件

- Docker Desktop (4.0+)
- Node.js 18+
- JDK 17 (可选，用于本地编译)

### 方式一：Docker Compose 一键启动

```bash
# 在项目根目录执行
docker compose up -d
```

这将启动所有服务：
- 前端 http://localhost:3000
- 后端 http://localhost:8080
- Swagger http://localhost:8080/swagger-ui.html
- MinIO控制台 http://localhost:9001
- RabbitMQ管理 http://localhost:15672

### 方式二：本地开发模式

```bash
# 1. 启动依赖服务
docker compose up -d mysql redis minio rabbitmq

# 2. 启动后端（需要JDK 17 + Maven）
cd backend
mvn clean install -DskipTests
mvn spring-boot:run -pl zhixiao-gateway

# 3. 启动前端（新开终端）
cd frontend
npm install
npm run dev
```

## 默认测试账号

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | admin123 | 超级管理员 |
| manager | admin123 | 销售经理 |
| sales01 | admin123 | 销售人员 |
| sales02 | admin123 | 销售人员 |

## 核心功能模块

### 1. 客户管理
- 客户360视图：自动关联所有沟通记录、录音、文件、订单
- 客户列表：多维筛选、批量操作、意向评级
- 线索管理：线索导入、分配、跟进、转化
- 联系人管理：多联系人，标注决策人

### 2. 销售漏斗
- 商机看板：可视化拖拽式阶段流转
- 转化率分析：各阶段转化数据
- 订单管理：订单全生命周期

### 3. 录音管理
- 录音上传：支持电话/微信/面谈录音
- 语音转写（ASR）：自动转写为文字
- 分段展示：说话人分离，逐句对照

### 4. AI分析引擎
- 意图识别：自动识别客户询价/对比/投诉等意图
- 情绪分析：判断客户情绪状态
- 话术评分：对比优秀销售给出改进建议
- 沟通摘要：AI自动生成通话摘要

### 5. 数据报表
- 团队战力图：个人/团队业绩对比
- 销售漏斗：各阶段转化率分析
- 丢单归因：丢单原因统计分析

### 6. 系统管理
- 用户管理：员工账号管理
- 角色权限：基于RBAC的权限控制
- 知识库：产品资料、话术模板、常见问答

## API文档

启动后端后，访问 Swagger UI 查看完整的 API 文档：

http://localhost:8080/swagger-ui.html

## 扩展与集成

### 对接柜柜软件（规划中）
- 同步客户设计方案、拆单记录
- CRM中直接调用柜柜三体人生成方案
- 报价单自动关联订单

### 对接三方服务（开发可配置）
- 阿里云智能语音交互（ASR）
- 通义千问/GPT大模型（NLP分析）
- 企查查/天眼查（企业线索）
- 企业微信/个人微信（聊天记录）

## 注意事项

- 当前 ASR 和 AI 分析模块使用**模拟服务**，实际使用时需替换为真实API密钥
- 录音文件通过 MinIO 对象存储，生产环境可切换为阿里云OSS/腾讯云COS
- 项目采用MySQL 8，默认端口3307（避免与本地MySQL冲突）
- 如需私有化部署，参考 Dockerfile 构建镜像

## 开发计划

详见 [系统开发计划书](../AI_CRM商业计划书.md)

## License

内部项目 - 武汉亿量科技有限公司(对标)
