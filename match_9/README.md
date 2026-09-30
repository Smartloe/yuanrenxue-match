# 猿人学第9题 —— js 混淆 - 动态cookie 2

## 状态
✅ 已通关

- 本会话提交回执：`{"result":"success","created":true,"code":2,"exp":176}`
- 答案/合计：`25952202`

## 机制
首次请求返回的不是 JSON 而是 JS，eval 后刷新 m；页面 reload 后再请求才有数据

## 解法要点
在页面上下文循环：拿到 JSON 就用，拿到 JS 就 eval 刷新 m 再请求；第5页切 UA=yuanrenxue

## 运行
```bash
node main.js
```

> 会话复用：`config/session.json`（已登录账号 陈希瑞）。
