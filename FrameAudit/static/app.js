const state = {
  selectedUserId: null,
  selectedUserLabel: "",
  images: [],
  currentIndex: 0,
  totalTrackedImages: 0,
};

const rolePanel = document.getElementById("rolePanel");
const userPanel = document.getElementById("userPanel");
const adminLoginPanel = document.getElementById("adminLoginPanel");
const adminPanel = document.getElementById("adminPanel");
const viewerPanel = document.getElementById("viewerPanel");
const screens = [rolePanel, userPanel, adminLoginPanel, adminPanel, viewerPanel];

const annotatorRoleButton = document.getElementById("annotatorRoleButton");
const adminRoleButton = document.getElementById("adminRoleButton");
const userButtons = document.getElementById("userButtons");
const userMessage = document.getElementById("userMessage");
const adminLoginForm = document.getElementById("adminLoginForm");
const adminUsername = document.getElementById("adminUsername");
const adminLoginButton = document.getElementById("adminLoginButton");
const adminLoginMessage = document.getElementById("adminLoginMessage");
const adminWelcomeMessage = document.getElementById("adminWelcomeMessage");
const adminLogoutButton = document.getElementById("adminLogoutButton");
const folderListButton = document.getElementById("folderListButton");
const selectedUserLabel = document.getElementById("selectedUserLabel");
const imageName = document.getElementById("imageName");
const imageCount = document.getElementById("imageCount");
const folderCount = document.getElementById("folderCount");
const imageViewer = document.getElementById("imageViewer");
const emptyState = document.getElementById("emptyState");
const messageBox = document.getElementById("messageBox");
const previousButton = document.getElementById("previousButton");
const nextButton = document.getElementById("nextButton");
const deleteButton = document.getElementById("deleteButton");
const undoButton = document.getElementById("undoButton");

const LAST_IMAGE_STORAGE_PREFIX = "frame-audit:last-image:";

function showScreen(activeScreen) {
  screens.forEach((screen) => {
    screen.hidden = screen !== activeScreen;
  });
}

function showRolePanel() {
  showScreen(rolePanel);
  adminLoginForm.reset();
  adminLoginMessage.textContent = "";
  userMessage.textContent = "";
}

function showUserPanel() {
  showScreen(userPanel);
  userMessage.textContent = "";
}

function showAdminLoginPanel() {
  showScreen(adminLoginPanel);
  adminLoginMessage.textContent = "";
  adminUsername.focus();
}

function showViewerPanel() {
  showScreen(viewerPanel);
  selectedUserLabel.textContent = state.selectedUserLabel || "FrameAudit";
  viewerPanel.focus();
}

function setMessage(message = "") {
  messageBox.textContent = message;
}

function getLastImageStorageKey() {
  return LAST_IMAGE_STORAGE_PREFIX + state.selectedUserId;
}

function getStoredImageName() {
  if (!state.selectedUserId) {
    return null;
  }
  return window.localStorage.getItem(getLastImageStorageKey());
}

function storeCurrentImageName() {
  const currentImage = state.images[state.currentIndex];
  if (!state.selectedUserId) {
    return;
  }
  if (!currentImage) {
    window.localStorage.removeItem(getLastImageStorageKey());
    return;
  }
  window.localStorage.setItem(getLastImageStorageKey(), currentImage.name);
}

function clampIndex() {
  if (state.images.length === 0) {
    state.currentIndex = 0;
  } else {
    state.currentIndex = Math.max(0, Math.min(state.currentIndex, state.images.length - 1));
  }
}

function showPreviousImage() {
  if (state.currentIndex > 0) {
    state.currentIndex -= 1;
    render();
  }
}

function showNextImage() {
  if (state.currentIndex < state.images.length - 1) {
    state.currentIndex += 1;
    render();
  }
}

function render() {
  clampIndex();

  if (state.images.length === 0) {
    imageName.textContent = "No image loaded";
    imageCount.textContent = "0 / " + state.totalTrackedImages;
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
  imageCount.textContent = currentImage.number + " / " + state.totalTrackedImages;
  folderCount.textContent = state.images.length + " in folder";
  imageViewer.src =
    "/api/users/" +
    state.selectedUserId +
    "/images/" +
    encodeURIComponent(currentImage.name) +
    "?v=" +
    Date.now();
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
    state.currentIndex =
      nextIndex >= 0 ? nextIndex : Math.min(state.currentIndex, state.images.length - 1);
  } else {
    state.currentIndex = 0;
  }

  undoButton.disabled = !data.can_undo;
  selectedUserLabel.textContent = state.selectedUserLabel || "FrameAudit";
  setMessage(data.message || "");
  render();
}

async function fetchState() {
  const response = await fetch("/api/users/" + state.selectedUserId + "/state");
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || "Failed to load images.");
  }
  applyServerState(data);
}

async function selectUser(userId, userLabel) {
  state.selectedUserId = userId;
  state.selectedUserLabel = userLabel;
  showViewerPanel();
  setMessage("Loading images...");
  await fetchState();
}

async function deleteCurrentImage() {
  const currentImage = state.images[state.currentIndex];
  if (!currentImage) {
    return;
  }

  const response = await fetch(
    "/api/users/" +
      state.selectedUserId +
      "/delete/" +
      encodeURIComponent(currentImage.name),
    { method: "POST" }
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.detail || "Failed to delete image.");
  }
  applyServerState(data);
}

async function undoDelete() {
  const response = await fetch("/api/users/" + state.selectedUserId + "/undo", {
    method: "POST",
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.detail || "Failed to undo delete.");
  }
  applyServerState(data, data.restored_name || null);
}

annotatorRoleButton.addEventListener("click", showUserPanel);
adminRoleButton.addEventListener("click", showAdminLoginPanel);

document.querySelectorAll("[data-back-to-roles]").forEach((button) => {
  button.addEventListener("click", showRolePanel);
});

userButtons.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-user-id]");
  if (!button) {
    return;
  }

  try {
    userMessage.textContent = "";
    await selectUser(button.dataset.userId, button.textContent.trim());
  } catch (error) {
    showUserPanel();
    userMessage.textContent = error.message;
  }
});

adminLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  adminLoginMessage.textContent = "";
  adminLoginButton.disabled = true;

  const formData = new FormData(adminLoginForm);
  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: formData.get("username"),
        password: formData.get("password"),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || "Login failed.");
    }

    adminWelcomeMessage.textContent = data.message || "Welcome Admin";
    adminLoginForm.reset();
    showScreen(adminPanel);
  } catch (error) {
    adminLoginMessage.textContent = error.message;
  } finally {
    adminLoginButton.disabled = false;
  }
});

adminLogoutButton.addEventListener("click", showRolePanel);
folderListButton.addEventListener("click", showUserPanel);
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

viewerPanel.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    showPreviousImage();
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    showNextImage();
  }
});

viewerPanel.addEventListener("click", () => {
  viewerPanel.focus();
});

showRolePanel();
