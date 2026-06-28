/* main.js - 改进版 */
const { Plugin, ItemView, PluginSettingTab, Setting, Notice } = require('obsidian');

const VIEW_TYPE_COUNTDOWN = "countdown-dashboard-view";

const DEFAULT_SETTINGS = {
    events: []
}

const LUNAR_DATE_CACHE = new Map();

function formatChineseLunarDay(day) {
    const dayNames = [
        '', '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
        '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
        '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'
    ];
    return dayNames[day] || String(day);
}

function parseDateInput(dateStr) {
    const match = String(dateStr).trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2}))?)?$/);
    if (!match) {
        return null;
    }

    return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
        hour: Number(match[4] || 0),
        minute: Number(match[5] || 0)
    };
}

function getLunarParts(date) {
    const formatter = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    const parts = formatter.formatToParts(date);
    const relatedYear = Number(parts.find(part => part.type === 'relatedYear')?.value);
    const yearName = parts.find(part => part.type === 'yearName')?.value || '';
    const monthText = parts.find(part => part.type === 'month')?.value || '';
    const day = Number(parts.find(part => part.type === 'day')?.value);
    const monthMap = {
        '正月': 1, '一月': 1, '二月': 2, '三月': 3, '四月': 4, '五月': 5, '六月': 6,
        '七月': 7, '八月': 8, '九月': 9, '十月': 10, '冬月': 11, '十一月': 11, '腊月': 12, '十二月': 12
    };
    const cleanMonthText = monthText.replace(/^闰/, '');

    return {
        relatedYear,
        yearName,
        month: monthMap[cleanMonthText],
        monthText,
        day,
        isLeapMonth: monthText.startsWith('闰')
    };
}

function findGregorianByLunar(lunarDateStr, lunarYearOverride = null) {
    try {
        const input = parseDateInput(lunarDateStr);
        if (!input || input.month < 1 || input.month > 12 || input.day < 1 || input.day > 30) {
            return null;
        }

        const lunarYear = lunarYearOverride || input.year;
        const cacheKey = `${lunarYear}-${input.month}-${input.day}-${input.hour}-${input.minute}`;
        if (LUNAR_DATE_CACHE.has(cacheKey)) {
            const cachedDate = LUNAR_DATE_CACHE.get(cacheKey);
            return cachedDate ? new Date(cachedDate) : null;
        }

        const scanStart = new Date(lunarYear, 0, 1);
        const scanEnd = new Date(lunarYear + 1, 2, 1);

        for (let cursor = new Date(scanStart); cursor <= scanEnd; cursor.setDate(cursor.getDate() + 1)) {
            const lunar = getLunarParts(cursor);
            if (
                lunar.relatedYear === lunarYear &&
                lunar.month === input.month &&
                lunar.day === input.day &&
                !lunar.isLeapMonth
            ) {
                const result = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), input.hour, input.minute);
                LUNAR_DATE_CACHE.set(cacheKey, result.getTime());
                return result;
            }
        }

        LUNAR_DATE_CACHE.set(cacheKey, null);
        return null;
    } catch (error) {
        return null;
    }
}

// 辅助函数：格式化农历日期。Electron/Chromium 支持 zh-CN-u-ca-chinese 时可直接使用。
function formatLunarDate(date) {
    try {
        const formatter = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        if (typeof formatter.formatToParts === 'function') {
            const parts = formatter.formatToParts(date);
            const yearName = parts.find(part => part.type === 'yearName')?.value;
            const month = parts.find(part => part.type === 'month')?.value;
            const day = Number(parts.find(part => part.type === 'day')?.value);

            if (yearName && month && day) {
                return `${yearName}年${month}${formatChineseLunarDay(day)}`;
            }
        }
        return formatter.format(date);
    } catch (error) {
        return '';
    }
}

// 辅助函数：计算循环日期的下一次发生时间
function getNextOccurrence(baseDateStr, repeatType) {
    const baseDate = new Date(baseDateStr);
    const now = new Date();
    
    // 如果还没到时间，或者不循环，直接返回原日期
    if (baseDate > now || !repeatType || repeatType === 'none') {
        return baseDate;
    }

    let nextDate = new Date(baseDate);
    // 循环增加时间直到未来
    while (nextDate <= now) {
        if (repeatType === 'yearly') {
            nextDate.setFullYear(nextDate.getFullYear() + 1);
        } else if (repeatType === 'monthly') {
            nextDate.setMonth(nextDate.getMonth() + 1);
        } else if (repeatType === 'weekly') {
            nextDate.setDate(nextDate.getDate() + 7);
        } else {
            break; // 兜底防死循环
        }
    }
    return nextDate;
}

