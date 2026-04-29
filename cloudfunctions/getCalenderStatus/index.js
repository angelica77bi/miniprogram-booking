const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;

exports.main = async (event, context) => {
  const { year, month, activityType } = event;
  const monthStr = String(month).padStart(2, '0');
  const startDate = `${year}-${monthStr}-01`;
  const endDate = `${year}-${monthStr}-31`;

  try {
    // 1. 查出当前活动类型能用的所有船
    const boatsRes = await db.collection('resources').where({
      capabilities: activityType,
      status: 'active'
    }).get();

    const validBoatIds = boatsRes.data.map(boat => boat._id);
    const validBoatCount = validBoatIds.length;

    if (validBoatCount === 0) {
       return { success: true, bookedDates: [] };
    }

    // 2. 核心业务规则：每天 3 个出船时段
    const SESSIONS_PER_DAY = 3; 
    const maxSlotsPerDay = validBoatCount * SESSIONS_PER_DAY;

    // 3. 聚合查询：暴力统计当月每天的订单量
    const slotsRes = await db.collection('slots').aggregate()
      .match({
        date: _.gte(startDate).and(_.lte(endDate)),
        resource_id: _.in(validBoatIds)
      })
      .group({
        _id: '$date',
        bookedCount: $.sum(1)
      })
      .end();

    // 4. 筛选：找出已被锁定档期数 >= 最大接待能力的日期
    const fullyBookedDates = [];
    slotsRes.list.forEach(item => {
      if (item.bookedCount >= maxSlotsPerDay) {
        fullyBookedDates.push(item._id); 
      }
    });

    return { success: true, bookedDates: fullyBookedDates };

  } catch (err) {
    console.error('日历状态计算失败：', err);
    return { success: false, bookedDates: [], msg: '系统繁忙' };
  }
};