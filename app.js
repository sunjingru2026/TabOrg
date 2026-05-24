const SESSION_STORAGE_KEY = "taborg.sessions";
const SAVED_STORAGE_KEY = "taborg.saved";
const isExtension = typeof chrome !== "undefined" && chrome.tabs && chrome.storage;

const state = {
  tabs: [],
  sessions: [],
  saved: [],
  query: "",
  currentWindowId: null
};

const elements = {
  greeting: document.querySelector("#greeting"),
  todayLabel: document.querySelector("#todayLabel"),
  domainCount: document.querySelector("#domainCount"),
  closeAllButton: document.querySelector("#closeAllButton"),
  refreshButton: document.querySelector("#refreshButton"),
  viewTitle: document.querySelector("#viewTitle"),
  savedSection: document.querySelector("#savedSection"),
  savedCount: document.querySelector("#savedCount"),
  savedList: document.querySelector("#savedList"),
  results: document.querySelector("#results"),
  notice: document.querySelector("#notice"),
  tabTemplate: document.querySelector("#tabTemplate"),
  savedTemplate: document.querySelector("#savedTemplate")
};

async function init() {
  renderDate();
  elements.refreshButton.addEventListener("click", refresh);
  elements.closeAllButton.addEventListener("click", closeAllVisibleTabs);
  await refresh();
}

async function refresh() {
  if (!isExtension) {
    state.currentWindowId = 1;
    state.tabs = demoTabs();
    state.sessions = [];
    state.saved = demoSaved();
    render();
    return;
  }

  const [tabs, stored, currentWindow] = await Promise.all([
    chrome.tabs.query({}),
    chrome.storage.local.get([SESSION_STORAGE_KEY, SAVED_STORAGE_KEY]),
    chrome.windows.getCurrent()
  ]);

  state.currentWindowId = currentWindow.id;
  state.tabs = tabs
    .filter(tab => tab.url !== chrome.runtime.getURL("newtab.html"))
    .sort((a, b) => (a.windowId - b.windowId) || (a.index - b.index));
  state.sessions = stored[SESSION_STORAGE_KEY] || [];
  state.saved = stored[SAVED_STORAGE_KEY] || [];
  render();
}

function render() {
  const tabs = state.tabs.filter(tab => !state.query || tabMatches(tab, state.query));
  const grouped = groupByDomain(tabs);
  const entries = Object.entries(grouped).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const totalTabs = tabs.length;

  elements.domainCount.textContent = `${entries.length} domains`;
  elements.closeAllButton.textContent = `Close all ${totalTabs} tabs`;
  elements.closeAllButton.disabled = totalTabs === 0;
  renderSavedList();
  elements.results.replaceChildren();

  if (!entries.length) {
    renderEmpty("No open tabs to organize.");
    return;
  }

  entries.forEach(([domain, domainTabs]) => {
    elements.results.appendChild(createDomainCard(domain, domainTabs));
  });
}

function renderSavedList() {
  elements.savedSection.hidden = state.saved.length === 0;
  elements.savedCount.textContent = `${state.saved.length} saved`;
  elements.savedList.replaceChildren();

  const grouped = groupByDomain(state.saved);
  const entries = Object.entries(grouped).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

  entries.forEach(([domain, items]) => {
    elements.savedList.appendChild(createSavedDomainCard(domain, items));
  });
}

function createSavedDomainCard(domain, items) {
  const card = document.createElement("section");
  card.className = "domain-group saved-domain-group";

  const head = document.createElement("div");
  head.className = "domain-head";

  const title = document.createElement("h3");
  title.textContent = friendlyDomainName(domain);

  const count = document.createElement("span");
  count.className = "count-pill";
  count.textContent = `${items.length} saved`;

  head.append(title, count);

  const list = document.createElement("div");
  list.className = "tab-list";
  items.forEach(item => list.appendChild(createSavedRow(item)));

  const actions = document.createElement("div");
  actions.className = "domain-footer";

  const openAllButton = document.createElement("button");
  openAllButton.className = "ghost-button";
  openAllButton.type = "button";
  openAllButton.textContent = `Open all ${items.length}`;
  openAllButton.addEventListener("click", () => openSavedItems(items));

  const removeAllButton = document.createElement("button");
  removeAllButton.className = "danger-button";
  removeAllButton.type = "button";
  removeAllButton.textContent = `Remove all ${items.length}`;
  removeAllButton.addEventListener("click", () => removeSavedItems(items.map(item => item.url)));

  actions.append(openAllButton, removeAllButton);
  card.append(head, list, actions);
  return card;
}

