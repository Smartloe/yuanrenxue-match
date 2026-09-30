# 猿人学第19题 —— 乌拉乌拉乌拉

## 状态
✅ 已通关

- 本会话提交回执：`{"result":"success","created":true,"code":2,"exp":81}`
- 答案/合计：`25641420`

## 机制
GET /api/question/19?page=N，第5页 UA 必须为 yuanrenxue

## 解法要点
服务端校验 TLS/JA3 指纹：Node/curl 一律 token failed，必须借真实浏览器的网络栈取数

## 运行
```bash
node main.js
```

> 会话复用：`config/session.json`（已登录账号 陈希瑞）。
