# 猿人学第25题 —— 知名 - 当变量名"活"过来时

## 状态
✅ 已通关

- 本会话提交回执：`{"result":"success","created":true,"code":2,"exp":121}`
- 答案/合计：`26860148`

## 机制
页面内混淆 JS 生成 window.matchnumber（并带 token/now 参数）

## 解法要点
浏览器驱动翻页抓取

## 运行
```bash
node _shared/browser_pages.js --q 25 --submit
```

> 会话复用：`config/session.json`（已登录账号 陈希瑞）。
