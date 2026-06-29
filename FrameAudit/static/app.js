const state = {
  selectedUserId: null,
  selectedUserLabel: "",
  images: [],
  currentIndex: 0,
  totalTrackedImages: 0,
};

const userPanel = document.getElementById("userPanel");
const userButtons = document.getElementById("userButtons");
const userMessage = document.getElementById("userMessage");
const selectedUserLabel = document.getElementById("selectedUserLabel");
const imageName = document.getElementById("imageName");
const imageCount = document.getElementById("imageCount");
const folderCount = document.getElementById("folderCount");
const imageViewer = document.getElementById("imageViewer");
const emptyState = document.getElementById("emptyState");
const messageBox = document.getElementById("messageBox");
const viewerPanel = document.getElementById("viewerPanel");
const previousButton = document.getElementById("previousButton");
const nextButton = document.getElementById("nextButton");
const deleteButton = document.getElementById("deleteButton");
const undoButton = document.getElementById("undoButton");
const LAST_IMAGE_STORAGE_PREFIX = "image-review:last-image:";
const SELECTED_USER_STORAGE_KEY = "image-review:selected-user";

function clampIndex() {
  if (state.images.length === 0) {
    state.currentIndex = 0;
    return;
  }
  if (state.currentIndex >= state.images.length) {
    state.currentIndex = state.images.length - 1;
  }
  if (state.currentIndex < 0) {
    state.currentIndex = 0;
  }
}

function setMessage(message = "") {
  messageBox.textContent = message;
}

function setUserMessage(message = "") {
  userMessage.textContent = message;
}

function getLastImageStorageKey() {
  return `${LAST_IMAGE_STORAGE_PREFIX}${state.selectedUserId}`;
}

function getStoredImageName() {
  if (!state.selectedUserId) {
    return null;
  }

  return window.localStorage.getItem(getLastImageStorageKey());
}

function storeCurrentImageName() {
  const currentImage = state.images[state.currentIndex];

  if (!currentImage) {
    if (state.selectedUserId) {
      window.localStorage.removeItem(getLastImageStorageKey());
    }
    return;
  }

  window.localStorage.setItem(getLastImageStorageKey(), currentImage.name);
}

function showUserPanel() {
  state.selectedUserId = null;
  state.selectedUserLabel = "";
  state.images = [];
  state.currentIndex = 0;
  state.totalTrackedImages = 0;
  userPanel.hidden = false;
  viewerPanel.hidden = true;
  setMessage("");
  setUserMessage("");
  window.localStorage.removeItem(SELECTED_USER_STORAGE_KEY);
}

function showViewerPanel(updateHistory = true) {
  userPanel.hidden = true;
  viewerPanel.hidden = false;
  selectedUserLabel.textContent = state.selectedUserLabel || "FrameAudit";
  if (updateHistory) {
    window.history.pushState({ userId: state.selectedUserId }, "", `#${state.selectedUserId}`);
  }
  viewerPanel.focus();
}

function showPreviousImage() {
  if (state.currentIndex <= 0) {
    return;
  }
  state.currentIndex -= 1;
  render();
}

function showNextImage() {
  if (state.images.length === 0 || state.currentIndex >= state.images.length - 1) {
    return;
  }
  state.currentIndex += 1;
  render();
}

function render() {
  clampIndex();

  if (state.images.length === 0) {
    imageName.textContent = "No image loaded";
    imageCount.textContent = `0 / ${state.totalTrackedImages}`;
    folderCount.textContent = "0 in folder";
    imageViewer.style.display = "none";
    imageViewer.removeAttribute("src");
    emptyState.style.display = "block";
    previousButton.disabled = true;
    nextButton.disabled = true;
    deleteButton.disabled = true;
    if (state.selectedUserId) {
      window.localStorage.removeItem(getLastImageStorageKey());
    }
    return;
  }

  const currentImage = state.images[state.currentIndex];
  imageName.textContent = currentImage.name;
  imageCount.textContent = `${currentImage.number} / ${state.totalTrackedImages}`;
  folderCount.textContent = `${state.images.length} in folder`;
  imageViewer.src = `/api/users/${state.selectedUserId}/images/${encodeURIComponent(currentImage.name)}?v=${Date.now()}`;
  imageViewer.style.display = "block";
  emptyState.style.display = "none";

  previousButton.disabled = state.currentIndex === 0;
  nextButton.disabled = state.currentIndex === state.images.length - 1;
  deleteButton.disabled = false;
  storeCurrentImageName();
}

