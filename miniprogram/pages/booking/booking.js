// pages/booking/booking.js
Page({
  data: {
    activityType: '', // 存储上一个页面传来的项目类型
    year: 2026,
    month: 1,
    days: [],
    todayStr: '',
    maxDateStr: ''
  },

  onLoad(options) {
    // 1. 接收上个页面的参数
    const activityType = options.activityType || 'mixed';
    this.setData({ activityType: activityType });
    
    // 2. 初始化日历
    this.initCalendar();

    // 3. 向云数据库请求匹配的船只 (保留原有逻辑)
    this.fetchResources(activityType);
  },

  // 去云端找船 (保留原有逻辑)
  fetchResources(type) {
    const db = wx.cloud.database();
    db.collection('resources').where({
      capabilities: type,
      status: 'active'
    }).get({
      success: res => {
        console.log(`=== 成功从云端匹配到 ${res.data.length} 艘船 ===`);
        this.setData({ availableBoats: res.data });
      },
      fail: err => {
        console.error('云端查询失败：', err);
      }
    });
  },

  initCalendar() {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;

    // 计算允许预约的最大日期 (当前月及后两个月)
    const maxDate = new Date(year, month + 2, 0); // 第三个月的最后一天

    this.setData({
      todayStr: this.formatDate(today),
      maxDateStr: this.formatDate(maxDate),
      year,
      month
    });
    
    // 🚨 替换：不再直接渲染，而是去云端获取本月的满房状态
    this.fetchCalendarStatus(year, month, this.data.activityType);
  },

  // 🚨 新增：去云端拉取当月的满房状态
  fetchCalendarStatus(year, month, activityType) {
    wx.showLoading({ title: '加载档期中...' });
    wx.cloud.callFunction({
      name: 'getCalendarStatus',
      data: { year, month, activityType },
      success: res => {
        wx.hideLoading();
        if (res.result && res.result.success) {
          // 拿到云端算好的满房数组，重新渲染日历
          const bookedDates = res.result.bookedDates || [];
          this.renderMonth(year, month, bookedDates); 
        } else {
          this.renderMonth(year, month, []); // 失败兜底
        }
      },
      fail: err => {
        wx.hideLoading();
        console.error('获取日历状态失败', err);
        this.renderMonth(year, month, []); // 失败兜底全绿
      }
    });
  },

  // 格式化日期为 YYYY-MM-DD
  formatDate(date) {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  // 🚨 修改：渲染指定年月的日历数据，接收 bookedDates 参数
  renderMonth(year, month, bookedDates = []) {
    const firstDay = new Date(year, month - 1, 1).getDay(); // 当月1号是星期几
    const daysInMonth = new Date(year, month, 0).getDate(); // 当月总天数

    let days = [];
    // 填充当月第一天之前的空白网格
    for (let i = 0; i < firstDay; i++) {
      days.push({ empty: true });
    }

    // 填充实际天数
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${year}-${month.toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`;
      
      // ✨ 核心修改点：限制最小值
      // 将原有的 >= 修改为 >，这样今日 (todayStr) 也会变为不可选状态
      const isSelectable = dateStr > this.data.todayStr && dateStr <= this.data.maxDateStr;
      
      // 🚨 判断这一天是否在后端的满房数组里
      const isFull = bookedDates.includes(dateStr);

      days.push({
        empty: false,
        day: i,
        dateStr: dateStr,
        isSelectable: isSelectable,
        isFull: isFull // 记录满房状态
      });
    }

    this.setData({ days, year, month });
  },

  // 上个月
  prevMonth() {
    const currentMonthFirst = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const viewMonthFirst = new Date(this.data.year, this.data.month - 2, 1);
    
    if (viewMonthFirst < currentMonthFirst) {
      wx.showToast({ title: '无法预订过去的日期', icon: 'none' });
      return;
    }

    let { year, month } = this.data;
    if (month === 1) { year--; month = 12; }
    else { month--; }
    
    // 🚨 替换：设置好年月后，重新请求云端
    this.setData({ year, month });
    this.fetchCalendarStatus(year, month, this.data.activityType);
  },

  // 下个月
  nextMonth() {
    let { year, month } = this.data;
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const monthsDiff = (year - currentYear) * 12 + (month - currentMonth);

    if (monthsDiff >= 2) {
      wx.showToast({ title: '仅开放未来三个月的预订', icon: 'none' });
      return;
    }

    if (month === 12) { year++; month = 1; }
    else { month++; }
    
    // 🚨 替换：设置好年月后，重新请求云端
    this.setData({ year, month });
    this.fetchCalendarStatus(year, month, this.data.activityType);
  },

  // 点击日期，携带日期和项目类型跳转到“时段页”
  goToSchedule(e) {
    const item = e.currentTarget.dataset.item;
    // 满房或不可选（包含今天及过去）的日期将在此处被拦截
    if (item.empty || !item.isSelectable) return;

    wx.navigateTo({
      url: `/pages/schedule/schedule?date=${item.dateStr}&activityType=${this.data.activityType}`
    });
  }
});