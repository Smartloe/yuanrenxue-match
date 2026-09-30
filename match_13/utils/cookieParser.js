/**
 * 第13题 Cookie 解析工具
 * 解析混淆的 JS 代码，提取动态生成的 Cookie
 */

/**
 * 解析混淆的 JS 代码，提取 Cookie 名称和值
 * @param {string} jsCode - 从 /api2/13 获取的混淆 JS 代码
 * @returns {{name: string, value: string}} Cookie 名称和值
 */
function parseCookieFromJs(jsCode) {
  // 混淆代码使用了以下技术：
  // ([] + ![]) -> "false", [0]="f", [1]="a", [2]="l", [3]="s", [4]="e"
  // ([] + !![]) -> "true", [0]="t", [1]="r", [2]="u", [3]="e"
  // ({} + "") -> "[object Object]", [1]="o", [2]="b", [3]="j", [4]="e", [5]="c", [6]="t"
  
  const falseStr = "false";
  const trueStr = "true";
  const objStr = "[object Object]";
  
  // 使用正则提取所有的字符
  // 格式如：('y')+('u')+(([] + ![])[1])
  const parts = [];
  const regex = /\('([^']*)'\)/g;
  let match;
  
  while ((match = regex.exec(jsCode)) !== null) {
    parts.push(match[1]);
  }
  
  // 提取动态字符部分
  // 需要更精细的解析
  const fullMatch = jsCode.match(/document\.cookie=\((.*)\);path='\//);
  if (!fullMatch) {
    throw new Error('无法解析 Cookie 生成代码');
  }
  
  // 使用 eval 模拟方式解析
  // 这里我们直接手动构建，因为混淆模式是固定的
  
  // Cookie 名称: yuanrenxue_cookie
  const name = 'y' + 'u' + falseStr[1] + 'n' + trueStr[1] + falseStr[4] + 'n' + 'x' + 'u' + falseStr[4] + '_' + objStr[5] + objStr[1] + objStr[1] + 'k' + 'i' + falseStr[4];
  
  // Cookie 值是动态的，需要从代码中提取
  // 格式通常是：时间戳|签名
  // 我们需要执行 JS 代码来获取实际值
  
  // 由于 Node.js 无法直接执行浏览器 JS，我们需要手动解析
  // 从代码中提取所有字符拼接
  const valueParts = [];
  const charRegex = /\('([^']+)'\)/g;
  let charMatch;
  
  // 重新解析，获取值部分（等号后面到分号前面）
  const valueMatch = jsCode.match(/='\+'([^']+)'\+';/);
  if (valueMatch) {
    // 找到了动态值
  }
  
  // 更简单的方法：直接解析混淆代码
  // 混淆代码格式固定，我们逐字符解析
  const codeStr = fullMatch[1];
  
  // 逐个解析字符
  let result = '';
  let i = 0;
  while (i < codeStr.length) {
    if (codeStr[i] === '(') {
      // 找到匹配的 )
      let depth = 1;
      let j = i + 1;
      while (j < codeStr.length && depth > 0) {
        if (codeStr[j] === '(') depth++;
        if (codeStr[j] === ')') depth--;
        j++;
      }
      const expr = codeStr.substring(i + 1, j - 1);
      result += evalExpr(expr);
      i = j;
    } else if (codeStr[i] === '+') {
      i++;
    } else {
      i++;
    }
  }
  
  return { name, value: result.split('=')[1] || result };
}

/**
 * 评估单个表达式
 */
function evalExpr(expr) {
  // 'x' - 直接字符
  if (expr.startsWith("'") && expr.endsWith("'")) {
    return expr.slice(1, -1);
  }
  
  // ([] + ![])[1] - 数组转换
  const arrayMatch = expr.match(/\(\[\] \+ !\[\]\)\[(\d+)\]/);
  if (arrayMatch) {
    return "false"[parseInt(arrayMatch[1])];
  }
  
  const trueMatch = expr.match(/\(\[\] \+ !!\[\]\)\[(\d+)\]/);
  if (trueMatch) {
    return "true"[parseInt(trueMatch[1])];
  }
  
  const objMatch = expr.match(/\(\{\} \+ ""\)\[(\d+)\]/);
  if (objMatch) {
    return "[object Object]"[parseInt(objMatch[1])];
  }
  
  return '';
}

/**
 * 从 JS 代码中提取 Cookie 值（简化版）
 */
function extractCookieValue(jsCode) {
  // 提取所有单引号中的字符
  const chars = [];
  const regex = /'([^']*)'/g;
  let match;
  
  while ((match = regex.exec(jsCode)) !== null) {
    if (match[1].length === 1 || match[1].match(/^[a-zA-Z0-9|]+$/)) {
      chars.push(match[1]);
    }
  }
  
  // Cookie 名称后面是值
  // 格式: name=value;path=/;
  // 值部分在代码中是拼接的
  
  // 更精确的方法：直接从代码中找值的位置
  // 混淆代码格式：...='值前半部分'+...+值后半部分...
  
  return chars.join('');
}

module.exports = { parseCookieFromJs, extractCookieValue };
