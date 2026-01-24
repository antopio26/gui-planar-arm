export class TabManager {
    constructor(onChange) {
        this.tabs = document.querySelectorAll('.tab-btn');
        this.contents = document.querySelectorAll('.tab-content');
        this.activeTab = 'cartesian';
        this.onChange = onChange; // Callback function

        this.init();
    }

    init() {
        this.tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.tab;
                this.switchTab(target);
            });
        });
    }

    switchTab(tabId) {
        if (this.activeTab === tabId) return;

        // Update Buttons
        this.tabs.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });

        // Update Content
        this.contents.forEach(content => {
            content.classList.toggle('active', content.id === `tab-${tabId}`);
        });

        this.activeTab = tabId;
        console.log(`Switched to tab: ${tabId}`);

        // Trigger callback if defined
        if (this.onChange) this.onChange(tabId);
    }
}
