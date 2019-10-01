browser.tabs.onRemoved.addListener(handleTabRemoved);
browser.tabs.onCreated.addListener(handleTabCreated);
browser.browserAction.onClicked.addListener(newtab);
browser.runtime.onStartup.addListener(handleStartup);
browser.runtime.onInstalled.addListener(handleInstalled);

// A Map whose keys are the cookieStoreIds of all containers managed here
// and whose values are Sets of all tabIds open in the container
let containers = new Map();
// A Map from tabIds to cookieStoreIds of all tabs managed by this extension
let tabs = new Map();

function handleStartup () {
  rebuildDatabase();
}

function handleInstalled (details) {
  // TODO if this is an update, does the data still exist?
  rebuildDatabase();
}

function isManagedContainer (container) {
  // TODO: can this match be improved?
  return container.color == "orange" && container.name == "Temp" && container.icon == "chill";
}

async function rebuildDatabase () {
  performance.mark("start rebuild");
  // TODO: if this takes awhile, the results could be inconsistent, because
  // browseraction could be used or tabs could be opened or closed
  // Wipe previous data // TODO: can there ever be any?
  containers.clear();
  tabs.clear();
  // check all extant containers
  let allContainers = await browser.contextualIdentities.query({});
  for (container of allContainers) {
    if (isManagedContainer(container)) {
      let cookieStoreId = container.cookieStoreId;
      addContainerToDb(cookieStoreId);
      // record every tab in each managed container
      // TODO: will tabs.query weirdness matter here?
      let containerTabs = await browser.tabs.query({cookieStoreId: cookieStoreId});
      for (tab of containerTabs) {
        addTabToDb(tab);
      }
    }
  }
  performance.mark("end rebuild");
  performance.measure("measure rebuild", "start rebuild", "end rebuild");
  let entry = performance.getEntriesByName("measure rebuild", "measure")[0];
  console.log("Rebuilt database in", entry.duration, "ms");
  console.log("Rebuilt database is", containers, tabs);
}

function addTabToDb (tab) {
  console.log("Recording tab", tab.id, "in container", tab.cookieStoreId);
  tabs.set(tab.id, tab.cookieStoreId);
  containers.get(tab.cookieStoreId).add(tab.id);
}

function handleTabCreated (tab) {
  let cookieStoreId = tab.cookieStoreId;
  if (containers.has(cookieStoreId)) {
    addTabToDb(tab);
  }
}

function addContainerToDb (cookieStoreId) {
  console.log("Recording temporary container: ", cookieStoreId)
  // TODO: this check should always be true
  if (!containers.has(cookieStoreId)) {
    containers.set(cookieStoreId, new Set());
  }
}

function handleTabRemoved (tabId, removeInfo) {
  if (tabs.has(tabId)) {
    let cookieStoreId = tabs.get(tabId);
    console.log("Forgetting tab", tabId, "in container", cookieStoreId);
    tabs.delete(tabId);
    cleanupContainer(cookieStoreId, tabId);
  }
}

async function cleanupContainer (cookieStoreId, tabId) {
  // checking only our internal tab database because tabs.query tends to return
  // removed tabs for some reason

  // TODO: handle unexpected cases where container not recorded or doesn't
  // record the tab
  console.log("Checking status of container", cookieStoreId);
  let containerTabs = containers.get(cookieStoreId);
  containerTabs.delete(tabId);
  console.log("Found", containerTabs.size, "remaining tabs:", containerTabs);
  if (containerTabs.size == 0) {
    containers.delete(cookieStoreId);
    await browser.contextualIdentities.remove(cookieStoreId);
    console.log("Removed & forgot empty container", cookieStoreId);
  }
  // TODO: An "Error: Invalid tab ID" is always logged after this, with the ID
  // of // the last tab removed. Is this a problem? Is it avoidable?
}

async function newtab (event) {
  let container = await browser.contextualIdentities.create({
      name: "Temp",
      color: "orange",
      icon: "chill"
  });
  addContainerToDb(container.cookieStoreId);
  let tab = await browser.tabs.create({
    cookieStoreId: container.cookieStoreId
  });
  console.log("Created new container", container.cookieStoreId, "and tab", tab.id);
}
