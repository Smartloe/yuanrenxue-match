/**
 * 第12题请求封装
 */
const https = require('https');
const config = require('../config/session.json');

const BASE_URL = 'https://match.yuanrenxue.cn';

/**
 * 发送GET请求
 * @param {string} path - 请求路径
 * @param {object} params - 查询参数
 * @param {object} headers - 额外请求头
 * @returns {Promise<object>} 响应数据
 */
function get(path, params = {}, headers = {}) {
  return new Promise((resolve, reject) => {
    const queryString = new URLSearchParams(params).toString();
    const fullPath = queryString ? `${path}?${queryString}` : path;
    
    const options = {
      hostname: 'match.yuanrenxue.cn',
      path: fullPath,
      method: 'GET',
      headers: {
        'Cookie': config.cookies,
        'User-Agent': headers['User-Agent'] || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Referer': 'https://match.yuanrenxue.cn/match/12',
        'X-Requested-With': 'XMLHttpRequest',
        ...headers
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ raw: data });
        }
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}

module.exports = { get };
