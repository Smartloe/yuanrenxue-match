/**
 * 第13题请求封装
 */
const https = require('https');
const config = require('../config/session.json');

const BASE_URL = 'https://match.yuanrenxue.cn';

/**
 * 发送GET请求
 */
function get(path, params = {}, headers = {}, cookies = null) {
  return new Promise((resolve, reject) => {
    const queryString = new URLSearchParams(params).toString();
    const fullPath = queryString ? `${path}?${queryString}` : path;
    
    const cookieStr = cookies || config.baseCookies;
    
    const options = {
      hostname: 'match.yuanrenxue.cn',
      path: fullPath,
      method: 'GET',
      headers: {
        'Cookie': cookieStr,
        'User-Agent': headers['User-Agent'] || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
        'Accept': headers['Accept'] || 'application/json, text/javascript, */*; q=0.01',
        'Referer': 'https://match.yuanrenxue.cn/match/13',
        'X-Requested-With': 'XMLHttpRequest',
        ...headers
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // 检查是否有 set-cookie
        const setCookie = res.headers['set-cookie'];
        try {
          resolve({ 
            data: JSON.parse(data), 
            setCookie,
            raw: data
          });
        } catch (e) {
          resolve({ raw: data, setCookie });
        }
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}

module.exports = { get };
