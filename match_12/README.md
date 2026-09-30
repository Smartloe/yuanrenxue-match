# 猿人学第12题 —— 入门级js

## 状态
✅ 已通关

- 本会话提交回执：`{"result":"success","created":true,"code":2,"exp":70}`
- 答案/合计：`26542256`

## 机制
GET /api/question/12?page=N&pageSize=10&kw=&m=<base64("yuanrenxue"+页码)>

## 解法要点
m 就是把 "yuanrenxue"+页码 做 base64

## 运行
```bash
node main.js
```

> 会话复用：`config/session.json`（已登录账号 陈希瑞）。
