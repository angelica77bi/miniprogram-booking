// pages/schedule/schedule.js
Page({
  data: {
    activityType: '',
    timeSlots: ['08:30', '12:00', '16:00'],
    dateList: [],
    matrix: [], // 7x3 矩阵
    selectedDate: '',
    selectedTime: '',
    showModal: false,
    formData: { name: '', phone: '', count: '' }
  },

  onLoad(options) {
    const centerDate = options.date || this.formatDate(new Date());
    this.setData({
      activityType: options.activityType || 'mixed'
    });
    this.initMatrix(centerDate);
  },

  formatDate(date) {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  async initMatrix(centerDateStr) {
    const centerDate = new Date(centerDateStr);
    let dateList = [];

    // 1. 生成 7 天日期列表 (-1 到 +5)
    for (let i = -1; i <= 5; i++) {
      const d = new Date(centerDate);
      d.setDate(centerDate.getDate() + i);
      const dateStr = this.formatDate(d);
      dateList.push({
        dateStr: dateStr,
        display: `${d.getMonth() + 1}/${d.getDate()}`
      });
    }

    const startDate = dateList[0].dateStr;
    const endDate = dateList[dateList.length - 1].dateStr;

    wx.showLoading({ title: '加载时段中...' });

    try {
      // 2. 调用云函数，彻底打破前端 20 条查询限制
      const res = await wx.cloud.callFunction({
        name: 'getScheduleStatus',
        data: { 
          activityType: this.data.activityType, 
          startDate: startDate, 
          endDate: endDate 
        }
      });

      const result = res.result;

      // 如果没有任何可用船只
      if (!result || !result.success || !result.availableBoats || result.availableBoats.length === 0) {
        wx.hideLoading();
        wx.showToast({ title: '暂无可用船只', icon: 'none' });
        const matrix = this.data.timeSlots.map(time => {
          let days = dateList.map(dateObj => ({
            dateStr: dateObj.dateStr,
            status: 'full'
          }));
          return { time, days };
        });
        this.setData({ dateList, matrix });
        return;
      }

      const availableBoatsCount = result.availableBoats.length;
      const bookedSlots = result.bookedSlots;

      // 3. 统计每个时段被预订的次数
      let slotCountMap = {};
      bookedSlots.forEach(slot => {
        const key = `${slot.date}_${slot.time_slot}`;
        slotCountMap[key] = (slotCountMap[key] || 0) + 1;
      });

      // 4. 生成矩阵状态
      const matrix = this.data.timeSlots.map(time => {
        let days = dateList.map(dateObj => {
          const key = `${dateObj.dateStr}_${time}`;
          const bookedCount = slotCountMap[key] || 0;

          // 如果该时段被预订的次数 >= 可用船只数，说明满了
          const isFull = bookedCount >= availableBoatsCount;

          return {
            dateStr: dateObj.dateStr,
            status: isFull ? 'full' : 'available'
          };
        });
        return { time, days };
      });

      this.setData({ dateList, matrix });
      wx.hideLoading();
    } catch (err) {
      wx.hideLoading();
      console.error('加载时段失败：', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  selectCell(e) {
    const { time, date, status } = e.currentTarget.dataset;

    if (status === 'full') {
      wx.showToast({ title: '该时段已满', icon: 'none' });
      return;
    }

    this.setData({
      selectedDate: date,
      selectedTime: time
    });
  },

  openModal() {
    if (!this.data.selectedDate || !this.data.selectedTime) {
      wx.showToast({ title: '请先选择时段', icon: 'none' });
      return;
    }
    this.setData({ showModal: true });
  },

  closeModal() {
    this.setData({ showModal: false });
  },

  handleInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`formData.${field}`]: e.detail.value });
  },

  // ✨ 第一步：点击提交按钮时，先触发微信授权弹窗
  submitBooking() {
    const { name, phone, count } = this.data.formData;

    // 你原有的前置表单校验
    if (!name || !phone || !count) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' });
      return;
    }

    if (parseInt(count) > 8) {
      wx.showModal({ title: '提示', content: '单次最多预订 8 人', showCancel: false });
      return;
    }

    // 准备我们要申请的 3 个模板 ID
    const tmplIds = [
      'jmV_dfVSiEpFFGspTtLD5X3H6_pj--CL6VAFZr9s8UY', // 受理通知
      'ttJ4NwdzJ6MCTFVN8k3jI_qMWK7a5TpaK_KweTNR980', // 活动开始通知
      'XrJf6WQqx8wWoYcB5cva26heVKpvyteLP93Za9L-iT0'  // 档期变更通知
    ];

    // 呼出微信原生授权弹窗
    wx.requestSubscribeMessage({
      tmplIds: tmplIds,
      complete: (res) => {
        // 🚨 不管用户点允许、拒绝还是直接关掉，都继续执行你的真实提交！
        console.log('订阅消息授权结果：', res);
        this.executeActualSubmit(); 
      }
    });
  },

  // ✨ 第二步：这完全是你自己写的提交代码，我只是把它换了个名字
  executeActualSubmit() {
    const { name, phone, count } = this.data.formData; // 重新获取一下以防万一

    wx.showLoading({ title: '提交中...', mask: true });

    wx.cloud.callFunction({
      name: 'submitBooking',
      data: {
        activityType: this.data.activityType,
        date: this.data.selectedDate,
        time: this.data.selectedTime,
        name: name,
        phone: phone,
        count: count
      },
      success: res => {
        wx.hideLoading();
        const result = res.result;

        if (result && result.success) {
          // 我稍微把文案改得更符合带通知的语境
          wx.showModal({
            title: '预订申请已提交',
            content: '老板确认后将通过微信通知您。',
            showCancel: false,
            success: () => {
              this.closeModal();
              wx.reLaunch({ url: '/pages/index/index' });
            }
          });
        } else {
          wx.showToast({ title: result ? result.msg : '预订失败', icon: 'none', duration: 3000 });
        }
      },
      fail: err => {
        wx.hideLoading();
        console.error('请求失败', err);
        wx.showToast({ title: '网络异常', icon: 'none' });
      }
    });
  }
});