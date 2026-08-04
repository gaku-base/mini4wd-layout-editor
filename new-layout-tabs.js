(function attachNewLayoutTabs(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.M4WD_NEW_LAYOUT_TABS = api;
}(typeof globalThis === 'object' ? globalThis : window, () => {
  const TABS = Object.freeze([
    Object.freeze({ id: 'layout-space', label: 'レイアウトスペース', panelId: 'layoutSpacePanel' }),
    Object.freeze({ id: 'space-adjustment', label: 'スペース修正', panelId: 'spaceAdjustmentPanel' }),
    Object.freeze({ id: 'interference', label: '干渉物設定', panelId: 'interferencePanel' })
  ]);
  const DEFAULT_TAB = TABS[0].id;

  function normalizeTab(tabId) {
    return TABS.some(tab => tab.id === tabId) ? tabId : DEFAULT_TAB;
  }

  function moveTab(currentTab, direction) {
    const currentIndex = TABS.findIndex(tab => tab.id === normalizeTab(currentTab));
    const step = direction < 0 ? -1 : 1;
    return TABS[(currentIndex + step + TABS.length) % TABS.length].id;
  }

  function canStartSpaceAdjustment({ setupStarted } = {}) {
    return setupStarted === true;
  }

  function panelView(selectedTab, options) {
    const selected = normalizeTab(selectedTab);
    return {
      selected,
      tabs: TABS.map(tab => ({ ...tab, selected: tab.id === selected })),
      canAdjustSpace: canStartSpaceAdjustment(options)
    };
  }

  return Object.freeze({ TABS, DEFAULT_TAB, normalizeTab, moveTab, canStartSpaceAdjustment, panelView });
}));
