// cloudfunctions/checkAdmin/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  // 提取访问者的安全微信身份
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;

  try {
    // 拿着这个 openId 去我们之前建好的 admins 白名单里查
    const result = await db.collection('admins').where({
      openid: openId 
    }).get();

    // 如果查到了，说明是管理员
    if (result.data.length > 0) {
      return { isAdmin: true };
    } else {
      return { isAdmin: false };
    }
  } catch (err) {
    console.error(err);
    return { isAdmin: false };
  }
};