function createSavedRow(item) {
  const row = elements.savedTemplate.content.firstElementChild.cloneNode(true);
  const favicon = row.querySelector(".favicon");
  const title = row.querySelector("h3");
  const url = row.querySelector("p");

  favicon.src = item.favIconUrl || fallbackFavicon(domainFromUrl(item.url));
  favicon.alt = "";
  title.textContent = item.title || "Untitled";
  url.textContent = compactUrl(item.url);

  title.addEventListener("click", () => openSavedItem(item));
  row.addEventListener("dblclick", () => openSavedItem(item));
  row.querySelector(".open-saved").addEventListener("click", () => openSavedItem(item));
  row.querySelector(".remove-saved").addEventListener("click", () => removeSavedItem(item.url));
  return row;
}

function createDomainCard(domain, tabs) {
  const card = document.createElement("section");
  card.className = "domain-group";

  const head = document.createElement("div");
  head.className = "domain-head";

  const title = document.createElement("h3");
  title.textContent = friendlyDomainName(domain);

  const count = document.createElement("span");
  count.className = "count-pill";
  count.textContent = `${tabs.length} ${tabs.length === 1 ? "tab" : "tabs"} open`;

  head.append(title, count);

  const list = document.createElement("div");
  list.className = "tab-list";
  tabs.slice(0, 18).forEach(tab => list.appendChild(createTabRow(tab)));

  const actions = document.createElement("div");
  actions.className = "domain-footer";

  const duplicateIds = getDuplicateTabIds(tabs);
  if (duplicateIds.length) {
    const duplicateButton = document.createElement("button");
    duplicateButton.className = "quiet-button";
    duplicateButton.type = "button";
    duplicateButton.textContent = `Close ${duplicateIds.length} duplicate`;
    duplicateButton.addEventListener("click", () => closeTabs(duplicateIds, `Closed ${duplicateIds.length} duplicate tabs.`));
    actions.appendChild(duplicateButton);
  }

  const closeAllButton = document.createElement("button");
  closeAllButton.className = "danger-button";
  closeAllButton.type = "button";
  closeAllButton.textContent = `Close all ${tabs.length} ${tabs.length === 1 ? "tab" : "tabs"}`;
  closeAllButton.addEventListener("click", () => closeTabs(tabs.map(tab => tab.id), `Closed ${tabs.length} tabs from ${friendlyDomainName(domain)}.`));
  actions.appendChild(closeAllButton);

  card.append(head, list, actions);
  return card;
}

function createTabRow(tab) {
  const row = elements.tabTemplate.content.firstElementChild.cloneNode(true);
  const favicon = row.querySelector(".favicon");
  const title = row.querySelector("h3");
  const url = row.querySelector("p");

  favicon.src = tab.favIconUrl || fallbackFavicon(domainFromUrl(tab.url));
  favicon.alt = "";
  title.textContent = tab.title || "Untitled";
  url.textContent = compactUrl(tab.url);

  title.addEventListener("click", event => {
    event.stopPropagation();
    focusTab(tab);
  });

  const saveButton = row.querySelector(".save-tab");
  const isSaved = isTabSaved(tab);
  saveButton.classList.toggle("saved", isSaved);
  saveButton.textContent = isSaved ? "♥" : "♡";
  saveButton.setAttribute("aria-label", isSaved ? "Remove from saved list" : "Save tab");

  row.addEventListener("dblclick", () => focusTab(tab));
  saveButton.addEventListener("click", event => {
    event.stopPropagation();
    toggleSavedTab(tab);
  });
  row.querySelector(".close-tab").addEventListener("click", event => {
    event.stopPropagation();
    closeTab(tab.id);
  });
  return row;
}

