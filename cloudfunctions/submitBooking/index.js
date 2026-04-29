// cloudfunctions/submitBooking/index.js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }); // 使用当前环境
const db = cloud.database();

exports.main = async (event, context) => {
  // 从前端接收的参数
  const { activityType, date, time, name, phone, count } = event;

  try {
    // 1. 先查：找出所有能做该项目的船
    const boatsRes = await db.collection('resources').where({
      capabilities: activityType,
      status: 'active'
    }).get();
    
    const availableBoats = boatsRes.data;
    if (availableBoats.length === 0) {
      return { success: false, msg: '当前项目暂无可用船只' };
    }

    // 2. 再查：查出这个日期+时间段，已经被占用的船只 ID
    const slotsRes = await db.collection('slots').where({
      date: date,
      time_slot: time
    }).get();
    
    const bookedBoatIds = slotsRes.data.map(slot => slot.resource_id);

    // 3. 匹配：找出第一艘还没被占用的船
    const freeBoat = availableBoats.find(boat => !bookedBoatIds.includes(boat._id));

    if (!freeBoat) {
      return { success: false, msg: '非常抱歉，此时段的船只已被订满' };
    }

    // 🚨 【炸弹 3 防护】—— 校验人数上限与合法性，防止超卖
    const parsedCount = parseInt(count);
    if (!parsedCount || parsedCount <= 0) {
      return { success: false, msg: '请输入有效的预约人数' };
    }
    if (parsedCount > freeBoat.max_capacity) {
      return { success: false, msg: `安全提醒：【${freeBoat.name}】最多仅能容纳 ${freeBoat.max_capacity} 人，您输入了 ${parsedCount} 人。` };
    }

    // 4. 【核心防冲突锁定】利用 _id 唯一性约束进行原子操作
    // 构造一把唯一的“锁”，例如：2026-05-01_08:30_船只ID
    const lockId = `${date}_${time}_${freeBoat._id}`;

    // 尝试把这把锁写入 slots 集合。如果两人同时到这一步，数据库底层会直接拒绝第二个人的写入。
    await db.collection('slots').add({
      data: {
        _id: lockId, // 唯一标识，如果重复会抛出 error
        date: date,
        time_slot: time,
        resource_id: freeBoat._id,
        create_time: db.serverDate()
      }
    });
    
    // 5. 锁单成功！安全地生成正式的订单记录
    await db.collection('bookings').add({
      data: {
        customer_name: name,
        phone: phone,
        guest_count: parsedCount, // 使用转换后的安全数字
        activity_type: activityType,
        date: date,
        time: time,
        resource_id: freeBoat._id,
        status: 0, // 0: 待处理 (等待老板确认)
        create_time: db.serverDate()
      }
    });

    return { 
      success: true, 
      msg: '预约提交成功！',
      boatAssigned: freeBoat.name 
    };

  } catch (err) {
    // 错误处理：如果报错是因为 _id 重复，说明刚被别人抢走
    if (err.message && (err.message.includes('duplicate key error') || err.errCode === -502001)) {
       return { success: false, msg: '哎呀晚了一步，该档期刚被抢走啦' };
    }
    console.error('云函数内部错误：', err);
    return { success: false, msg: '系统繁忙，请重试' };
  }
};