/* main.js - 已编译版本 */
const { Plugin, ItemView, PluginSettingTab, Setting, Notice } = require('obsidian');

const VIEW_TYPE_COUNTDOWN = "countdown-dashboard-view";

const DEFAULT_SETTINGS = {
    events: []
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
            const targetTime = new Date(event.date).getTime();
            const diff = targetTime - now;

            const card = container.createEl("div", { cls: "countdown-card" });
            card.createEl("h3", { text: event.name, cls: "countdown-title" });

            if (diff <= 0) {
                card.createEl("div", { text: "时间到！🎉", cls: "countdown-time finished" });
            } else {
                const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((diff % (1000 * 60)) / 1000);
                
                const timeString = `${days}天 ${hours}时 ${minutes}分 ${seconds}秒`;
                card.createEl("div", { text: timeString, cls: "countdown-time" });
            }
            card.createEl("small", { text: event.date, cls: "countdown-date-hint" });
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

        // 添加区域
        new Setting(containerEl)
            .setName('添加新倒计时')
            .setDesc('格式：YYYY-MM-DD HH:MM')
            .addText(text => text
                .setPlaceholder('事件名称')
                .onChange(value => this.newName = value))
            .addText(text => text
                .setPlaceholder('日期 (2026-06-07)')
                .onChange(value => this.newDate = value))
            .addButton(btn => {
                btn.setButtonText("添加")
                   .setCta()
                   .onClick(async () => {
                       if (!this.newName || !this.newDate) {
                           new Notice("请填写完整信息");
                           return;
                       }
                       if (isNaN(Date.parse(this.newDate))) {
                           new Notice("日期格式错误");
                           return;
                       }
                       this.plugin.settings.events.push({
                           id: Date.now().toString(),
                           name: this.newName,
                           date: this.newDate
                       });
                       await this.plugin.saveSettings();
                       this.display(); // 刷新界面
                       new Notice("已添加");
                   });
            });

        // 列表区域
        containerEl.createEl('h3', { text: '列表' });
        this.plugin.settings.events.forEach((event, index) => {
            new Setting(containerEl)
                .setName(event.name)
                .setDesc(event.date)
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

        // 注册视图
        this.registerView(
            VIEW_TYPE_COUNTDOWN,
            (leaf) => new CountdownView(leaf, this)
        );

        // 左侧添加一个小图标（丝带图标）
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