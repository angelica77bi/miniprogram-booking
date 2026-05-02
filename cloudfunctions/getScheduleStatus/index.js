const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { activityType, startDate, endDate } = event;

  try {
    // 1. 获取资源（船只），云端默认100条限制，船只数量通常不会超，直接查
    const boatsRes = await db.collection('resources').where({
      capabilities: activityType,
      status: 'active'
    }).get();
    
    // 2. 突破限制获取所有 slots（分批拉取）
    const MAX_LIMIT = 100;
    const countRes = await db.collection('slots').where({
      date: _.gte(startDate).and(_.lte(endDate))
    }).count();
    const total = countRes.total;
    
    // 计算需要查几次
    const batchTimes = Math.ceil(total / MAX_LIMIT);
    const tasks = [];
    
    for (let i = 0; i < batchTimes; i++) {
      const promise = db.collection('slots').where({
        date: _.gte(startDate).and(_.lte(endDate))
      }).skip(i * MAX_LIMIT).limit(MAX_LIMIT).get();
      tasks.push(promise);
    }
    
    let allSlots = [];
    if (tasks.length > 0) {
      const results = await Promise.all(tasks);
      allSlots = results.reduce((acc, cur) => acc.concat(cur.data), []);
    }

    return { 
      success: true, 
      availableBoats: boatsRes.data,
      bookedSlots: allSlots
    };

  } catch (err) {
    console.error('获取时段数据失败：', err);
    return { success: false, msg: '获取数据失败' };
  }
};