function applyServerState(data, preferredName = null) {
  const oldCurrentName =
    preferredName ?? getStoredImageName() ?? state.images[state.currentIndex]?.name ?? null;
  state.selectedUserId = data.user_id || state.selectedUserId;
  state.selectedUserLabel = data.user_label || state.selectedUserLabel;
  state.images = data.images || [];
  state.totalTrackedImages = data.total_tracked_images || state.images.length;

  if (state.images.length === 0) {
    state.currentIndex = 0;
  } else if (oldCurrentName) {
    const nextIndex = state.images.findIndex((image) => image.name === oldCurrentName);
    state.currentIndex = nextIndex >= 0 ? nextIndex : Math.min(state.currentIndex, state.images.length - 1);
  } else {
    state.currentIndex = 0;
  }

  undoButton.disabled = !data.can_undo;
  selectedUserLabel.textContent = state.selectedUserLabel || "FrameAudit";
  setMessage(data.message || "");
  render();
}

async function fetchState() {
  if (!state.selectedUserId) {
    return;
  }

  const response = await fetch(`/api/users/${state.selectedUserId}/state`);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || "Failed to load images.");
  }
  const data = await response.json();
  applyServerState(data);
}

async function selectUser(userId, userLabel) {
  state.selectedUserId = userId;
  state.selectedUserLabel = userLabel;
  window.localStorage.setItem(
    SELECTED_USER_STORAGE_KEY,
    JSON.stringify({ id: userId, label: userLabel })
  );
  showViewerPanel();
  setMessage("Loading images...");
  await fetchState();
}

function getStoredUser() {
  const storedUser = window.localStorage.getItem(SELECTED_USER_STORAGE_KEY);
  if (!storedUser) {
    return null;
  }

  try {
    const parsedUser = JSON.parse(storedUser);
    if (typeof parsedUser.id === "string" && typeof parsedUser.label === "string") {
      return parsedUser;
    }
  } catch (error) {
    window.localStorage.removeItem(SELECTED_USER_STORAGE_KEY);
  }

  return null;
}

async function deleteCurrentImage() {
  const currentImage = state.images[state.currentIndex];
  if (!currentImage) {
    return;
  }

  const response = await fetch(`/api/users/${state.selectedUserId}/delete/${encodeURIComponent(currentImage.name)}`, {
    method: "POST",
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Failed to delete image.");
  }

  applyServerState(data);
}

async function undoDelete() {
  const response = await fetch(`/api/users/${state.selectedUserId}/undo`, { method: "POST" });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Failed to undo delete.");
  }

  applyServerState(data, data.restored_name || null);
}

userButtons.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-user-id]");
  if (!button) {
    return;
  }

  try {
    setUserMessage("");
    await selectUser(button.dataset.userId, button.textContent.trim());
  } catch (error) {
    showUserPanel();
    setUserMessage(error.message);
  }
});

previousButton.addEventListener("click", showPreviousImage);

nextButton.addEventListener("click", showNextImage);

deleteButton.addEventListener("click", async () => {
  try {
    setMessage("");
    await deleteCurrentImage();
  } catch (error) {
    setMessage(error.message);
  }
});

undoButton.addEventListener("click", async () => {
  try {
    setMessage("");
    await undoDelete();
  } catch (error) {
    setMessage(error.message);
  }
});

function handleKeyboardNavigation(event) {
  if (state.images.length === 0) {
    return;
  }

  if (event.key === "ArrowLeft" || event.key === "Left") {
    event.preventDefault();
    showPreviousImage();
  }

  if (event.key === "ArrowRight" || event.key === "Right") {
    event.preventDefault();
    showNextImage();
  }
}

viewerPanel.addEventListener("keydown", handleKeyboardNavigation);
viewerPanel.addEventListener("click", () => {
  viewerPanel.focus();
});

folderCount.textContent = "0 in folder";

window.addEventListener("popstate", () => {
  showUserPanel();
});

const storedUser = getStoredUser();
if (storedUser) {
  selectUser(storedUser.id, storedUser.label).catch((error) => {
    showUserPanel();
    setUserMessage(error.message);
  });
} else {
  showUserPanel();
}
