// pages/index/index.js
Page({
  goToBooking(e) {
    const activityType = e.currentTarget.dataset.type;
    wx.navigateTo({
      url: `/pages/booking/booking?activityType=${activityType}`,
    });
  },
  
  // 触发彩蛋，跳转到管理页
  goToAdmin() {
    wx.navigateTo({
      url: '/pages/admin/admin',
    });
  }
})