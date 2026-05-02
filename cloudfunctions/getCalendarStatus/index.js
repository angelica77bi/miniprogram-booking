const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { year, month, activityType } = event;
  
  // 组装当月的起止日期字符串，用于数据库范围查询
  const monthStr = String(month).padStart(2, '0');
  const startDate = `${year}-${monthStr}-01`;
  const endDate = `${year}-${monthStr}-31`;

  try {
    // 🚀 极速查询：直接去缓存表查这个月、这个项目，并且已经满员的日期
    const statusRes = await db.collection('daily_status').where({
      date: _.gte(startDate).and(_.lte(endDate)),
      activityType: activityType,
      isFull: true
    }).get();

    // 将查到的记录提取出纯日期的数组，例如 ['2026-04-30', '2026-05-01']
    const fullyBookedDates = statusRes.data.map(item => item.date);

    // 完美契合前端 booking.js 的预期格式，直接返回
    return { success: true, bookedDates: fullyBookedDates };

  } catch (err) {
    console.error('日历状态获取失败：', err);
    // 即使报错也返回空数组，防止前端日历崩溃
    return { success: false, bookedDates: [], msg: '系统繁忙' };
  }
};