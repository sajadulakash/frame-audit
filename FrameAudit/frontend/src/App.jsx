import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  ImageOff,
  Images,
  LockKeyhole,
  LogIn,
  LogOut,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
  Wifi,
} from "lucide-react";
import shelfImage from "./assets/frameaudit-shelf.webp";

const VIEWS = {
  roles: "roles",
  annotators: "annotators",
  adminLogin: "admin-login",
  admin: "admin",
  reviewer: "reviewer",
};

const ANNOTATORS = [
  { id: "user1", label: "Rouf", folder: "Folder 01", initial: "R" },
  { id: "user2", label: "Sabina", folder: "Folder 02", initial: "S" },
  { id: "user3", label: "Sabia", folder: "Folder 03", initial: "S" },
  { id: "user4", label: "Tanisha", folder: "Folder 04", initial: "T" },
];

const LAST_IMAGE_STORAGE_PREFIX = "frame-audit:last-image:";

function routeUrl(route) {
  if (route.view === VIEWS.annotators) return "#annotators";
  if (route.view === VIEWS.adminLogin) return "#admin-login";
  if (route.view === VIEWS.admin) return "#admin";
  if (route.view === VIEWS.reviewer && route.userId) {
    return "#review-" + encodeURIComponent(route.userId);
  }
  return "#access";
}

function Brand({ compact = false }) {
  return (
    <div className={"brand" + (compact ? " brand-compact" : "")}>
      <span className="brand-symbol" aria-hidden="true">
        <ScanLine size={compact ? 20 : 24} />
      </span>
      <div>
        <strong>FrameAudit</strong>
        {!compact && <span>Annotation quality control</span>}
      </div>
    </div>
  );
}

function AccessSidebar({ activeStep }) {
  return (
    <aside className="access-sidebar">
      <Brand />

      <nav className="flow-index" aria-label="Access progress">
        {["Workspace", "Identity", "Review"].map((label, index) => {
          const step = index + 1;
          return (
            <div
              className={"flow-step" + (step === activeStep ? " is-active" : "")}
              key={label}
            >
              <span>{String(step).padStart(2, "0")}</span>
              <strong>{label}</strong>
            </div>
          );
        })}
      </nav>

      <div className="sidebar-visual" aria-hidden="true">
        <img src={shelfImage} alt="" />
        <span className="scan-corner scan-corner-one"></span>
        <span className="scan-corner scan-corner-two"></span>
      </div>

      <div className="system-status">
        <Wifi size={14} />
        <span>Local workspace</span>
        <i></i>
      </div>
    </aside>
  );
}

function AccessLayout({ activeStep, children }) {
  return (
    <div className="access-app">
      <AccessSidebar activeStep={activeStep} />
      <main className="access-content">
        <div className="mobile-brand">
          <Brand compact />
          <span><i></i> Local</span>
        </div>
        <div className="access-content-inner">{children}</div>
      </main>
    </div>
  );
}

function RolesScreen({ onAnnotator, onAdmin }) {
  return (
    <section className="screen screen-roles">
      <div className="screen-kicker">01 / Workspace</div>
      <h1>Select workspace</h1>

      <div className="choice-list">
        <button type="button" className="choice-row" onClick={onAnnotator}>
          <span className="choice-number">01</span>
          <span className="choice-icon choice-icon-green"><UsersRound /></span>
          <strong>Annotator</strong>
          <ArrowRight className="choice-arrow" />
        </button>
        <button type="button" className="choice-row" onClick={onAdmin}>
          <span className="choice-number">02</span>
          <span className="choice-icon choice-icon-amber"><ShieldCheck /></span>
          <strong>Administrator</strong>
          <ArrowRight className="choice-arrow" />
        </button>
      </div>
    </section>
  );
}

