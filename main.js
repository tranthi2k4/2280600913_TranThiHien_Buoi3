// Quản Lý Sản Phẩm - main.js
const state = {
  data: [],
  page: 1,
  limit: 10,
  search: "",
  sortField: null,
  sortDir: "asc",
};

const els = {
  tbody: document.querySelector("#productTable tbody"),
  search: document.getElementById("searchInput"),
  limit: document.getElementById("limitSelect"),
  sort: document.getElementById("sortSelect"),
  rowsInfo: document.getElementById("rowsInfo"),
  pageControls: document.getElementById("pageControls"),
};

// Hàm getAll: giả lập API lấy danh sách với filter/sort/pagination
async function getAll({
  page = 1,
  limit = 10,
  search = "",
  sortField = null,
  sortDir = "asc",
} = {}) {
  // load data nếu chưa có
  if (!state.data || state.data.length === 0) {
    // Try inline JSON in <script id="dbData"> first (works without server)
    try {
      const el = document.getElementById("dbData");
      if (el && el.textContent) {
        state.data = JSON.parse(el.textContent);
      } else {
        // fallback to fetching db.json (when served via http)
        const res = await fetch("db.json");
        state.data = await res.json();
      }
    } catch (err) {
      console.error("Failed to load data:", err);
      state.data = [];
    }
  }

  // lọc theo title (case-insensitive)
  let items = state.data.filter((item) => {
    if (!search) return true;
    return (
      item.title && item.title.toLowerCase().includes(search.toLowerCase())
    );
  });

  // sắp xếp
  if (sortField) {
    items.sort((a, b) => {
      let va = a[sortField];
      let vb = b[sortField];
      if (sortField === "title") {
        va = (va || "").toString().toLowerCase();
        vb = (vb || "").toString().toLowerCase();
        if (va < vb) return sortDir === "asc" ? -1 : 1;
        if (va > vb) return sortDir === "asc" ? 1 : -1;
        return 0;
      }
      // numeric compare for price
      va = Number(va) || 0;
      vb = Number(vb) || 0;
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }

  const total = items.length;
  const start = (page - 1) * limit;
  const paged = items.slice(start, start + limit);

  // trả về giống API: { data, total }
  return { data: paged, total };
}

// Render table and pagination
async function render() {
  const { page, limit, search, sortField, sortDir } = state;
  const sortArg = sortField ? `${sortField}:${sortDir}` : "";
  const res = await getAll({ page, limit, search, sortField, sortDir });

  // render rows
  els.tbody.innerHTML = "";
  res.data.forEach((item, idx) => {
    const tr = document.createElement("tr");
    const globalIndex = (page - 1) * limit + idx + 1;

    const tdIndex = document.createElement("td");
    tdIndex.textContent = globalIndex;

    const tdImg = document.createElement("td");
    const imgEl = createImageElement(item);
    if (imgEl) tdImg.appendChild(imgEl);

    const tdTitle = document.createElement("td");
    tdTitle.textContent = item.title || "";

    const tdPrice = document.createElement("td");
    tdPrice.className = "price";
    tdPrice.textContent = `$${Number(item.price || 0).toFixed(2)}`;

    const tdSlug = document.createElement("td");
    tdSlug.textContent = item.slug || "";

    tr.appendChild(tdIndex);
    tr.appendChild(tdImg);
    tr.appendChild(tdTitle);
    tr.appendChild(tdPrice);
    tr.appendChild(tdSlug);
    els.tbody.appendChild(tr);
  });

  // rows info
  els.rowsInfo.textContent = `${res.data.length} / ${res.total} sản phẩm (Trang ${page})`;

  // pagination controls
  renderPagination(res.total);
}

function createImageElement(item) {
  const candidates = [];
  if (item.images && Array.isArray(item.images)) {
    // images may be strings or objects with url property
    item.images.forEach((it) => {
      if (!it) return;
      if (typeof it === "string") candidates.push(it);
      else if (it.url) candidates.push(it.url);
    });
  }
  if (item.image) candidates.push(item.image);
  if (item.thumbnail) candidates.push(item.thumbnail);

  const first = (candidates.find(Boolean) || "").toString().trim();

  const placeholder =
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='100'><rect fill='%23ffdfe8' width='100%25' height='100%25'/><text x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23663' font-size='12'>No Image</text></svg>";

  function normalizeUrl(raw) {
    if (!raw) return null;
    raw = raw.toString().trim();
    if (!raw) return null;
    // protocol-relative //example.com/...
    if (/^\/\//.test(raw)) return window.location.protocol + raw;
    // absolute http(s)
    if (/^https?:\/\//i.test(raw)) return raw;
    // root-relative /path/to/img
    if (/^\//.test(raw)) return window.location.origin + raw;
    // domain-like without protocol -> prefix https
    if (/^[\w.-]+\//.test(raw) || /^[\w.-]+\.[a-z]{2,}/i.test(raw))
      return "https://" + raw;
    return null;
  }

  const url = normalizeUrl(first) || placeholder;

  const img = document.createElement("img");
  img.src = url;
  img.alt = item.title || "No Image";
  img.loading = "lazy";
  img.style.width = "140px";
  img.style.height = "100px";
  img.style.objectFit = "contain";
  img.style.background = "#fff0f6";

  img.dataset.tryCount = "0";
  img.onerror = function () {
    const tries = Number(this.dataset.tryCount || 0) + 1;
    this.dataset.tryCount = String(tries);
    // try switch http->https if present
    try {
      if (tries === 1 && /^http:/i.test(this.src)) {
        this.src = this.src.replace(/^http:/i, "https:");
        return;
      }
      // if original was non-absolute and failed, try proxy with cleaned URL
      if (tries === 2) {
        try {
          const cleaned = this.src.replace(/^https?:\/\//, "");
          this.src =
            "https://images.weserv.nl/?url=" + encodeURIComponent(cleaned);
          return;
        } catch (e) {}
      }
    } catch (e) {}
    // finally set placeholder
    this.onerror = null;
    this.src = placeholder;
  };

  return img;
}

function renderPagination(total) {
  const pages = Math.max(1, Math.ceil(total / state.limit));
  const container = els.pageControls;
  container.innerHTML = "";

  const prev = document.createElement("button");
  prev.textContent = "‹ Prev";
  prev.className = "page-btn";
  prev.disabled = state.page === 1;
  prev.onclick = () => {
    state.page = Math.max(1, state.page - 1);
    render();
  };
  container.appendChild(prev);

  // page numbers (show up to 7 pages with ellipsis)
  const range = getPageRange(state.page, pages, 7);
  range.forEach((p) => {
    if (p === "...") {
      const span = document.createElement("span");
      span.textContent = "...";
      span.style.padding = "6px 8px";
      container.appendChild(span);
      return;
    }
    const btn = document.createElement("button");
    btn.textContent = p;
    btn.className = "page-btn";
    if (p === state.page) {
      btn.style.fontWeight = "700";
    }
    btn.onclick = () => {
      state.page = p;
      render();
    };
    container.appendChild(btn);
  });

  const next = document.createElement("button");
  next.textContent = "Next ›";
  next.className = "page-btn";
  next.disabled = state.page >= pages;
  next.onclick = () => {
    state.page = Math.min(pages, state.page + 1);
    render();
  };
  container.appendChild(next);
}

function getPageRange(current, total, maxShown) {
  const pages = [];
  if (total <= maxShown) {
    for (let i = 1; i <= total; i++) pages.push(i);
    return pages;
  }
  const side = Math.floor((maxShown - 3) / 2);
  let left = Math.max(2, current - side);
  let right = Math.min(total - 1, current + side);
  if (current - 1 <= side) {
    left = 2;
    right = maxShown - 2;
  }
  if (total - current <= side) {
    left = total - (maxShown - 3);
    right = total - 1;
  }
  pages.push(1);
  if (left > 2) pages.push("...");
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < total - 1) pages.push("...");
  pages.push(total);
  return pages;
}

// helpers
function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

// wire events
els.search.addEventListener("input", (e) => {
  state.search = e.target.value;
  state.page = 1;
  render();
});
els.limit.addEventListener("change", (e) => {
  state.limit = Number(e.target.value);
  state.page = 1;
  render();
});
els.sort.addEventListener("change", (e) => {
  const v = e.target.value;
  if (!v) {
    state.sortField = null;
    state.sortDir = "asc";
  } else {
    const [f, d] = v.split(":");
    state.sortField = f;
    state.sortDir = d || "asc";
  }
  state.page = 1;
  render();
});

// initial load
(async function init() {
  // set initial values from selects
  state.limit = Number(els.limit.value);
  await render();
})();

// Expose getAll for debugging if needed
window.getAll = getAll;
