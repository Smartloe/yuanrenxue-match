/**
 * 第11题 —— 给"人工 F12"环境用的控制台脚本（v2）
 *
 * 用法：先按 F12 打开控制台，再进入 https://match.yuanrenxue.cn/match/11，
 *      等页面加载完（约 5 秒）后整段粘进 Console 回车。
 *
 * 作用：
 *   1) 每 500ms 轮询关键状态（window.secretkey / window.SecretKey / window.match1）
 *   2) 尝试从干净 iframe 恢复 console 全部功能
 *   3) 一旦 window.secretkey（或 match1）出现，立刻用打印的 RandomString + 固定后缀算出答案
 *   4) 把所有结果以 YRX11 前缀打印，方便复制回传
 */
(() => {
  const SUFFIX = '3f73bd8671faaa92';
  const seen = new Set();
  const report = (tag) => {
    const o = { tag, t: new Date().toISOString().slice(11, 23), url: location.href };
    o.secretkey = typeof window.secretkey;
    o.SecretKey = typeof window.SecretKey;
    o.randomString = typeof window.randomString;
    try { o.match1 = window.match1 === undefined ? null : String(window.match1).slice(0, 200); } catch (e) { o.match1 = 'err'; }
    try {
      const i = new window.DevtoolsTrap();
      o.random_str = i.random_str;
      o.checkEnv = i.checkEnv();
      o.triggered = i.triggered;
      o.map = Object.keys(i.triggeredMap).filter((k) => i.triggeredMap[k]);
    } catch (e) { o.trapErr = e.message; }
    try { o.logNative = /native code/.test(Function.prototype.toString.call(console.log)); } catch (e) { /* ignore */ }
    const line = 'YRX11 ' + JSON.stringify(o);
    if (!seen.has(line)) { seen.add(line); console.log(line); }
    return o;
  };

  // 1) 先从干净 iframe 恢复 console（题目要求的那一步）
  try {
    const f = document.createElement('iframe');
    f.style.display = 'none';
    document.body.appendChild(f);
    const c = f.contentWindow.console;
    ['log', 'info', 'warn', 'error', 'debug', 'dir', 'table', 'trace', 'group', 'groupEnd', 'groupCollapsed', 'assert', 'count', 'time', 'timeEnd']
      .forEach((n) => { try { if (typeof c[n] === 'function') console[n] = c[n]; } catch (e) { /* ignore */ } });
    console.log('YRX11 console restored from clean iframe');
  } catch (e) { console.log('YRX11 restore failed: ' + e.message); }

  report('start');

  // 2) 轮询观察
  let n = 0;
  const timer = setInterval(() => {
    n++;
    const o = report('tick' + n);
    const hasFn = typeof window.secretkey === 'function';
    const hasMatch1 = o.match1 && o.match1 !== 'null';
    if (hasFn || hasMatch1) {
      clearInterval(timer);
      let ans = null;
      if (hasMatch1) ans = o.match1;
      else {
        try {
          const rs = (o.random_str || (window.randomString ? window.randomString(16) : ''));
          ans = String(window.secretkey(rs + SUFFIX));
          console.log('YRX11 used random_str=' + rs);
        } catch (e) { console.log('YRX11 compute failed: ' + e.message); }
      }
      console.log('YRX11 === ANSWER === ' + ans);
      console.log('YRX11 请把上面所有 YRX11 行复制回传（尤其是 ANSWER 行）');
    }
    if (n >= 60) { clearInterval(timer); console.log('YRX11 轮询结束（30s）：仍未出现 secretkey/match1'); }
  }, 500);

  console.log('YRX11 已在轮询，最多 30 秒；期间请勿关闭控制台');
})();
