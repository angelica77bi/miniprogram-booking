// pages/admin/admin.js
Page({
  data: {
    isAuthorized: false,
    bookings: [] // 存放拉取到的订单列表
  },

  onLoad() {
    this.checkPermission();
  },

  // 1. 守门员逻辑
  checkPermission() {
    wx.showLoading({ title: '身份核验中...', mask: true });
    wx.cloud.callFunction({
      name: 'checkAdmin',
    }).then(res => {
      if (res.result && res.result.isAdmin) {
        this.setData({ isAuthorized: true });
        this.fetchBookings(); // 核验成功，立刻拉取订单
      } else {
        wx.hideLoading();
        this.handleUnauthorized();
      }
    }).catch(err => {
      wx.hideLoading();
      this.handleUnauthorized();
    });
  },

  // 2. 拉取订单列表
  fetchBookings() {
    wx.showLoading({ title: '加载订单中...' });
    wx.cloud.callFunction({
      name: 'getAdminBookings'
    }).then(res => {
      wx.hideLoading();
      this.setData({
        bookings: res.result.data || []
      });
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  // 3. 一键拨号功能
  makeCall(e) {
    const phoneNumber = e.currentTarget.dataset.phone;
    if (!phoneNumber) return;
    wx.makePhoneCall({
      phoneNumber: phoneNumber
    });
  },

  handleUnauthorized() {
    wx.showModal({
      title: '访问受限',
      content: '您不是系统管理员。',
      showCancel: false,
      success: () => { wx.navigateBack(); }
    });
  }
})