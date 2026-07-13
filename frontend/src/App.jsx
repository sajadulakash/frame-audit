import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  HardDrive,
  ImageOff,
  Images,
  LockKeyhole,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  ScanLine,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
  Wifi,
  X,
} from "lucide-react";
import shelfImage from "./assets/frameaudit-shelf.webp";

const VIEWS = {
  roles: "roles",
  annotators: "annotators",
  tasks: "tasks",
  adminLogin: "admin-login",
  admin: "admin",
  reviewer: "reviewer",
};

const LAST_IMAGE_STORAGE_PREFIX = "frame-audit:last-image:";

function routeUrl(route) {
  if (route.view === VIEWS.annotators) return "#annotators";
  if (route.view === VIEWS.tasks && route.userId) return "#tasks-" + encodeURIComponent(route.userId);
  if (route.view === VIEWS.adminLogin) return "#admin-login";
  if (route.view === VIEWS.admin) return "#admin";
  if (route.view === VIEWS.reviewer && route.userId && route.taskId) {
    return "#review-" + encodeURIComponent(route.userId) + "-" + encodeURIComponent(route.taskId);
  }
  return "#access";
}

function parseHashRoute(hash) {
  const value = (hash || "").replace(/^#/, "");
  if (value === "annotators") return { view: VIEWS.annotators };
  if (value.startsWith("tasks-")) return { view: VIEWS.tasks, userId: decodeURIComponent(value.slice(6)), userLabel: "" };
  if (value === "admin-login") return { view: VIEWS.adminLogin };
  if (value === "admin") return { view: VIEWS.admin };
  if (value.startsWith("review-")) {
    const parts = value.slice(7).split("-");
    if (parts.length >= 2) {
      return { view: VIEWS.reviewer, userId: decodeURIComponent(parts[0]), taskId: decodeURIComponent(parts.slice(1).join("-")), userLabel: "", taskLabel: "" };
    }
  }
  return { view: VIEWS.roles };
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
        {["Workspace", "Identity", "Task"].map((label, index) => {
          const step = index + 1;
          return (
            <div className={"flow-step" + (step === activeStep ? " is-active" : "")} key={label}>
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

function AccessLayout({ activeStep, wide = false, children }) {
  return (
    <div className="access-app">
      <AccessSidebar activeStep={activeStep} />
      <main className="access-content">
        <div className="mobile-brand">
          <Brand compact />
          <span><i></i> Local</span>
        </div>
        <div className={"access-content-inner" + (wide ? " is-wide" : "")}>{children}</div>
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

function AnnotatorsScreen({ annotators, loading, error, onSelect }) {
  return (
    <section className="screen screen-annotators">
      <div className="screen-kicker">02 / Identity</div>
      <h1>Select Your Name</h1>
      {loading ? (
        <div className="annotator-loading">Loading annotators...</div>
      ) : annotators.length ? (
        <div className="annotator-grid">
          {annotators.map((annotator) => (
            <button type="button" className="annotator-row" key={annotator.id} onClick={() => onSelect(annotator)}>
              <span className="annotator-avatar">{annotator.label.charAt(0).toUpperCase()}</span>
              <span className="annotator-name">
                <strong>{annotator.label}</strong>
                <small>{annotator.task_count || 0} task{annotator.task_count === 1 ? "" : "s"}</small>
              </span>
              <ChevronRight />
            </button>
          ))}
        </div>
      ) : (
        <div className="annotator-empty"><UsersRound /><strong>No annotators assigned</strong></div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}

function TasksScreen({ userLabel, tasks, loading, error, onBack, onSelect }) {
  return (
    <section className="screen screen-tasks">
      <button type="button" className="back-button" onClick={onBack}><ChevronLeft size={16} />Annotators</button>
      <div className="screen-kicker">03 / Task</div>
      <h1>{userLabel || "Tasks"}</h1>
      {loading ? (
        <div className="annotator-loading">Loading tasks...</div>
      ) : tasks.length ? (
        <div className="task-choice-list">
          {tasks.map((task) => (
            <button type="button" className="task-choice-row" key={task.id} onClick={() => onSelect(task)}>
              <span className="choice-icon choice-icon-green"><FolderOpen /></span>
              <span className="task-choice-main">
                <strong>{task.label}</strong>
                <small>{task.image_count} image{task.image_count === 1 ? "" : "s"}</small>
              </span>
              <span className={"task-status-dot" + (task.folder_exists ? " is-online" : "")}></span>
              <ChevronRight />
            </button>
          ))}
        </div>
      ) : (
        <div className="annotator-empty"><FolderOpen /><strong>No tasks assigned</strong></div>
      )}
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
          <input autoComplete="username" autoFocus value={username} onChange={(event) => setUsername(event.target.value)} required />
        </label>
        <label>
          <span><LockKeyhole size={15} /> Password</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
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

function parseDeleteLabels(value) {
  return value
    .split(/[\n,]+/)
    .map((label) => label.trim())
    .filter(Boolean);
}

function formatDeleteLabels(labels) {
  return (labels || []).join("\n");
}

function emptyTaskForm() {
  return { name: "", folderPath: "", deleteLabels: "" };
}

function AdminScreen({ token, onSessionExpired, onLogout }) {
  const [annotators, setAnnotators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [createName, setCreateName] = useState("");
  const [editingAnnotatorId, setEditingAnnotatorId] = useState(null);
  const [editingAnnotatorName, setEditingAnnotatorName] = useState("");
  const [taskForms, setTaskForms] = useState({});
  const [editingTask, setEditingTask] = useState(null);
  const [editTaskForm, setEditTaskForm] = useState(emptyTaskForm());

  const adminRequest = useCallback(async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      onSessionExpired(data.detail || "Admin session expired.");
      throw new Error(data.detail || "Admin session expired.");
    }
    if (!response.ok) throw new Error(data.detail || "Admin request failed.");
    return data;
  }, [token, onSessionExpired]);

  const loadAnnotators = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await adminRequest("/api/admin/annotators");
      setAnnotators(data.annotators || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [adminRequest]);

  useEffect(() => { loadAnnotators(); }, [loadAnnotators]);

  function taskFormFor(annotatorId) {
    return taskForms[annotatorId] || emptyTaskForm();
  }

  function updateTaskForm(annotatorId, patch) {
    setTaskForms((current) => ({
      ...current,
      [annotatorId]: { ...emptyTaskForm(), ...(current[annotatorId] || {}), ...patch },
    }));
  }

  async function createAnnotator(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const annotator = await adminRequest("/api/admin/annotators", {
        method: "POST",
        body: JSON.stringify({ name: createName }),
      });
      setAnnotators((current) => [...current, annotator]);
      setCreateName("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  function beginAnnotatorEdit(annotator) {
    setEditingAnnotatorId(annotator.id);
    setEditingAnnotatorName(annotator.name);
    setError("");
  }

  async function saveAnnotatorEdit(annotatorId) {
    setSaving(true);
    setError("");
    try {
      const updated = await adminRequest("/api/admin/annotators/" + annotatorId, {
        method: "PATCH",
        body: JSON.stringify({ name: editingAnnotatorName }),
      });
      setAnnotators((current) => current.map((item) => item.id === annotatorId ? updated : item));
      setEditingAnnotatorId(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeAnnotator(annotator) {
    if (!window.confirm("Remove " + annotator.name + " and all assigned tasks?")) return;
    setSaving(true);
    setError("");
    try {
      await adminRequest("/api/admin/annotators/" + annotator.id, { method: "DELETE" });
      setAnnotators((current) => current.filter((item) => item.id !== annotator.id));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function createTask(event, annotatorId) {
    event.preventDefault();
    const form = taskFormFor(annotatorId);
    setSaving(true);
    setError("");
    try {
      const task = await adminRequest("/api/admin/annotators/" + annotatorId + "/tasks", {
        method: "POST",
        body: JSON.stringify({ name: form.name, folder_path: form.folderPath, delete_labels: parseDeleteLabels(form.deleteLabels) }),
      });
      setAnnotators((current) => current.map((annotator) => annotator.id === annotatorId ? {
        ...annotator,
        task_count: annotator.task_count + 1,
        image_count: annotator.image_count + task.image_count,
        tasks: [...annotator.tasks, task],
      } : annotator));
      updateTaskForm(annotatorId, emptyTaskForm());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  function beginTaskEdit(annotatorId, task) {
    setEditingTask({ annotatorId, taskId: task.id });
    setEditTaskForm({ name: task.name, folderPath: task.folder_path, deleteLabels: formatDeleteLabels(task.delete_labels) });
    setError("");
  }

  async function saveTaskEdit() {
    if (!editingTask) return;
    setSaving(true);
    setError("");
    try {
      const updated = await adminRequest("/api/admin/annotators/" + editingTask.annotatorId + "/tasks/" + editingTask.taskId, {
        method: "PATCH",
        body: JSON.stringify({ name: editTaskForm.name, folder_path: editTaskForm.folderPath, delete_labels: parseDeleteLabels(editTaskForm.deleteLabels) }),
      });
      setAnnotators((current) => current.map((annotator) => {
        if (annotator.id !== editingTask.annotatorId) return annotator;
        const tasks = annotator.tasks.map((task) => task.id === editingTask.taskId ? updated : task);
        return { ...annotator, tasks, image_count: tasks.reduce((total, task) => total + task.image_count, 0) };
      }));
      setEditingTask(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeTask(annotatorId, task) {
    if (!window.confirm("Remove task " + task.name + "?")) return;
    setSaving(true);
    setError("");
    try {
      await adminRequest("/api/admin/annotators/" + annotatorId + "/tasks/" + task.id, { method: "DELETE" });
      setAnnotators((current) => current.map((annotator) => {
        if (annotator.id !== annotatorId) return annotator;
        const tasks = annotator.tasks.filter((item) => item.id !== task.id);
        return { ...annotator, tasks, task_count: tasks.length, image_count: tasks.reduce((total, item) => total + item.image_count, 0) };
      }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="screen screen-admin-management">
      <header className="admin-heading">
        <div><div className="screen-kicker">03 / Manage</div><h1>Annotators</h1></div>
        <button type="button" className="icon-text-button" onClick={onLogout}><LogOut size={16} />Sign out</button>
      </header>

      <form className="annotator-name-form" onSubmit={createAnnotator}>
        <label><span>Annotator name</span><input value={createName} onChange={(event) => setCreateName(event.target.value)} placeholder="Annotator name" required /></label>
        <button type="submit" className="primary-button" disabled={saving}><Plus size={17} />Add annotator</button>
      </form>

      {error && <p className="admin-error" role="alert"><AlertCircle size={16} />{error}</p>}

      <div className="admin-annotator-cards">
        {loading ? (
          <div className="admin-empty-row">Loading annotators...</div>
        ) : annotators.length === 0 ? (
          <div className="admin-empty-row"><UsersRound /><strong>No annotators configured</strong></div>
        ) : annotators.map((annotator) => {
          const form = taskFormFor(annotator.id);
          const isEditingAnnotator = editingAnnotatorId === annotator.id;
          return (
            <article className="admin-annotator-card" key={annotator.id}>
              <header className="annotator-card-header">
                {isEditingAnnotator ? (
                  <input aria-label="Annotator name" value={editingAnnotatorName} onChange={(event) => setEditingAnnotatorName(event.target.value)} />
                ) : (
                  <div className="admin-person"><span>{annotator.name.charAt(0).toUpperCase()}</span><div><strong>{annotator.name}</strong><small>{annotator.task_count} task{annotator.task_count === 1 ? "" : "s"} / {annotator.image_count} images</small></div></div>
                )}
                <div className="row-actions">
                  {isEditingAnnotator ? (
                    <>
                      <button type="button" aria-label="Save annotator" title="Save annotator" disabled={saving} onClick={() => saveAnnotatorEdit(annotator.id)}><Save /></button>
                      <button type="button" aria-label="Cancel editing" title="Cancel editing" onClick={() => setEditingAnnotatorId(null)}><X /></button>
                    </>
                  ) : (
                    <>
                      <button type="button" aria-label={"Edit " + annotator.name} title="Edit annotator" onClick={() => beginAnnotatorEdit(annotator)}><Pencil /></button>
                      <button type="button" className="remove-row-button" aria-label={"Remove " + annotator.name} title="Remove annotator" disabled={saving} onClick={() => removeAnnotator(annotator)}><Trash2 /></button>
                    </>
                  )}
                </div>
              </header>

              <form className="task-create-form" onSubmit={(event) => createTask(event, annotator.id)}>
                <label><span>Task name</span><input value={form.name} onChange={(event) => updateTaskForm(annotator.id, { name: event.target.value })} placeholder="Task name" required /></label>
                <label><span>Assigned folder path</span><input value={form.folderPath} onChange={(event) => updateTaskForm(annotator.id, { folderPath: event.target.value })} placeholder="/absolute/path/to/image-folder" required /></label>
                <label><span>Instructions</span><textarea value={form.deleteLabels} onChange={(event) => updateTaskForm(annotator.id, { deleteLabels: event.target.value })} placeholder="Write task instructions for annotators" /></label>
                <button type="submit" className="primary-button" disabled={saving}><Plus size={17} />Add task</button>
              </form>

              <div className="task-list">
                {annotator.tasks.length === 0 ? (
                  <div className="task-empty-row">No tasks assigned</div>
                ) : annotator.tasks.map((task) => {
                  const isEditingTask = editingTask?.annotatorId === annotator.id && editingTask?.taskId === task.id;
                  return (
                    <div className={"task-row" + (isEditingTask ? " is-editing" : "")} key={task.id}>
                      {isEditingTask ? (
                        <>
                          <input aria-label="Task name" value={editTaskForm.name} onChange={(event) => setEditTaskForm((current) => ({ ...current, name: event.target.value }))} />
                          <input aria-label="Assigned folder path" value={editTaskForm.folderPath} onChange={(event) => setEditTaskForm((current) => ({ ...current, folderPath: event.target.value }))} />
                          <textarea aria-label="Instructions" value={editTaskForm.deleteLabels} onChange={(event) => setEditTaskForm((current) => ({ ...current, deleteLabels: event.target.value }))} />
                          <span className="inline-image-count">{task.image_count}</span>
                          <div className="row-actions">
                            <button type="button" aria-label="Save task" title="Save task" disabled={saving} onClick={saveTaskEdit}><Save /></button>
                            <button type="button" aria-label="Cancel editing" title="Cancel editing" onClick={() => setEditingTask(null)}><X /></button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="task-name-cell"><FolderOpen size={16} /><div><strong>{task.name}</strong>{task.delete_labels?.length > 0 && <div className="label-chip-list">{task.delete_labels.map((label) => <span key={label}>{label}</span>)}</div>}</div></div>
                          <div className="admin-folder" title={task.folder_path}><HardDrive /><span>{task.folder_path}</span><i className={task.folder_exists ? "is-online" : ""}></i></div>
                          <strong className="admin-image-count">{task.image_count}</strong>
                          <div className="row-actions">
                            <button type="button" aria-label={"Edit " + task.name} title="Edit task" onClick={() => beginTaskEdit(annotator.id, task)}><Pencil /></button>
                            <button type="button" className="remove-row-button" aria-label={"Remove " + task.name} title="Remove task" disabled={saving} onClick={() => removeTask(annotator.id, task)}><Trash2 /></button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ReviewWorkspace({ route, review, loading, message, onPrevious, onNext, onDelete, onUndo }) {
  const [zoom, setZoom] = useState(1);
  const currentImage = review.images[review.currentIndex] || null;
  const currentPosition = currentImage ? currentImage.number : 0;
  const progress = review.totalTrackedImages ? Math.min(100, Math.round((currentPosition / review.totalTrackedImages) * 100)) : 0;
  const instructions = review.deleteLabels || [];
  const instructionsKey = "frame-audit:instructions:" + route.userId + ":" + route.taskId;
  const [checkedInstructions, setCheckedInstructions] = useState(() => new Set());

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(instructionsKey) || "[]");
      setCheckedInstructions(new Set(Array.isArray(stored) ? stored : []));
    } catch {
      setCheckedInstructions(new Set());
    }
  }, [instructionsKey]);

  function toggleInstruction(label) {
    setCheckedInstructions((previous) => {
      const next = new Set(previous);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      window.localStorage.setItem(instructionsKey, JSON.stringify([...next]));
      return next;
    });
  }

  useEffect(() => { setZoom(1); }, [currentImage?.name]);

  useEffect(() => {
    function onDeleteKey(event) {
      const target = event.target;
      const isTyping = target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (isTyping || !currentImage || event.repeat) return;
      if (event.key === "Delete" || event.code === "Delete" || event.key === "Del") {
        event.preventDefault();
        onDelete();
      }
    }
    window.addEventListener("keydown", onDeleteKey);
    return () => window.removeEventListener("keydown", onDeleteKey);
  }, [currentImage, onDelete]);

  function zoomImage(event) {
    if (!currentImage) return;
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    setZoom((currentZoom) => Math.min(4, Math.max(0.35, Number((currentZoom + direction * 0.12).toFixed(2)))));
  }

  return (
    <div className="review-app">
      <header className="review-header">
        <Brand compact />
        <div className="review-file">
          <span>{route.userLabel} / {route.taskLabel}</span>
          <strong>{currentImage ? currentImage.name : "No image loaded"}</strong>
        </div>
        <div className="review-header-status">
          <Activity size={15} />
          <span>{loading ? "Loading" : "Ready"}</span>
        </div>
      </header>
      <main className="review-layout">
        <section className="image-workspace">
          <div className="image-surface" onWheel={zoomImage}>
            {currentImage ? (
              <img className="review-image" style={{ transform: "scale(" + zoom + ")" }} src={"/api/users/" + route.userId + "/tasks/" + route.taskId + "/images/" + encodeURIComponent(currentImage.name)} alt={currentImage.name} />
            ) : (
              <div className="image-empty"><ImageOff /><span>{loading ? "Loading folder" : "No images in this task"}</span></div>
            )}
            <div className="image-pager">
              <button type="button" aria-label="Previous image" title="Previous image" disabled={!currentImage || review.currentIndex === 0} onClick={onPrevious}><ChevronLeft /></button>
              <span>{review.images.length ? review.currentIndex + 1 : 0} / {review.images.length}</span>
              <button type="button" aria-label="Next image" title="Next image" disabled={!currentImage || review.currentIndex >= review.images.length - 1} onClick={onNext}><ChevronRight /></button>
            </div>
          </div>
        </section>
        <aside className="review-inspector">
          <div className="inspector-user">
            <span>{(route.userLabel || "").charAt(0).toUpperCase()}</span>
            <div><small>{route.taskLabel}</small><strong>{route.userLabel}</strong></div>
          </div>
          <div className="inspector-section">
            <span className="inspector-label">Progress</span>
            <div className="progress-value"><strong>{progress}%</strong><span>{currentPosition} / {review.totalTrackedImages}</span></div>
            <div className="progress-track"><i style={{ width: progress + "%" }}></i></div>
          </div>
          <div className="metric-pair">
            <div><Images size={16} /><span>Available</span><strong>{review.images.length}</strong></div>
            <div><FolderOpen size={16} /><span>Tracked</span><strong>{review.totalTrackedImages}</strong></div>
          </div>
          {instructions.length > 0 ? (
            <div className="delete-label-panel">
              <span className="inspector-label">Instructions</span>
              <div className="instruction-checklist">
                {instructions.map((label, index) => (
                  <label className="instruction-item" key={label + index}>
                    <input type="checkbox" checked={checkedInstructions.has(label)} onChange={() => toggleInstruction(label)} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div className="inspector-spacer"></div>
          )}
          {message && <p className="review-message">{message}</p>}
          <div className="review-actions">
            <button type="button" className="undo-button" disabled={!review.canUndo} onClick={onUndo}><RotateCcw size={17} />Undo</button>
            <button type="button" className="delete-button" disabled={!currentImage} onClick={onDelete}><Trash2 size={17} />Delete image</button>
          </div>
        </aside>
      </main>
    </div>
  );
}

function App() {
  const [route, setRoute] = useState(() => parseHashRoute(window.location.hash));
  const [adminToken, setAdminToken] = useState(() => window.sessionStorage.getItem("frameaudit:admin-token") || "");
  const [adminError, setAdminError] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [folderError, setFolderError] = useState("");
  const [annotators, setAnnotators] = useState([]);
  const [annotatorsLoading, setAnnotatorsLoading] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [review, setReview] = useState({ images: [], currentIndex: 0, totalTrackedImages: 0, canUndo: false, deleteLabels: [] });
  const reviewRef = useRef(review);

  useEffect(() => { reviewRef.current = review; }, [review]);

  const navigate = useCallback((nextRoute, replace = false) => {
    const payload = { frameAudit: true, ...nextRoute };
    window.history[replace ? "replaceState" : "pushState"](payload, "", routeUrl(nextRoute));
    setRoute(nextRoute);
  }, []);

  const expireAdminSession = useCallback((message) => {
    window.sessionStorage.removeItem("frameaudit:admin-token");
    setAdminToken("");
    setAdminError(message || "Admin session expired.");
    navigate({ view: VIEWS.adminLogin }, true);
  }, [navigate]);

  const logoutAdmin = useCallback(async () => {
    try {
      if (adminToken) await fetch("/api/admin/logout", { method: "POST", headers: { Authorization: "Bearer " + adminToken } });
    } finally {
      window.sessionStorage.removeItem("frameaudit:admin-token");
      setAdminToken("");
      navigate({ view: VIEWS.roles }, true);
    }
  }, [adminToken, navigate]);

  useEffect(() => {
    const initial = parseHashRoute(window.location.hash);
    window.history.replaceState({ frameAudit: true, ...initial }, "", routeUrl(initial));
    function onPopState(event) { setRoute(event.state && event.state.frameAudit ? event.state : { view: VIEWS.roles }); }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (route.view === VIEWS.admin && !adminToken) navigate({ view: VIEWS.adminLogin }, true);
  }, [route.view, adminToken, navigate]);

  useEffect(() => {
    if (route.view !== VIEWS.annotators) return undefined;
    const controller = new AbortController();
    setAnnotatorsLoading(true);
    setFolderError("");
    fetch("/api/users", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || "Failed to load annotators.");
        setAnnotators(data.users || []);
      })
      .catch((error) => { if (error.name !== "AbortError") setFolderError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setAnnotatorsLoading(false); });
    return () => controller.abort();
  }, [route.view]);

  useEffect(() => {
    if (route.view !== VIEWS.tasks || !route.userId) return undefined;
    const controller = new AbortController();
    setTasksLoading(true);
    setFolderError("");
    fetch("/api/users/" + route.userId + "/tasks", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || "Failed to load tasks.");
        setTasks(data.tasks || []);
      })
      .catch((error) => { if (error.name !== "AbortError") setFolderError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setTasksLoading(false); });
    return () => controller.abort();
  }, [route.view, route.userId]);

  const applyServerState = useCallback((data, preferredName = null) => {
    setReview((previous) => {
      const storageKey = LAST_IMAGE_STORAGE_PREFIX + data.user_id + ":" + data.task_id;
      const oldCurrentName = preferredName || window.localStorage.getItem(storageKey) || previous.images[previous.currentIndex]?.name || null;
      const images = data.images || [];
      let currentIndex = 0;
      if (images.length && oldCurrentName) {
        const foundIndex = images.findIndex((image) => image.name === oldCurrentName);
        currentIndex = foundIndex >= 0 ? foundIndex : Math.min(previous.currentIndex, images.length - 1);
      }
      return { images, currentIndex, totalTrackedImages: data.total_tracked_images || images.length, canUndo: Boolean(data.can_undo), deleteLabels: data.delete_labels || [] };
    });
    setReviewMessage(data.message || "");
  }, []);

  useEffect(() => {
    if (route.view !== VIEWS.reviewer || !route.userId || !route.taskId) return undefined;
    const controller = new AbortController();
    setReviewLoading(true);
    setReviewMessage("");
    fetch("/api/users/" + route.userId + "/tasks/" + route.taskId + "/state", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || "Failed to load review folder.");
        applyServerState(data);
        if (data.user_label || data.task_label) {
          setRoute((previous) =>
            previous.view === VIEWS.reviewer && previous.userId === data.user_id && previous.taskId === data.task_id
              && (previous.userLabel !== data.user_label || previous.taskLabel !== data.task_label)
              ? { ...previous, userLabel: data.user_label, taskLabel: data.task_label }
              : previous
          );
        }
      })
      .catch((error) => {
        if (error.name === "AbortError") return;
        setFolderError(error.message);
        navigate({ view: VIEWS.tasks, userId: route.userId, userLabel: route.userLabel }, true);
      })
      .finally(() => { if (!controller.signal.aborted) setReviewLoading(false); });
    return () => controller.abort();
  }, [route.view, route.userId, route.taskId, route.userLabel, applyServerState, navigate]);

  useEffect(() => {
    if (route.view !== VIEWS.reviewer) return undefined;
    const currentImage = review.images[review.currentIndex];
    if (currentImage && route.userId && route.taskId) {
      window.localStorage.setItem(LAST_IMAGE_STORAGE_PREFIX + route.userId + ":" + route.taskId, currentImage.name);
    }
    function onKeyDown(event) {
      const target = event.target;
      const isTyping = target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (isTyping) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setReview((previous) => ({ ...previous, currentIndex: Math.max(0, previous.currentIndex - 1) }));
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setReview((previous) => ({ ...previous, currentIndex: Math.min(Math.max(0, previous.images.length - 1), previous.currentIndex + 1) }));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [route.view, route.userId, route.taskId, review.images, review.currentIndex]);

  async function loginAdmin(credentials) {
    setAdminLoading(true);
    setAdminError("");
    try {
      const response = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credentials) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Login failed.");
      window.sessionStorage.setItem("frameaudit:admin-token", data.token);
      setAdminToken(data.token);
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
      const response = await fetch("/api/users/" + route.userId + "/tasks/" + route.taskId + "/delete/" + encodeURIComponent(image.name), { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Delete failed.");
      applyServerState(data);
    } catch (error) { setReviewMessage(error.message); }
  }

  async function undoDelete() {
    setReviewMessage("");
    try {
      const response = await fetch("/api/users/" + route.userId + "/tasks/" + route.taskId + "/undo", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Undo failed.");
      applyServerState(data, data.restored_name || null);
    } catch (error) { setReviewMessage(error.message); }
  }

  const activeStep = useMemo(() => route.view === VIEWS.roles ? 1 : route.view === VIEWS.tasks || route.view === VIEWS.reviewer || route.view === VIEWS.admin ? 3 : 2, [route.view]);

  if (route.view === VIEWS.reviewer) {
    return (
      <ReviewWorkspace route={route} review={review} loading={reviewLoading} message={reviewMessage}
        onPrevious={() => setReview((previous) => ({ ...previous, currentIndex: Math.max(0, previous.currentIndex - 1) }))}
        onNext={() => setReview((previous) => ({ ...previous, currentIndex: Math.min(previous.images.length - 1, previous.currentIndex + 1) }))}
        onDelete={deleteImage} onUndo={undoDelete}
      />
    );
  }

  return (
    <AccessLayout activeStep={activeStep} wide={route.view === VIEWS.admin}>
      {route.view === VIEWS.roles && <RolesScreen onAnnotator={() => { setFolderError(""); navigate({ view: VIEWS.annotators }); }} onAdmin={() => { setAdminError(""); navigate({ view: VIEWS.adminLogin }); }} />}
      {route.view === VIEWS.annotators && <AnnotatorsScreen annotators={annotators} loading={annotatorsLoading} error={folderError} onSelect={(annotator) => { setFolderError(""); setTasks([]); navigate({ view: VIEWS.tasks, userId: annotator.id, userLabel: annotator.label }); }} />}
      {route.view === VIEWS.tasks && <TasksScreen userLabel={route.userLabel} tasks={tasks} loading={tasksLoading} error={folderError} onBack={() => navigate({ view: VIEWS.annotators })} onSelect={(task) => { setFolderError(""); navigate({ view: VIEWS.reviewer, userId: route.userId, userLabel: route.userLabel, taskId: task.id, taskLabel: task.label }); }} />}
      {route.view === VIEWS.adminLogin && <AdminLoginScreen loading={adminLoading} error={adminError} onSubmit={loginAdmin} />}
      {route.view === VIEWS.admin && <AdminScreen token={adminToken} onSessionExpired={expireAdminSession} onLogout={logoutAdmin} />}
    </AccessLayout>
  );
}

export default App;
