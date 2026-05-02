// pages/admin/admin.js
Page({
  data: {
    isAuthorized: false, // 初始为未授权，页面不可见
    bookings: []         // 存放拉取到的订单列表
  },

  onLoad() {
    // 页面加载时立即执行守门员校验
    this.checkPermission();
  },

  // 1. 守门员逻辑
  checkPermission() {
    wx.showLoading({ title: '身份核验中...', mask: true });
    
    // 调用云函数校验当前用户是否在 admins 白名单中
    wx.cloud.callFunction({
      name: 'checkAdmin',
    }).then(res => {
      if (res.result && res.result.isAdmin) {
        // 白名单校验通过
        this.setData({ isAuthorized: true });
        // 校验成功后，立即执行第 2 步：拉取数据
        this.fetchBookings(); 
      } else {
        wx.hideLoading();
        this.handleUnauthorized();
      }
    }).catch(err => {
      wx.hideLoading();
      console.error("鉴权失败", err);
      this.handleUnauthorized();
    });
  },

  // 2. 拉取订单列表
  fetchBookings() {
    wx.showLoading({ title: '加载订单中...' });
    
    // 调用云函数抓取 bookings 集合中的所有数据
    wx.cloud.callFunction({
      name: 'getAdminBookings'
    }).then(res => {
      wx.hideLoading();
      this.setData({
        bookings: res.result.data || []
      });
    }).catch(err => {
      wx.hideLoading();
      console.error("加载订单失败", err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  // 3. 一键拨号功能
  makeCall(e) {
    const phoneNumber = e.currentTarget.dataset.phone;
    if (!phoneNumber) return;
    
    // 调用微信原生 API 拨打电话
    wx.makePhoneCall({
      phoneNumber: phoneNumber
    });
  },

  // 4. 处理订单（确认/取消）及发送通知逻辑
  handleOrder(e) {
    const { id, action, openid } = e.currentTarget.dataset;
    const actionText = action === 'confirm' ? '确认接单' : '取消订单';

    wx.showModal({
      title: '操作确认',
      content: `确定要${actionText}吗？系统将自动发送微信通知给客户。`,
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...', mask: true });
          
          // 呼叫处理云函数 (下一步我们将编写该函数)
          wx.cloud.callFunction({
            name: 'processOrder',
            data: { 
              orderId: id, 
              action: action,
              userOpenid: openid
            }
          }).then(res => {
            wx.hideLoading();
            if(res.result && res.result.success) {
              wx.showToast({ title: '操作成功', icon: 'success' });
              this.fetchBookings(); // 重新拉取列表刷新状态
            } else {
              wx.showToast({ title: '操作失败', icon: 'none' });
            }
          }).catch(err => {
            wx.hideLoading();
            console.error('处理失败', err);
            wx.showToast({ title: '系统错误', icon: 'none' });
          });
        }
      }
    });
  },

  // 拦截非法访问
  handleUnauthorized() {
    wx.showModal({
      title: '访问受限',
      content: '您点错啦～',
      showCancel: false,
      success: () => {
        wx.navigateBack(); // 踢回首页
      }
    });
  }
})