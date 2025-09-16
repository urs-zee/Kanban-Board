// Storage utility for saving tasks in localStorage
class StorageWrapper {
  constructor(namespaceKey = "kanban.tasks") {
    this.key = namespaceKey;
  }

  getAll() {
    try {
      const raw = localStorage.getItem(this.key);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("Failed to parse storage", e);
      return [];
    }
  }

  saveAll(tasks) {
    localStorage.setItem(this.key, JSON.stringify(tasks));
  }

  clear() {
    localStorage.removeItem(this.key);
  }
}

// Generate unique id for tasks
const uid = (prefix = "t") => prefix + Math.random().toString(36).slice(2, 9);

// Small helper for creating DOM elements
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);

  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("data-")) node.setAttribute(k, v);
    else if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else node[k] = v;
  }

  children.flat().forEach((c) => {
    if (typeof c === "string") node.appendChild(document.createTextNode(c));
    else if (c) node.appendChild(c);
  });

  return node;
}

// Handles rendering of tasks on the board
class Renderer {
  renderTasks(tasks) {
    const lists = {
      todo: document.querySelector('[data-list-for="todo"]'),
      inprogress: document.querySelector('[data-list-for="inprogress"]'),
      done: document.querySelector('[data-list-for="done"]'),
    };

    Object.values(lists).forEach((l) => {
      l.innerHTML = "";
    });

    const grouped = { todo: [], inprogress: [], done: [] };
    for (const t of tasks) {
      grouped[t.status || "todo"].push(t);
    }

    for (const status of Object.keys(grouped)) {
      const listEl = lists[status];

      if (grouped[status].length === 0) {
        listEl.appendChild(el("div", { class: "empty", text: "No tasks" }));
      } else {
        for (const task of grouped[status]) {
          listEl.appendChild(this._createCard(task));
        }
      }

      const countNode = document.querySelector(`[data-count-for="${status}"]`);
      if (countNode) countNode.textContent = grouped[status].length;
    }
  }

  _createCard(task) {
    const card = el("div", {
      class: "card",
      draggable: true,
      "data-id": task.id,
    });

    const title = el("h4", { text: task.title });
    const desc = el("p", { text: task.desc || "" });

    const meta = el(
      "div",
      { class: "meta" },
      el("span", { text: new Date(task.createdAt).toLocaleString() }),
      el("button", {
        class: "btn-ghost",
        text: "Delete",
        onclick: (e) => {
          e.stopPropagation();
          e.preventDefault();
          card.dispatchEvent(
            new CustomEvent("card:delete", {
              bubbles: true,
              detail: { id: task.id },
            })
          );
        },
      })
    );

    card.append(title, desc, meta);
    return card;
  }
}

// Drag & drop handling
class DragDrop {
  constructor() {
    this.draggedEl = null;
    this.onDragStart = this.onDragStart.bind(this);
    this.onDragEnd = this.onDragEnd.bind(this);
    this.onDragOver = this.onDragOver.bind(this);
    this.onDrop = this.onDrop.bind(this);
  }

  attach() {
    document.addEventListener("dragstart", this.onDragStart);
    document.addEventListener("dragend", this.onDragEnd);

    document.querySelectorAll(".task-list").forEach((list) => {
      list.addEventListener("dragover", this.onDragOver);
      list.addEventListener("drop", this.onDrop);
    });
  }

  onDragStart(e) {
    const card = e.target.closest(".card");
    if (!card) return;

    this.draggedEl = card;
    card.classList.add("dragging");

    e.dataTransfer.setData("text/plain", card.dataset.id);
    e.dataTransfer.effectAllowed = "move";
  }

  onDragEnd() {
    if (this.draggedEl) this.draggedEl.classList.remove("dragging");
    this.draggedEl = null;
  }

  onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    const list = e.currentTarget;
    const after = this._getDragAfterElement(list, e.clientY);
    const dragging = document.querySelector(".dragging");

    if (!dragging) return;

    if (after == null) list.appendChild(dragging);
    else list.insertBefore(dragging, after);
  }

  onDrop(e) {
    e.preventDefault();

    const id = e.dataTransfer.getData("text/plain");
    const targetList = e.currentTarget;

    targetList.dispatchEvent(
      new CustomEvent("list:dropped", {
        bubbles: true,
        detail: {
          id,
          targetColumn: targetList.closest(".column").dataset.column,
        },
      })
    );
  }

  _getDragAfterElement(container, y) {
    const draggableElements = [
      ...container.querySelectorAll(".card:not(.dragging)"),
    ];

    return (
      draggableElements.reduce(
        (closest, child) => {
          const box = child.getBoundingClientRect();
          const offset = y - box.top - box.height / 2;

          if (offset < 0 && offset > closest.offset)
            return { offset, element: child };
          else return closest;
        },
        { offset: Number.NEGATIVE_INFINITY }
      ).element || null
    );
  }
}

// Main app logic
class KanbanApp {
  constructor() {
    this.storage = new StorageWrapper();
    this.renderer = new Renderer();
    this.dragdrop = new DragDrop();
    this.tasks = this.storage.getAll();

    this.form = document.getElementById("taskForm");
    this.titleInput = document.getElementById("taskTitle");
    this.descInput = document.getElementById("taskDesc");
    this.clearBtn = document.getElementById("clearAll");

    this._onSubmit = this._onSubmit.bind(this);
    this._onCardDelete = this._onCardDelete.bind(this);
    this._onListDropped = this._onListDropped.bind(this);
    this._onClearAll = this._onClearAll.bind(this);
  }

  start() {
    this.renderer.renderTasks(this.tasks);

    this.form.addEventListener("submit", this._onSubmit);
    document.addEventListener("card:delete", this._onCardDelete);
    document.addEventListener("list:dropped", this._onListDropped);
    this.clearBtn.addEventListener("click", this._onClearAll);

    this.dragdrop.attach();
  }

  _persist() {
    this.storage.saveAll(this.tasks);
  }

  _onSubmit(e) {
    e.preventDefault();

    const title = this.titleInput.value.trim();
    const desc = this.descInput.value.trim();

    if (!title) return;

    const newTask = {
      id: uid(),
      title,
      desc,
      status: "todo",
      createdAt: Date.now(),
    };

    this.tasks.push(newTask);
    this._persist();
    this.renderer.renderTasks(this.tasks);

    this.form.reset();
    this.titleInput.focus();
  }

  _onCardDelete(e) {
    const id = e.detail.id;
    this.tasks = this.tasks.filter((t) => t.id !== id);

    this._persist();
    this.renderer.renderTasks(this.tasks);
  }

  _onListDropped(e) {
    const { id, targetColumn } = e.detail;
    const task = this.tasks.find((t) => t.id === id);

    if (task) {
      task.status = targetColumn;
      this._persist();
      this.renderer.renderTasks(this.tasks);
    }
  }

  _onClearAll() {
    if (!confirm("Delete all tasks? This cannot be undone.")) return;

    this.tasks = [];
    this.storage.clear();
    this.renderer.renderTasks(this.tasks);
  }
}

// Bootstrapping the app
const app = new KanbanApp();
app.start();