async function toggleSavedTab(tab) {
  if (isTabSaved(tab)) {
    await removeSavedItem(tab.url);
    return;
  }

  const item = {
    title: tab.title || "Untitled",
    url: tab.url,
    favIconUrl: tab.favIconUrl || "",
    savedAt: new Date().toISOString()
  };

  state.saved = [item, ...state.saved];
  await persistSavedList();
  render();
  showNotice("Saved to your list.");
}

async function removeSavedItem(url) {
  const normalized = normalizeUrl(url);
  state.saved = state.saved.filter(item => normalizeUrl(item.url) !== normalized);
  await persistSavedList();
  render();
  showNotice("Removed from saved list.");
}

async function openSavedItem(item) {
  if (!isExtension) {
    window.open(item.url, "_blank", "noopener");
    return;
  }

  await chrome.tabs.create({ url: item.url, active: true });
}

async function openSavedItems(items) {
  if (!items.length) return;

  if (!isExtension) {
    items.forEach(item => window.open(item.url, "_blank", "noopener"));
    return;
  }

  const created = await chrome.windows.create({ url: items[0].url, focused: true });
  await Promise.all(items.slice(1).map(item => chrome.tabs.create({ windowId: created.id, url: item.url, active: false })));
}

async function removeSavedItems(urls) {
  const normalizedUrls = new Set(urls.map(normalizeUrl));
  state.saved = state.saved.filter(item => !normalizedUrls.has(normalizeUrl(item.url)));
  await persistSavedList();
  render();
  showNotice(`Removed ${urls.length} saved items.`);
}

async function persistSavedList() {
  if (!isExtension) return;
  await chrome.storage.local.set({ [SAVED_STORAGE_KEY]: state.saved });
}

function isTabSaved(tab) {
  const normalized = normalizeUrl(tab.url);
  return state.saved.some(item => normalizeUrl(item.url) === normalized);
}

async function focusTab(tab) {
  if (!isExtension) return;
  await chrome.windows.update(tab.windowId, { focused: true });
  await chrome.tabs.update(tab.id, { active: true });
}

async function closeTab(tabId) {
  await closeTabs([tabId], "Closed 1 tab.");
}

async function closeTabs(tabIds, message) {
  if (!tabIds.length) return;

  if (!isExtension) {
    state.tabs = state.tabs.filter(tab => !tabIds.includes(tab.id));
    render();
    showNotice(message);
    return;
  }

  await chrome.tabs.remove(tabIds);
  await refresh();
  showNotice(message);
}

async function closeAllVisibleTabs() {
  const ids = state.tabs.map(tab => tab.id);
  await closeTabs(ids, `Closed ${ids.length} tabs.`);
}

