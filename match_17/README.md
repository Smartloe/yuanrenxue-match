# 猿人学第17题 —— 天杀的Http2.0

## 状态
✅ 已通关

- 本会话提交回执：`{"result":"success","created":true,"code":2,"exp":70}`
- 答案/合计：`27451582`

## 机制
GET /api/question/17?page=N（服务端校验 HTTP/2）

## 解法要点
Node 的 fetch(undici) 默认协商 h2，直接请求即可

## 运行
```bash
node main.js
```

> 会话复用：`config/session.json`（已登录账号 陈希瑞）。
