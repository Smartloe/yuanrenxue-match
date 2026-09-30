/**
 * 对照站点题目清单与本地记录，找出缺少 README.md / main.js / result.json 的题目
 * 用法：node tools_audit_records.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'match_23/config/session.json'), 'utf8'));

(async () => {
  let all = [];
  for (let p = 1; p <= 6; p++) {
    const j = await (await fetch('https://match.yuanrenxue.cn/api/topics?page=' + p, {
      headers: { cookie: cfg.cookie, 'user-agent': 'yuanrenxue', 'x-requested-with': 'XMLHttpRequest', accept: 'application/json' },
    })).json();
    if (!j.results || !j.results.length) break;
    all = all.concat(j.results);
    if (p >= j.num_pages) break;
  }
  all.sort((a, b) => String(a.href).localeCompare(String(b.href), undefined, { numeric: true }));
  fs.writeFileSync(path.join(ROOT, '_shared/audit/site_topics_all.json'), JSON.stringify(all, null, 2));

  console.log('站点共 ' + all.length + ' 题，共 ' + all.filter((r) => r.finish).length + ' 题已通关\n');
  const gz = all.filter((r) => String(r.href).startsWith('guide'));
  const normal = all.filter((r) => !String(r.href).startsWith('guide'));
  const missing = [];
  const show = (list, tag) => {
    console.log('=== ' + tag + ' ===');
    for (const r of list) {
      const dir = path.join(ROOT, 'match_' + r.href);
      const has = fs.existsSync(dir);
      const files = has ? fs.readdirSync(dir) : [];
      const rec = ['README.md', 'main.js', 'result.json'].filter((f) => files.includes(f));
      const lack = ['README.md', 'main.js', 'result.json'].filter((f) => !files.includes(f));
      if (lack.length) missing.push({ href: r.href, title: r.title, difficulty: r.difficulty, finish: r.finish, lack });
      console.log('  href=' + String(r.href).padEnd(8) + ' 难度' + r.difficulty + ' finish=' + (r.finish ? 'Y' : 'N') +
        ' 目录=' + (has ? '有' : '无') + ' 已有[' + (rec.join(',') || '-') + '] 缺[' + (lack.join(',') || '-') + ']  ' + r.title);
    }
  };
  show(normal, '普通题（' + normal.length + '）');
  show(gz, '新手试炼（' + gz.length + '）');

  console.log('\n=== 需要补记录的题目（缺 README/main.js/result.json 任一） ===');
  missing.forEach((m) => console.log('  Q' + m.href + ' ' + m.title + '  缺: ' + m.lack.join(', ') + (m.finish ? '（站点已通关）' : '（站点未通关）')));
  fs.writeFileSync(path.join(ROOT, '_shared/audit/missing_records.json'), JSON.stringify(missing, null, 2));
})();
