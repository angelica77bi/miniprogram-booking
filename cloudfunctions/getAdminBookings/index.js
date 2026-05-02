// cloudfunctions/getAdminBookings/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    // 从 bookings 集合抓取所有数据
    // 逻辑：优先按预约日期(date)降序排列，同日期的按时间段(time)升序排列
    return await db.collection('bookings')
      .orderBy('date', 'desc')
      .orderBy('time', 'asc')
      .get()
  } catch (err) {
    console.error("Fetch Bookings Error:", err)
    return err
  }
}