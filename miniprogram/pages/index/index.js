// pages/index/index.js
Page({
  goToBooking(e) {
    const activityType = e.currentTarget.dataset.type;
    wx.navigateTo({
      url: `/pages/booking/booking?activityType=${activityType}`,
    });
  }
})