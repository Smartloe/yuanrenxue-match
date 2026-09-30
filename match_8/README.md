# 猿人学第8题 —— 验证码 - 图文点选

## 状态
✅ 已通关

- 本会话提交回执：`{"result":"success","created":true,"code":2,"exp":107}`
- 答案/合计：`25935893`

## 机制
GET /api2/8 取 3x3 字符图与 targets；POST /api2/8 {captcha_id, clicks} 点选通过后才解锁 /api/question/8

## 解法要点
每页数据都要重新过一次验证码；点选坐标就是目标字符所在格子的中心

## 运行
```bash
node _shared/browser_pages.js --q 8 --submit
```

> 会话复用：`config/session.json`（已登录账号 陈希瑞）。
