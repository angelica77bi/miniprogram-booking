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

    // 3. 🚨 新增：向云数据库请求匹配的船只
    this.fetchResources(activityType);
  },

  // 🚨 新增函数：去云端找船
  fetchResources(type) {
    // 呼叫云数据库
    const db = wx.cloud.database();
    
    // 提示用户正在加载
    wx.showLoading({ title: '匹配资源中...' });

    db.collection('resources').where({
      // 核心过滤逻辑：找 capabilities 数组中包含当前项目类型的船，并且状态是 active 的
      capabilities: type,
      status: 'active'
    }).get({
      success: res => {
        wx.hideLoading();
        console.log(`=== 成功从云端匹配到 ${res.data.length} 艘船 ===`);
        console.log(res.data);
        // 我们先把拿到的船只信息存到页面的 data 里备用
        this.setData({ availableBoats: res.data });
      },
      fail: err => {
        wx.hideLoading();
        console.error('云端查询失败：', err);
        wx.showToast({ title: '获取资源失败', icon: 'none' });
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
    
    this.renderMonth(year, month);
  },

  // 格式化日期为 YYYY-MM-DD
  formatDate(date) {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  // 渲染指定年月的日历数据
  renderMonth(year, month) {
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
      
      // 判断该日期是否在允许的范围内（>=今天 且 <=最大日期）
      const isSelectable = dateStr >= this.data.todayStr && dateStr <= this.data.maxDateStr;

      days.push({
        empty: false,
        day: i,
        dateStr: dateStr,
        isSelectable: isSelectable
      });
    }

    this.setData({ days, year, month });
  },

  // 上个月
  prevMonth() {
    const currentMonthFirst = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const viewMonthFirst = new Date(this.data.year, this.data.month - 2, 1);
    
    // 限制：不能翻到当前月之前
    if (viewMonthFirst < currentMonthFirst) {
      wx.showToast({ title: '无法预订过去的日期', icon: 'none' });
      return;
    }

    let { year, month } = this.data;
    if (month === 1) { year--; month = 12; }
    else { month--; }
    this.renderMonth(year, month);
  },

  // 下个月
  nextMonth() {
    let { year, month } = this.data;
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const monthsDiff = (year - currentYear) * 12 + (month - currentMonth);

    // 限制：最多只能往后翻2个月 (当前月算第0个月)
    if (monthsDiff >= 2) {
      wx.showToast({ title: '仅开放未来三个月的预订', icon: 'none' });
      return;
    }

    if (month === 12) { year++; month = 1; }
    else { month++; }
    this.renderMonth(year, month);
  },

  // 点击日期，携带日期和项目类型跳转到“时段页”
  goToSchedule(e) {
    const item = e.currentTarget.dataset.item;
    if (item.empty || !item.isSelectable) return;

    wx.navigateTo({
      url: `/pages/schedule/schedule?date=${item.dateStr}&activityType=${this.data.activityType}`
    });
  }
});