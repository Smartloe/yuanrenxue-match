# 猿人学第4题 —— 雪碧图、样式干扰

## 状态
✅ 已通关

- 本会话提交回执：`{"result":"success","created":true,"code":2,"exp":107}`
- 答案/合计：`26132371`

## 机制
GET /api/question/4?page=N 返回 {key,value,info}；info 里每个 <td> 塞多张 base64 PNG 数字字形，class=md5(base64(key+value)) 的被 display:none

## 解法要点
真实显示顺序 =（行内槽位×8.5px + left）排序；字形用模板匹配识别（docs/templates.json + config/labels.json）

## 运行
```bash
node main.js
```

> 会话复用：`config/session.json`（已登录账号 陈希瑞）。