function AnnotatorsScreen({ error, onSelect }) {
  return (
    <section className="screen screen-annotators">
      <div className="screen-kicker">02 / Identity</div>
      <h1>Select annotator</h1>

      <div className="annotator-grid">
        {ANNOTATORS.map((annotator) => (
          <button
            type="button"
            className="annotator-row"
            key={annotator.id}
            onClick={() => onSelect(annotator)}
          >
            <span className="annotator-avatar">{annotator.initial}</span>
            <span className="annotator-name">
              <strong>{annotator.label}</strong>
              <small>{annotator.folder}</small>
            </span>
            <ChevronRight />
          </button>
        ))}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}

function AdminLoginScreen({ loading, error, onSubmit }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  function submit(event) {
    event.preventDefault();
    onSubmit({ username, password });
  }

  return (
    <section className="screen screen-login">
      <div className="screen-kicker">02 / Identity</div>
      <h1>Administrator</h1>

      <form className="admin-form" onSubmit={submit}>
        <label>
          <span><UserRound size={15} /> Username</span>
          <input
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </label>
        <label>
          <span><LockKeyhole size={15} /> Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <button type="submit" className="primary-button" disabled={loading}>
          <LogIn size={17} />
          {loading ? "Signing in" : "Sign in"}
        </button>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}

function AdminScreen({ message, onLogout }) {
  return (
    <section className="screen screen-admin">
      <span className="success-icon"><Check /></span>
      <div className="screen-kicker">Administrator session</div>
      <h1>{message || "Welcome Admin"}</h1>
      <button type="button" className="secondary-button" onClick={onLogout}>
        <LogOut size={16} />
        Sign out
      </button>
    </section>
  );
}

function ReviewWorkspace({
  route,
  review,
  loading,
  message,
  onPrevious,
  onNext,
  onDelete,
  onUndo,
}) {
  const currentImage = review.images[review.currentIndex] || null;
  const currentPosition = currentImage ? currentImage.number : 0;
  const progress = review.totalTrackedImages
    ? Math.min(100, Math.round((currentPosition / review.totalTrackedImages) * 100))
    : 0;

  return (
    <div className="review-app">
      <header className="review-header">
        <Brand compact />
        <div className="review-file">
          <span>{route.userLabel}</span>
          <strong>{currentImage ? currentImage.name : "No image loaded"}</strong>
        </div>
        <div className="review-header-status">
          <Activity size={15} />
          <span>{loading ? "Loading" : "Ready"}</span>
        </div>
      </header>

      <main className="review-layout">
        <section className="image-workspace">
          <div className="image-surface">
            {currentImage ? (
              <img
                src={
                  "/api/users/" +
                  route.userId +
                  "/images/" +
                  encodeURIComponent(currentImage.name)
                }
                alt={currentImage.name}
              />
            ) : (
              <div className="image-empty">
                <ImageOff />
                <span>{loading ? "Loading folder" : "No images in this folder"}</span>
              </div>
            )}

            <div className="image-pager">
              <button
                type="button"
                aria-label="Previous image"
                title="Previous image"
                disabled={!currentImage || review.currentIndex === 0}
                onClick={onPrevious}
              >
                <ChevronLeft />
              </button>
              <span>{review.images.length ? review.currentIndex + 1 : 0} / {review.images.length}</span>
              <button
                type="button"
                aria-label="Next image"
                title="Next image"
                disabled={
                  !currentImage || review.currentIndex >= review.images.length - 1
                }
                onClick={onNext}
              >
                <ChevronRight />
              </button>
            </div>
          </div>
        </section>

        <aside className="review-inspector">
          <div className="inspector-user">
            <span>{route.userLabel.charAt(0).toUpperCase()}</span>
            <div>
              <small>Annotator</small>
              <strong>{route.userLabel}</strong>
            </div>
          </div>

          <div className="inspector-section">
            <span className="inspector-label">Progress</span>
            <div className="progress-value">
              <strong>{progress}%</strong>
              <span>{currentPosition} / {review.totalTrackedImages}</span>
            </div>
            <div className="progress-track"><i style={{ width: progress + "%" }}></i></div>
          </div>

          <div className="metric-pair">
            <div>
              <Images size={16} />
              <span>Available</span>
              <strong>{review.images.length}</strong>
            </div>
            <div>
              <FolderOpen size={16} />
              <span>Tracked</span>
              <strong>{review.totalTrackedImages}</strong>
            </div>
          </div>

          <div className="inspector-spacer"></div>
          {message && <p className="review-message">{message}</p>}

          <div className="review-actions">
            <button
              type="button"
              className="undo-button"
              disabled={!review.canUndo}
              onClick={onUndo}
            >
              <RotateCcw size={17} />
              Undo
            </button>
            <button
              type="button"
              className="delete-button"
              disabled={!currentImage}
              onClick={onDelete}
            >
              <Trash2 size={17} />
              Delete image
            </button>
          </div>
        </aside>
      </main>
    </div>
  );
}

function App() {
  const [route, setRoute] = useState({ view: VIEWS.roles });
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const [adminMessage, setAdminMessage] = useState("Welcome Admin");
  const [adminError, setAdminError] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [folderError, setFolderError] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [review, setReview] = useState({
    images: [],
    currentIndex: 0,
    totalTrackedImages: 0,
    canUndo: false,
  });
  const reviewRef = useRef(review);

  useEffect(() => {
    reviewRef.current = review;
  }, [review]);

  const navigate = useCallback((nextRoute, replace = false) => {
    const payload = { frameAudit: true, ...nextRoute };
    const method = replace ? "replaceState" : "pushState";
    window.history[method](payload, "", routeUrl(nextRoute));
    setRoute(nextRoute);
  }, []);

  useEffect(() => {
    const initial = { view: VIEWS.roles };
    window.history.replaceState(
      { frameAudit: true, ...initial },
      "",
      routeUrl(initial)
    );

    function onPopState(event) {
      const nextRoute =
        event.state && event.state.frameAudit
          ? event.state
          : { view: VIEWS.roles };
      setRoute(nextRoute);
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (route.view === VIEWS.admin && !adminAuthenticated) {
      navigate({ view: VIEWS.adminLogin }, true);
    }
  }, [route.view, adminAuthenticated, navigate]);

  const applyServerState = useCallback((data, preferredName = null) => {
    setReview((previous) => {
      const storageKey = LAST_IMAGE_STORAGE_PREFIX + data.user_id;
      const storedName = window.localStorage.getItem(storageKey);
      const oldCurrentName =
        preferredName ||
        storedName ||
        previous.images[previous.currentIndex]?.name ||
        null;
      const images = data.images || [];
      let currentIndex = 0;

      if (images.length && oldCurrentName) {
        const foundIndex = images.findIndex((image) => image.name === oldCurrentName);
        currentIndex =
          foundIndex >= 0
            ? foundIndex
            : Math.min(previous.currentIndex, images.length - 1);
      }

      return {
        images,
        currentIndex,
        totalTrackedImages: data.total_tracked_images || images.length,
        canUndo: Boolean(data.can_undo),
      };
    });
    setReviewMessage(data.message || "");
  }, []);

  useEffect(() => {
    if (route.view !== VIEWS.reviewer || !route.userId) return undefined;

    const controller = new AbortController();
    setReviewLoading(true);
    setReviewMessage("");

    fetch("/api/users/" + route.userId + "/state", {
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.detail || "Failed to load review folder.");
        }
        applyServerState(data);
      })
      .catch((error) => {
        if (error.name === "AbortError") return;
        setFolderError(error.message);
        navigate({ view: VIEWS.annotators }, true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setReviewLoading(false);
      });

    return () => controller.abort();
  }, [route.view, route.userId, applyServerState, navigate]);

  useEffect(() => {
    if (route.view !== VIEWS.reviewer) return undefined;
    const currentImage = review.images[review.currentIndex];
    if (currentImage && route.userId) {
      window.localStorage.setItem(
        LAST_IMAGE_STORAGE_PREFIX + route.userId,
        currentImage.name
      );
    }

    function onKeyDown(event) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setReview((previous) => ({
          ...previous,
          currentIndex: Math.max(0, previous.currentIndex - 1),
        }));
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setReview((previous) => ({
          ...previous,
          currentIndex: Math.min(
            Math.max(0, previous.images.length - 1),
            previous.currentIndex + 1
          ),
        }));
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [route.view, route.userId, review.images, review.currentIndex]);

  async function loginAdmin(credentials) {
    setAdminLoading(true);
    setAdminError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || "Login failed.");
      }
      setAdminAuthenticated(true);
      setAdminMessage(data.message || "Welcome Admin");
      navigate({ view: VIEWS.admin });
    } catch (error) {
      setAdminError(error.message);
    } finally {
      setAdminLoading(false);
    }
  }

  async function deleteImage() {
    const current = reviewRef.current;
    const image = current.images[current.currentIndex];
    if (!image) return;

    setReviewMessage("");
    try {
      const response = await fetch(
        "/api/users/" +
          route.userId +
          "/delete/" +
          encodeURIComponent(image.name),
        { method: "POST" }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Delete failed.");
      applyServerState(data);
    } catch (error) {
      setReviewMessage(error.message);
    }
  }

  async function undoDelete() {
    setReviewMessage("");
    try {
      const response = await fetch("/api/users/" + route.userId + "/undo", {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Undo failed.");
      applyServerState(data, data.restored_name || null);
    } catch (error) {
      setReviewMessage(error.message);
    }
  }

  const activeStep = useMemo(() => {
    if (route.view === VIEWS.roles) return 1;
    if (route.view === VIEWS.admin) return 3;
    return 2;
  }, [route.view]);

  if (route.view === VIEWS.reviewer) {
    return (
      <ReviewWorkspace
        route={route}
        review={review}
        loading={reviewLoading}
        message={reviewMessage}
        onPrevious={() =>
          setReview((previous) => ({
            ...previous,
            currentIndex: Math.max(0, previous.currentIndex - 1),
          }))
        }
        onNext={() =>
          setReview((previous) => ({
            ...previous,
            currentIndex: Math.min(
              previous.images.length - 1,
              previous.currentIndex + 1
            ),
          }))
        }
        onDelete={deleteImage}
        onUndo={undoDelete}
      />
    );
  }

  return (
    <AccessLayout activeStep={activeStep}>
      {route.view === VIEWS.roles && (
        <RolesScreen
          onAnnotator={() => {
            setFolderError("");
            navigate({ view: VIEWS.annotators });
          }}
          onAdmin={() => {
            setAdminError("");
            navigate({ view: VIEWS.adminLogin });
          }}
        />
      )}

      {route.view === VIEWS.annotators && (
        <AnnotatorsScreen
          error={folderError}
          onSelect={(annotator) => {
            setFolderError("");
            navigate({
              view: VIEWS.reviewer,
              userId: annotator.id,
              userLabel: annotator.label,
            });
          }}
        />
      )}

      {route.view === VIEWS.adminLogin && (
        <AdminLoginScreen
          loading={adminLoading}
          error={adminError}
          onSubmit={loginAdmin}
        />
      )}

      {route.view === VIEWS.admin && (
        <AdminScreen
          message={adminMessage}
          onLogout={() => {
            setAdminAuthenticated(false);
            navigate({ view: VIEWS.roles }, true);
          }}
        />
      )}
    </AccessLayout>
  );
}

export default App;
