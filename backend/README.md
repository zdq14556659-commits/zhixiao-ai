# 智销AI 后端

本后端使用 Node.js 内置模块实现，无需安装 npm 依赖。它提供 Web 端和小程序端共享的数据 API，并代理高德 WebService 逆地理编码。

## 启动

```bash
node backend/server.js
```

默认地址：

```text
http://localhost:8787
```

Web 端可直接访问：

```text
http://localhost:8787/index.html
```

## 重要接口

- `GET /api/state`：Web 端状态
- `GET /api/state?client=mini`：小程序状态
- `PUT /api/state`：保存完整状态
- `POST /api/customers`：新增客户
- `PATCH /api/customers/:id`：更新客户
- `POST /api/customers/:id/follow`：新增跟进
- `GET /api/dashboard`：按日期、权限和管理范围返回经营指标、漏斗、趋势、排名、行业分析和风险客户
- `GET /api/targets?month=YYYY-MM`：查询当前权限范围内的月度目标
- `POST /api/targets`：主管以上维护权限范围内的公司、战区、单位或销售目标
- `POST /api/visits`：新增地推打卡
- `GET /api/amap/regeo?longitude=120.1551&latitude=30.2741`：高德逆地理编码代理

## 部署提醒

小程序正式版不能请求普通 HTTP，需要把后端部署到 HTTPS 域名，并在微信小程序后台配置 request 合法域名。

生产环境必须把 `DATA_DIR` 和 `UPLOAD_DIR` 指向持久化磁盘，或迁移至数据库与对象存储，避免重新部署时丢失员工、客户、目标和地推图片。
