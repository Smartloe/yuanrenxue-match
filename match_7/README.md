# 猿人学第7题 —— 动态字体，随风漂移

## 状态
✅ 已通关

- 本会话提交回执：`{"result":"success","created":true,"code":2,"exp":137}`
- 答案/合计：`24990348`

## 机制
/api/question/7 返回 {woff(实为 TTF), data}，data 用 &#xXXXX; 实体表示，靠该页动态字体映射成真数字

## 解法要点
浏览器渲染 10 个码点 → 二值化归一化特征 → 与模板做匈牙利算法匹配（10 个码点必是 0-9 的一个排列）

## 运行
```bash
node main.js
```

> 会话复用：`config/session.json`（已登录账号 陈希瑞）。
