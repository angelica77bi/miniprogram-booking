// app.js
App({
  onLaunch: function () {
    this.globalData = {
      // 已经绑定到你目前的真实开发环境
      env: "cloud1-d5gp5mbb9e868b58e", 
    };
    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
    } else {
      wx.cloud.init({
        env: this.globalData.env,
        traceUser: true,
      });
    }
  },
});