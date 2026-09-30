/**
 * 第12题加密工具
 * m 参数 = base64("yuanrenxue" + page)
 */

/**
 * 生成 m 参数
 * @param {number} page - 页码
 * @returns {string} Base64 编码后的字符串
 */
function generateM(page) {
  const str = 'yuanrenxue' + page;
  return Buffer.from(str).toString('base64');
}

module.exports = { generateM };
