// pages/schedule/schedule.js
Page({
  data: {
    activityType: '',
    timeSlots: ['08:30', '12:00', '16:00'],
    dateList: [], 
    matrix: [], // 存储 7x3 的二维状态数组
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

  // 异步初始化整个矩阵数据（真实读取云端库存）
  async initMatrix(centerDateStr) {
    const centerDate = new Date(centerDateStr);
    let dateList = [];
    
    // 1. 生成横向 7 天的表头
    for (let i = -1; i <= 5; i++) { 
      const d = new Date(centerDate);
      d.setDate(centerDate.getDate() + i);
      const dateStr = this.formatDate(d);
      dateList.push({
        dateStr: dateStr,
        display: `${d.getMonth()+1}/${d.getDate()}`
      });
    }

    // 2. 获取这 7 天内的所有日期字符串，用于云端查询
    const startDate = dateList[0].dateStr;
    const endDate = dateList[dateList.length - 1].dateStr;

    wx.showLoading({ title: '加载档期中...' });

    try {
      const db = wx.cloud.database();
      const _ = db.command;

      // 3. 并行请求：查可用船只数量 + 查这7天已经被占用的档期
      const [boatsRes, slotsRes] = await Promise.all([
        db.collection('resources').where({
          capabilities: this.data.activityType,
          status: 'active'
        }).get(),
        db.collection('slots').where({
          date: _.gte(startDate).and(_.lte(endDate))
        }).get()
      ]);

      const availableBoatsCount = boatsRes.data.length;
      const bookedSlots = slotsRes.data;

      // 如果没有满足条件的船，所有格子直接显示已满
      if (availableBoatsCount === 0) {
        wx.hideLoading();
        wx.showToast({ title: '该项目暂无可用船只', icon: 'none' });
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

      // 4. 统计每个“日期+时间段”已经被订走几艘船
      let slotCountMap = {};
      bookedSlots.forEach(slot => {
        const key = `${slot.date}_${slot.time_slot}`;
        slotCountMap[key] = (slotCountMap[key] || 0) + 1;
      });

      // 5. 生成真实的矩阵数据
      const matrix = this.data.timeSlots.map(time => {
        let days = dateList.map(dateObj => {
          const key = `${dateObj.dateStr}_${time}`;
          const bookedCount = slotCountMap[key] || 0;
          
          // 核心判断：如果被订走的船只数量 >= 总可用船只数量，说明这个时段真的满了
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
      console.error('获取库存失败:', err);
      wx.showToast({ title: '库存加载失败', icon: 'none' });
    }
  },

  // 点击矩阵网格
  selectCell(e) {
    const { time, date, status } = e.currentTarget.dataset;
    
    if (status === 'full') {
      wx.showToast({ title: '此时段已满', icon: 'none' });
      return;
    }

    // 更新选中的精准坐标
    this.setData({
      selectedDate: date,
      selectedTime: time
    });
  },

  // 表单逻辑保持不变
  openModal() {
    if (!this.data.selectedDate || !this.data.selectedTime) {
      wx.showToast({ title: '请先在表格中选择一个时段', icon: 'none' });
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
  
  // 提交意向（真实对接云数据库）
  submitBooking() {
    const { name, phone, count } = this.data.formData;
    
    if (!name || !phone || !count) {
      wx.showToast({ title: '请填写完整', icon: 'none' }); 
      return;
    }
    
    if (parseInt(count) > 8) {
      wx.showModal({ title: '人数超载', content: '单船限乘 8 人，请咨询老板', showCancel: false }); 
      return;
    }
    
    wx.showLoading({ title: '提交中...', mask: true });

    // 正式呼叫我们的云函数
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
          wx.showToast({ title: '预约成功！', icon: 'success' });
          // 这句 Log 是真实验证的关键！
          console.log('分配到的船只：', result.boatAssigned);
          this.closeModal();
          setTimeout(() => { wx.reLaunch({ url: '/pages/index/index' }); }, 1500);
        } else {
          wx.showToast({ title: result ? result.msg : '预约失败', icon: 'none', duration: 3000 });
        }
      },
      fail: err => {
        wx.hideLoading();
        console.error('云函数调用失败：', err);
        wx.showToast({ title: '网络异常，请重试', icon: 'none' });
      }
    });
  }
});