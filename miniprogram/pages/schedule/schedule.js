// pages/schedule/schedule.js
Page({
  data: {
    activityType: '',
    timeSlots: ['08:30', '12:00', '16:00'],
    dateList: [],
    matrix: [], // 7x3 矩阵
    selectedDate: '', // 存储用户点入的日期 N
    selectedTime: '',
    showModal: false,
    formData: { name: '', phone: '', count: '' },
    scrollLeft: 0 
  },

  onLoad(options) {
    const selectedDateStr = options.date || this.formatDate(new Date());
    this.setData({
      activityType: options.activityType || 'mixed',
      selectedDate: selectedDateStr
    });
    this.initMatrix(selectedDateStr);
  },

  formatDate(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return "";
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  async initMatrix(NStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // ✨ 兼容性加固：适配 Mac 环境下的日期解析
    let dateN = new Date(NStr.replace(/-/g, '/')); 
    if (isNaN(dateN.getTime())) dateN = new Date(tomorrow);

    // 计算 N-3 逻辑
    let startPoint = new Date(dateN);
    startPoint.setDate(dateN.getDate() - 3);

    if (startPoint < tomorrow) {
      startPoint = new Date(tomorrow);
    }

    let dateList = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startPoint);
      d.setDate(startPoint.getDate() + i);
      const dateStr = this.formatDate(d);
      dateList.push({
        dateStr: dateStr,
        display: `${d.getMonth() + 1}/${d.getDate()}`,
        isTarget: dateStr === NStr 
      });
    }

    wx.showLoading({ title: '加载时段中...' });

    try {
      const res = await wx.cloud.callFunction({
        name: 'getScheduleStatus',
        data: { 
          activityType: this.data.activityType, 
          startDate: dateList[0].dateStr, 
          endDate: dateList[dateList.length - 1].dateStr 
        }
      });

      const result = res.result;

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

      // ✅ 保留：精准库存隔离算法
      const availableBoats = result.availableBoats;
      const availableBoatsCount = availableBoats.length;
      const availableBoatIds = availableBoats.map(b => b._id);
      const bookedSlots = result.bookedSlots || [];

      let slotCountMap = {};
      bookedSlots.forEach(slot => {
        if (availableBoatIds.includes(slot.resource_id)) {
          const validTime = slot.time || slot.time_slot;
          const key = `${slot.date}_${validTime}`;
          slotCountMap[key] = (slotCountMap[key] || 0) + 1;
        }
      });

      const matrix = this.data.timeSlots.map(time => {
        let days = dateList.map(dateObj => {
          const key = `${dateObj.dateStr}_${time}`;
          const bookedCount = slotCountMap[key] || 0;
          const isFull = bookedCount >= availableBoatsCount;

          return {
            dateStr: dateObj.dateStr,
            status: isFull ? 'full' : 'available'
          };
        });
        return { time, days };
      });

      // ✨✨ 优化点：分步执行，先渲染数据，不设偏移量
      this.setData({ dateList, matrix }, () => {
        // ✨✨ 在数据渲染完成的回调中，再异步处理滚动逻辑
        const targetIndex = dateList.findIndex(d => d.dateStr === NStr);
        if (targetIndex !== -1) {
          const sysInfo = wx.getSystemInfoSync();
          const ratio = sysInfo.windowWidth / 750; // rpx 转 px 比例

          /**
           * 公式保持你设定的逻辑：
           * 左侧固定列宽: 100rpx
           * 每个档期列宽: 140rpx
           * 区域中心: 325rpx
           */
          const scrollLeftRpx = (targetIndex * 140) + 70 - 325; 
          const scrollLeftPx = Math.max(0, scrollLeftRpx) * ratio;

          // 稍微延迟 100ms 避开渲染峰值，彻底防止模拟器假死
          setTimeout(() => {
            this.setData({ scrollLeft: scrollLeftPx });
          }, 100);
        }
      });

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

  submitBooking() {
    const { name, phone, count } = this.data.formData;
    if (!name || !phone || !count) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' });
      return;
    }
    if (parseInt(count) > 8) {
      wx.showModal({ title: '提示', content: '单次最多预订 8 人', showCancel: false });
      return;
    }
    const tmplIds = [
      'jmV_dfVSiEpFFGspTtLD5X3H6_pj--CL6VAFZr9s8UY',
      'ttJ4NwdzJ6MCTFVN8k3jI_qMWK7a5TpaK_KweTNR980',
      'XrJf6WQqx8wWoYcB5cva26heVKpvyteLP93Za9L-iT0'
    ];
    wx.requestSubscribeMessage({
      tmplIds: tmplIds,
      complete: (res) => {
        this.executeActualSubmit(); 
      }
    });
  },

  executeActualSubmit() {
    const { name, phone, count } = this.data.formData;
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
        wx.showToast({ title: '网络异常', icon: 'none' });
      }
    });
  }
});