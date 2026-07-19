# XUANOS 种子用户身份与登录指南

## 1. 范围

本文档是当前种子测试身份契约，覆盖早期 MVP 文档中的“暂不做登录”边界。

- 仅支持中国大陆 `+86` 手机号。
- 用户输入 11 位手机号，服务端保存为 E.164。
- 仅管理员邀请，不开放公开注册。
- 用户可使用短信验证码或自行设置的密码登录。
- 两种登录方式都创建同一种服务端 Cookie Session。

## 2. 本地配置

复制 `backend/.env.example` 为本地 `backend/.env`，不要提交该文件。

```dotenv
XUANOS_APP_ENV=development
XUANOS_SMS_PROVIDER=fake
XUANOS_FAKE_SMS_OUTBOX_PATH=data/fake_sms_outbox.jsonl
XUANOS_SESSION_COOKIE_NAME=xuanos_session
XUANOS_DEMO_RESET_ENABLED=false
```

生产或共享环境不得使用 `fake`。生产环境还必须设置独立的
`XUANOS_SMS_CODE_HMAC_KEY`，并通过真实短信 Provider 发送验证码。

## 3. 邀请用户

在 `backend/` 下执行：

```powershell
.\.venv\Scripts\python -m app.cli.users invite `
  --phone 13812345678 `
  --display-name "测试用户1"
```

管理员只提供手机号和显示名称，不设置用户密码。`list` 输出会将手机号
脱敏：

```powershell
.\.venv\Scripts\python -m app.cli.users list
```

## 4. 本地首次登录

1. 启动 FastAPI 和前端。
2. 登录页输入 11 位手机号并获取验证码。
3. 本地 Fake SMS 验证码写入 `backend/data/fake_sms_outbox.jsonl`。
4. 读取最后一条对应手机号且 `purpose=login` 的记录。
5. 输入六位验证码完成手机号验证。
6. 进入“我的系统”，可选择设置登录密码。

Fake outbox 含短时有效验证码，只能用于本机开发，不得提交、截图进入公开
报告或复制到工单。

## 5. 密码与重置

- 未设置密码时继续使用验证码登录。
- 密码登录失败统一显示“手机号或密码不正确”。
- 忘记密码使用 `purpose=reset_password` 的短信验证码。
- 登录验证码不能用于重置密码。
- 重置密码后该用户全部旧 Session 失效。
- 修改密码后除当前 Session 外的旧 Session 失效。

## 6. 用户管理

```powershell
.\.venv\Scripts\python -m app.cli.users disable --phone 13812345678
.\.venv\Scripts\python -m app.cli.users enable --phone 13812345678
.\.venv\Scripts\python -m app.cli.users reset-data --phone 13812345678
```

- `disable` 会立即撤销该用户全部 Session。
- `enable` 不会替用户设置或恢复密码。
- `reset-data` 只重置该用户的业务数据，保留身份、验证状态和密码哈希。

## 7. 安全检查

- 前端不得在 `localStorage`、`sessionStorage` 或 URL 保存 Session。
- 数据库只保存 Session token 哈希、验证码 HMAC 和 Argon2id 密码哈希。
- 日志与普通 API 响应不得出现验证码、密码、密码哈希或 Session token。
- Cookie 为 `HttpOnly`、`SameSite=Lax`、`Path=/`，生产环境启用 `Secure`。
- 所有业务资源继续按当前服务端用户身份隔离。
