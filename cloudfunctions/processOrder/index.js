// cloudfunctions/processOrder/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command; // ✅ 新增：引入数据库指令符，用于 _.in 查询

exports.main = async (event, context) => {
  const { orderId, action, userOpenid } = event;
  console.log('--- 订单处理开始 ---', { orderId, action, userOpenid });
  
  try {
    // 1. 获取订单详情
    const orderRes = await db.collection('bookings').doc(orderId).get();
    const order = orderRes.data;
    
    let newStatus = 0;
    let templateId = '';
    let msgData = {};

    const activityName = order.activity_type === 'snorkeling' ? '浮潜' : (order.activity_type === 'fishing' ? '海钓' : '出海');
    const orderTime = `${order.date} ${order.time}`; 

    // 2. 状态分支处理
    if (action === 'confirm') {
      newStatus = 1; // 已确认
      templateId = 'jmV_dfVSiEpFFGspTtLD5X3H6_pj--CL6VAFZr9s8UY'; 
      msgData = {
        thing1: { value: `您的${activityName}预约` },
        time2: { value: orderTime },
        thing5: { value: '您的预约已被确定～我们出海日见。' }
      };
    } else if (action === 'reject') {
      newStatus = -1; // 已取消
      templateId = 'XrJf6WQqx8wWoYcB5cva26heVKpvyteLP93Za9L-iT0'; 
      msgData = {
        time1: { value: orderTime },
        thing2: { value: '由于天气原因，船期变动' }
      };

      // ✨ 数据一致性清理：结合降维思想的极简释放逻辑
      try {
        // A. 释放 slots 表中的占用 (保持原有逻辑不变)
        const slotRemoveRes = await db.collection('slots').where({
          date: order.date,
          time: order.time,                 
          resource_id: order.resource_id    
        }).remove();
        console.log('Slots 资源释放结果:', slotRemoveRes);

        // B. 逻辑推演精准释放 daily_status (只摘除这艘船关联项目的满员标记)
        // 1. 查一下被释放的这艘船能做哪些项目
        const resourceRes = await db.collection('resources').doc(order.resource_id).get();
        const boatCaps = resourceRes.data.capabilities; 

        // 2. 直接删除这天关联项目的满员标记，绝不误伤其他项目
        await db.collection('daily_status').where({
          date: order.date,
          activityType: _.in(boatCaps) 
        }).remove();

        console.log(`成功释放档期，并摘除 ${order.date} 的满员标记: ${boatCaps.join(',')}`);
      } catch (cleanErr) {
        console.error('连带清理资源时出现异常:', cleanErr);
      }
    }

    // 3. 更新订单主表状态
    await db.collection('bookings').doc(orderId).update({
      data: {
        status: newStatus,
        updateTime: db.serverDate()
      }
    });

    // 4. ✨ 核心兜底逻辑：推送微信订阅消息 (保持原有逻辑不变)
    const targetOpenid = userOpenid || order._openid; 

    if (targetOpenid) {
      try {
        await cloud.openapi.subscribeMessage.send({
          touser: targetOpenid, 
          page: 'pages/index/index', 
          templateId: templateId,
          data: msgData,
          miniprogramState: 'developer' 
        });
        console.log('微信通知发送成功，接收人:', targetOpenid);
      } catch (msgErr) {
        console.error('微信通知发送失败:', msgErr);
      }
    } else {
        console.log('没有找到收件人 openid，无法发送通知');
    }

    return { success: true };
  } catch (err) {
    console.error("处理流程崩溃:", err);
    return { success: false, error: err };
  }
}