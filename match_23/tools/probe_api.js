const fs = require('fs');
const path = require('path');
const { makeToken } = require('../utils/crypto');
const session = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/session.json'), 'utf8'));
const UA = 'yuanrenxue';
const REFERER = 'https://match.yuanrenxue.cn/match/23';

(async () => {
  const t = await fetch('https://match.yuanrenxue.cn/api/getTime', {
    headers: { cookie: session.cookie, referer: REFERER, 'user-agent': UA },
  });
  const nowRaw = (await t.text()).trim();
  fs.writeSync(1, `getTime -> ${JSON.stringify(nowRaw)}\n`);
  const now = Number(nowRaw);
  const page = 1;
  const token = makeToken('/api/question/23', now, page);
  const url = `https://match.yuanrenxue.cn/api/question/23?page=${page}&pageSize=10&kw=&token=${token}&now=${now}`;
  fs.writeSync(1, `token=${token}\n${url}\n`);
  const r = await fetch(url, {
    headers: {
      accept: 'application/json, text/javascript, */*; q=0.01',
      cookie: session.cookie, referer: REFERER, 'user-agent': UA,
      'x-requested-with': 'XMLHttpRequest',
    },
  });
  fs.writeSync(1, `status=${r.status}\n${(await r.text()).slice(0, 600)}\n`);
})();
