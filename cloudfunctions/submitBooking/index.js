// 引入微信 server sdk
const cloud = require('wx-server-sdk');
// 使用当前云环境初始化
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  // 1. 获取当前调用者的微信 OpenID (为后期个人系统做准备)
  const wxContext = cloud.getWXContext();
  const userOpenId = wxContext.OPENID;

  // 获取前端传过来的表单数据
  const { activityType, date, time, name, phone, count } = event;

  try {
    // 2. 查找能做该项目的活动船只
    const boatsRes = await db.collection('resources').where({
      capabilities: activityType,
      status: 'active'
    }).get();
    
    let availableBoats = boatsRes.data;
    if (availableBoats.length === 0) return { success: false, msg: '当前项目无可用船只' };

    // ✨✨✨ 核心增加：优先调度算法 ✨✨✨
    // 按船只拥有的 capabilities 数量从小到大排序（专项船排在全能船前面）
    // 这样如果定海钓，系统会优先尝试分配“只能海钓”的B船，而把“全能型”的A船留出
    availableBoats.sort((a, b) => (a.capabilities || []).length - (b.capabilities || []).length);

    // 3. 查找该日期、该时段已经被占用的资源 (船只)
    const slotsRes = await db.collection('slots').where({
      date: date,
      time: time
    }).get();
    
    const bookedBoatIds = slotsRes.data.map(slot => slot.resource_id);
    
    // 4. 分配空闲船只（此时 availableBoats 已按优先级排序）
    const freeBoat = availableBoats.find(boat => !bookedBoatIds.includes(boat._id));
    if (!freeBoat) return { success: false, msg: '该时段已满，请选择其他时段' };

    // 5. 校验预订人数是否超出船只最大载客量
    const parsedCount = parseInt(count);
    if (!parsedCount || parsedCount <= 0) return { success: false, msg: '请填写正确的预订人数' };
    if (parsedCount > freeBoat.max_capacity) {
      return { success: false, msg: `超出所分配的 ${freeBoat.name} 最大载客量（${freeBoat.max_capacity}人），请减少人数或分批预订` };
    }

    // 6. 构造唯一的锁ID防并发超卖：日期_时间_船只ID
    const lockId = `${date}_${time}_${freeBoat._id}`;

    // 7. 写入占位锁 (如果有两个人同时抢这艘船，只有一个人能写入成功，另一个人会触发 duplicate key error)
    await db.collection('slots').add({
      data: {
        _id: lockId, 
        date: date,
        time: time,
        resource_id: freeBoat._id,
        create_time: db.serverDate()
      }
    });
    
    // 8. 写入正式订单，并将获取到的 userOpenId 绑定到订单的 _openid 字段
    await db.collection('bookings').add({
      data: {
        _openid: userOpenId,  // 👈 核心排雷：绑定用户身份
        customer_name: name,
        phone: phone,
        guest_count: parsedCount,
        activity_type: activityType,
        date: date,
        time: time,
        resource_id: freeBoat._id,
        status: 0, // 0 代表待确认/未处理
        create_time: db.serverDate()
      }
    });

    // 9. 跨项目联动计算逻辑：判断某项目的船是否已经全满，以便通知前端日历变色
    const SESSIONS_PER_DAY = 3; 
    for (const cap of freeBoat.capabilities) {
      const capBoatsRes = await db.collection('resources').where({
        capabilities: cap,
        status: 'active'
      }).get();
      
      const capBoatIds = capBoatsRes.data.map(b => b._id);
      const maxSlots = capBoatIds.length * SESSIONS_PER_DAY; 

      const capUsedSlots = await db.collection('slots').where({
        date: date,
        resource_id: _.in(capBoatIds)
      }).count();

      if (capUsedSlots.total >= maxSlots) {
        const statusId = `${date}_${cap}`;         
        // 使用 set 避免重复创建同一天的满员记录
        await db.collection('daily_status').doc(statusId).set({
          data: {
            date: date,
            activityType: cap,
            isFull: true,
            update_time: db.serverDate()
          }
        });
      }
    }

    return { success: true, msg: '预订成功', boatAssigned: freeBoat.name };

  } catch (err) {
    // 捕获唯一索引冲突报错，提示用户被抢先了
    if (err.message && (err.message.includes('duplicate key error') || err.errCode === -502001)) {
       return { success: false, msg: '手慢了，该船期刚刚被抢占，请重试' };
    }
    console.error("SubmitBooking Error:", err);
    return { success: false, msg: '系统错误，请重试' };
  }
};