function renderDate() {
  const now = new Date();
  const hour = now.getHours();
  let greeting = "Good evening";
  if (hour < 12) greeting = "Good morning";
  if (hour >= 12 && hour < 18) greeting = "Good afternoon";

  elements.greeting.textContent = greeting;
  elements.todayLabel.textContent = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

function groupByDomain(tabs) {
  return tabs.reduce((groups, tab) => {
    const domain = domainFromUrl(tab.url);
    groups[domain] ||= [];
    groups[domain].push(tab);
    return groups;
  }, {});
}

function getDuplicateTabIds(tabs) {
  const seen = new Map();
  const duplicateIds = [];

  tabs.forEach(tab => {
    const normalized = normalizeUrl(tab.url);
    if (!normalized) return;

    if (seen.has(normalized)) {
      duplicateIds.push(tab.id);
      return;
    }

    seen.set(normalized, tab);
  });

  return duplicateIds;
}

function tabMatches(tab, query) {
  const text = `${tab.title || ""} ${tab.url || ""} ${domainFromUrl(tab.url)}`.toLowerCase();
  return text.includes(query.toLowerCase());
}

function friendlyDomainName(domain) {
  const map = {
    "youtube.com": "YouTube",
    "github.com": "GitHub",
    "docs.google.com": "Google Docs",
    "larksuite.com": "Lark Docs",
    "feishu.cn": "Lark Docs",
    "luma.com": "Luma",
    "openai.com": "OpenAI",
    "linkedin.com": "LinkedIn"
  };

  if (map[domain]) return map[domain];
  return domain
    .split(".")
    .filter(Boolean)
    .slice(0, -1)
    .join(" ")
    .replace(/(^|\s)\S/g, letter => letter.toUpperCase()) || domain;
}

function domainFromUrl(url) {
  try {
    const { hostname, protocol } = new URL(url);
    if (!hostname) return protocol.replace(":", "");
    return hostname.replace(/^www\./, "");
  } catch {
    return "chrome";
  }
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.searchParams.sort();
    return parsed.toString();
  } catch {
    return url || "";
  }
}

function compactUrl(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
}

function fallbackFavicon(domain) {
  const letter = encodeURIComponent(friendlyDomainName(domain).slice(0, 1).toUpperCase() || "T");
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23f7eee5'/%3E%3Ctext x='16' y='21' text-anchor='middle' font-size='15' font-family='Arial' fill='%23c06a45'%3E${letter}%3C/text%3E%3C/svg%3E`;
}

function renderEmpty(message) {
  const empty = document.createElement("div");
  empty.className = "empty";
  empty.textContent = message;
  elements.results.appendChild(empty);
}

function showNotice(message) {
  elements.notice.textContent = message;
  elements.notice.hidden = false;
  window.setTimeout(() => {
    elements.notice.hidden = true;
  }, 3200);
}

function demoTabs() {
  const groups = [
    ["youtube.com", ["AIE Singapore Day 1 ft. Minister, NanoClaw, OpenAI...", "Claude Code 101", "My AI Design Workflow That Doesn't Ship Slop", "Inside How Anthropic Is Building the Next Claude"]],
    ["larksuite.com", ["智能体接入飞书任务 - 4.30 版本 - 飞书云文档", "Axon Team 2026 Weekly Report - May 18th", "飞书调研AI飞眸使用手册", "Frontend Slides Session 分析：0514-0519", "关于 agent 这件事 - 飞书云文档", "将 Claude Code 接入飞书 - CC Bridge 快速上手"]],
    ["openspec.dev", ["OpenSpec - A lightweight spec-driven framework"]],
    ["luma.com", ["Demo Day: Managing Context for Agents"]],
    ["github.com", ["VoltAgent/awesome-design-md", "nexu-io/open-design: Local-first, open-source...", "TabOrg workspace prototype"]],
    ["antigravity.google", ["Google Antigravity Download"]],
    ["insight.cn", ["飞眸 InsightTalk - 对话即洞察"]],
    ["rock-fq.workers.dev", ["飞书 slide 库 - 浏览器"]]
  ];

  let id = 1;
  return groups.flatMap(([domain, titles], groupIndex) => titles.map((title, index) => ({
    id: id++,
    title,
    url: `https://${domain}/${index ? `doc-${index}` : ""}`,
    favIconUrl: "",
    windowId: 1,
    index: groupIndex * 10 + index,
    active: id === 2
  })));
}

function demoSaved() {
  return [
    {
      title: "Demo Day: Managing Context for Agents",
      url: "https://luma.com/demo-day",
      favIconUrl: "",
      savedAt: new Date().toISOString()
    },
    {
      title: "OpenSpec - A lightweight spec-driven framework",
      url: "https://openspec.dev/",
      favIconUrl: "",
      savedAt: new Date().toISOString()
    }
  ];
}

init().catch(error => {
  console.error(error);
  renderEmpty("TabOrg could not load tab data. Try reloading the extension.");
});
