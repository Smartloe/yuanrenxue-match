# 猿人学第13题 —— 入门级cookie

## 状态
✅ 已通关

- 本会话提交回执：`{"result":"success","created":true,"code":2,"exp":70}`
- 答案/合计：`25438843`

## 机制
先 GET /api2/13 拿到一段 JS，eval 后写入 document.cookie：yuanrenxue_cookie=<时间戳>|<随机串>；再带该 cookie 请求 /api/question/13

## 解法要点
cookie 带时间戳会过期，必须每页重新取一次

## 运行
```bash
node main.js
```

> 会话复用：`config/session.json`（已登录账号 陈希瑞）。
