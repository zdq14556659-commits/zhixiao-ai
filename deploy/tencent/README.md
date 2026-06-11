# 智销AI腾讯云部署

推荐服务器：腾讯云轻量应用服务器，Ubuntu 22.04 LTS，2核2G或以上。

## 数据目录

- 程序版本：`/opt/zhixiao-ai/releases/`
- 当前程序：`/opt/zhixiao-ai/current`
- 账号和客户数据：`/opt/zhixiao-ai/shared/data/`
- 地推图片：`/opt/zhixiao-ai/shared/uploads/`
- 每日备份：`/opt/zhixiao-ai/shared/backups/`

更新程序时只创建新的 release，不会覆盖 shared 目录。

## 部署

在本机 PowerShell 运行：

```powershell
.\deploy\tencent\deploy-tencent.ps1 `
  -Server "服务器公网IP" `
  -User "root" `
  -KeyPath "C:\路径\服务器密钥.pem" `
  -Domain "crm.example.com"
```

如果暂时没有域名，省略 `-Domain`，先通过服务器公网 IP 测试 Web。微信小程序正式版必须使用已备案的 HTTPS 域名。

## HTTPS

域名解析到服务器公网 IP 后，在服务器执行：

```bash
sudo /tmp/zhixiao-deploy/enable-https.sh crm.example.com your-email@example.com
```

然后把小程序 `PROD_API_BASE` 改为：

```js
const PROD_API_BASE = "https://crm.example.com/api";
```

并在微信小程序后台把 `https://crm.example.com` 配置为 request 和 uploadFile 合法域名。

## DeepSeek

服务器上的密钥文件是 `/etc/zhixiao-ai.env`：

```bash
sudo nano /etc/zhixiao-ai.env
sudo systemctl restart zhixiao-ai
```

不要把 API Key 提交到 Git 仓库。
