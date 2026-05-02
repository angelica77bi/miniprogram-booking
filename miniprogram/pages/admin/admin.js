// pages/admin/admin.js
Page({
  data: {
    isAuthorized: false // 初始为未授权，页面不可见
  },

  onLoad(options) {
    this.checkPermission();
  },

  // 守门员逻辑：加载瞬间强制校验
  checkPermission() {
    wx.showLoading({ title: '身份核验中...', mask: true });
    
    wx.cloud.callFunction({
      name: 'checkAdmin',
    }).then(res => {
      wx.hideLoading();
      if (res.result && res.result.isAdmin) {
        // 白名单校验通过
        this.setData({ isAuthorized: true });
        wx.showToast({ title: '老板好！', icon: 'success' });
      } else {
        // 非管理员：直接弹窗警告并踢回首页
        wx.showModal({
          title: '访问受限',
          content: '点错啦～',
          showCancel: false,
          success: () => {
            wx.navigateBack(); // 无情踢回
          }
        });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error("鉴权失败", err);
      wx.navigateBack();
    });
  }
})