function getEventTargetDate(event) {
    if (event.calendar !== 'lunar') {
        return getNextOccurrence(event.date, event.repeat);
    }

    const baseDate = findGregorianByLunar(event.date);
    if (!baseDate) {
        return null;
    }

    if (event.repeat === 'yearly') {
        const input = parseDateInput(event.date);
        const now = new Date();
        let nextDate = findGregorianByLunar(event.date, now.getFullYear());

        if (!nextDate || nextDate <= now) {
            nextDate = findGregorianByLunar(event.date, now.getFullYear() + 1);
        }

        if (nextDate) {
            nextDate.setHours(input.hour, input.minute, 0, 0);
        }
        return nextDate;
    }

    return getNextOccurrence(baseDate, event.repeat);
}

// 视图类：负责显示
class CountdownView extends ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.timerInterval = null;
    }

    getViewType() {
        return VIEW_TYPE_COUNTDOWN;
    }

    getDisplayText() {
        return "倒计时看板";
    }

    getIcon() {
        return "clock";
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('countdown-container');

        this.renderCountdowns(container);

        // 每秒刷新
        this.timerInterval = window.setInterval(() => {
            this.renderCountdowns(container);
        }, 1000);
    }

    async onClose() {
        if (this.timerInterval) {
            window.clearInterval(this.timerInterval);
        }
    }

    renderCountdowns(container) {
        container.empty();
        const events = this.plugin.settings.events;

        if (events.length === 0) {
            const emptyEl = container.createEl("div");
            emptyEl.setText("还没有倒计时，请在插件设置中添加。");
            emptyEl.style.color = "var(--text-muted)";
            emptyEl.style.textAlign = "center";
            emptyEl.style.marginTop = "20px";
            return;
        }

        const now = new Date().getTime();

        events.forEach(event => {
            // 获取目标时间（包含循环逻辑）
            const targetDate = getEventTargetDate(event);
            if (!targetDate || isNaN(targetDate.getTime())) {
                const card = container.createEl("div", { cls: "countdown-card" });
                card.createEl("h3", { text: event.name, cls: "countdown-title" });
                card.createEl("div", { text: "日期格式错误", cls: "countdown-time finished" });
                card.createEl("small", { text: `原始日期: ${event.date}`, cls: "countdown-date-hint" });
                return;
            }
            const targetTime = targetDate.getTime();
            const diff = targetTime - now;

            const card = container.createEl("div", { cls: "countdown-card" });
            
            // 标题：如果是循环事件，加上小图标提示
            let titleText = event.name;
            if (event.repeat && event.repeat !== 'none') {
                const repeatLabels = { 'weekly': '🔁', 'monthly': '🔁', 'yearly': '🔁' };
                titleText += ` ${repeatLabels[event.repeat] || ''}`;
            }
            card.createEl("h3", { text: titleText, cls: "countdown-title" });

            if (diff <= 0) {
                card.createEl("div", { text: "时间到！🎉", cls: "countdown-time finished" });
            } else {
                const totalDays = diff / (1000 * 60 * 60 * 24);
                const totalHours = diff / (1000 * 60 * 60);
                
                const days = Math.floor(totalDays);
                const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((diff % (1000 * 60)) / 1000);
                
                let timeString = "";
                const format = event.format || 'all';

                // 根据用户选择的格式进行渲染
                switch(format) {
                    case 'year':
                        timeString = `还有 ${(totalDays / 365.25).toFixed(1)} 年`;
                        break;
                    case 'month':
                        timeString = `还有 ${(totalDays / 30.44).toFixed(1)} 个月`;
                        break;
                    case 'day':
                        timeString = `还有 ${Math.ceil(totalDays)} 天`; // 向上取整，不足一天算一天
                        break;
                    case 'hour':
                        timeString = `还有 ${Math.ceil(totalHours)} 小时`;
                        break;
                    default: // 'all'
                        timeString = `${days}天 ${hours}时 ${minutes}分 ${seconds}秒`;
                }

                card.createEl("div", { text: timeString, cls: "countdown-time" });
            }
            
            // 底部时间提示更新为具体的“下一次目标日期”
            const dateHint = `${targetDate.getFullYear()}-${String(targetDate.getMonth()+1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')} ${String(targetDate.getHours()).padStart(2, '0')}:${String(targetDate.getMinutes()).padStart(2, '0')}`;
            card.createEl("small", { text: `目标日期: ${dateHint}`, cls: "countdown-date-hint" });
            const lunarHint = formatLunarDate(targetDate);
            if (lunarHint) {
                card.createEl("small", { text: `农历: ${lunarHint}`, cls: "countdown-lunar-hint" });
            }
        });
    }
}

