# 猿人学第15题 —— 备周则意怠-常见则不疑

## 状态
✅ 已通关

- 本会话提交回执：`{"result":"success","created":true,"code":2,"exp":95}`
- 答案/合计：`24736117`

## 机制
main.wasm 的 encode(t1,t2) 生成 m=<encode>|t1|t2

## 解法要点
Node 原生 WebAssembly 直接实例化，无需浏览器

## 运行
```bash
node main.js
```

> 会话复用：`config/session.json`（已登录账号 陈希瑞）。