// 设置面板类：负责输入数据
class CountdownSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: '倒计时管理' });

        // 初始化表单默认值
        this.newRepeat = 'none';
        this.newFormat = 'all';
        this.newCalendar = 'solar';
        this.newName = '';
        this.newDate = '';

        // 添加区域（新增了两个下拉菜单）
        const addSetting = new Setting(containerEl)
            .setName('添加新倒计时')
            .setDesc('设置名称、日期、历法、循环周期和显示格式')
            .addText(text => text
                .setPlaceholder('事件名称')
                .onChange(value => this.newName = value))
            .addText(text => text
                .setPlaceholder('日期 (如 2026-06-07)')
                .onChange(value => this.newDate = value))
            .addDropdown(drop => drop
                .addOption('solar', '公历')
                .addOption('lunar', '农历')
                .setValue('solar')
                .onChange(value => this.newCalendar = value))
            .addDropdown(drop => drop
                .addOption('none', '不循环')
                .addOption('weekly', '每周')
                .addOption('monthly', '每月')
                .addOption('yearly', '每年')
                .setValue('none')
                .onChange(value => this.newRepeat = value))
            .addDropdown(drop => drop
                .addOption('all', '完整格式')
                .addOption('year', '仅显示年')
                .addOption('month', '仅显示月')
                .addOption('day', '仅显示日')
                .addOption('hour', '仅显示时')
                .setValue('all')
                .onChange(value => this.newFormat = value))
            .addButton(btn => {
                btn.setButtonText("添加")
                   .setCta()
                   .onClick(async () => {
                       if (!this.newName || !this.newDate) {
                           new Notice("请填写完整信息");
                           return;
                       }
                       if (this.newCalendar === 'lunar') {
                           if (!findGregorianByLunar(this.newDate)) {
                               new Notice("农历日期格式错误或无法转换");
                               return;
                           }
                       } else if (isNaN(Date.parse(this.newDate))) {
                           new Notice("日期格式错误");
                           return;
                       }
                       this.plugin.settings.events.push({
                           id: Date.now().toString(),
                           name: this.newName,
                           date: this.newDate,
                           calendar: this.newCalendar,
                           repeat: this.newRepeat,
                           format: this.newFormat
                       });
                       await this.plugin.saveSettings();
                       this.display(); // 刷新界面
                       new Notice("已添加");
                   });
            });
            
        // 防止新增的组件挤在一起导致换行错乱
        addSetting.settingEl.style.flexWrap = 'wrap';

        // 列表区域
        containerEl.createEl('h3', { text: '已添加的倒计时' });
        
        const formatLabels = { 'all': '完整', 'year': '年', 'month': '月', 'day': '日', 'hour': '时' };
        const repeatLabels = { 'none': '不循环', 'weekly': '每周', 'monthly': '每月', 'yearly': '每年' };
        const calendarLabels = { 'solar': '公历', 'lunar': '农历' };

        this.plugin.settings.events.forEach((event, index) => {
            const desc = `起算点: ${event.date} | 历法: ${calendarLabels[event.calendar || 'solar']} | 循环: ${repeatLabels[event.repeat || 'none']} | 格式: ${formatLabels[event.format || 'all']}`;
            new Setting(containerEl)
                .setName(event.name)
                .setDesc(desc)
                .addButton(btn => btn
                    .setButtonText("删除")
                    .setWarning()
                    .onClick(async () => {
                        this.plugin.settings.events.splice(index, 1);
                        await this.plugin.saveSettings();
                        this.display();
                    }));
        });
    }
}

// 主插件类
module.exports = class CountdownPlugin extends Plugin {
    async onload() {
        await this.loadSettings();

        this.registerView(
            VIEW_TYPE_COUNTDOWN,
            (leaf) => new CountdownView(leaf, this)
        );

        this.addRibbonIcon('clock', '打开倒计时', () => {
            this.activateView();
        });

        this.addSettingTab(new CountdownSettingTab(this.app, this));
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async activateView() {
        const { workspace } = this.app;
        let leaf = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_COUNTDOWN);

        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            leaf = workspace.getRightLeaf(false);
            await leaf.setViewState({ type: VIEW_TYPE_COUNTDOWN, active: true });
        }
        workspace.revealLeaf(leaf);
    }
}
