// ========================================
// Storage Keys & Default State
// ========================================
const STORAGE_KEYS = {
    items: 'workTimer.items',
    sessions: 'workTimer.sessions',
    activeSessions: 'workTimer.activeSessions',
    settings: 'workTimer.settings'
};

const DEFAULT_SETTINGS = {
    concurrencyMode: 'single',
    maxConcurrent: 3,
    weekStartsOn: 'monday',
    theme: 'system'
};

// ========================================
// State Management
// ========================================
let state = {
    items: [],
    sessions: [],
    activeSessions: [],
    settings: { ...DEFAULT_SETTINGS }
};

let currentPeriod = 'day';
let currentDate = new Date();
let timerInterval = null;

// ========================================
// Utility Functions
// ========================================
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatDate(date) {
    const d = new Date(date);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function formatTime(date) {
    const d = new Date(date);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDateTime(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function toLocalDateString(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function endOfDay(date) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
}

function startOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

function endOfWeek(date) {
    const d = startOfWeek(date);
    d.setDate(d.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d;
}

function startOfMonth(date) {
    const d = new Date(date);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
}

function endOfMonth(date) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + 1, 0);
    d.setHours(23, 59, 59, 999);
    return d;
}

function startOfYear(date) {
    const d = new Date(date);
    d.setMonth(0, 1);
    d.setHours(0, 0, 0, 0);
    return d;
}

function endOfYear(date) {
    const d = new Date(date);
    d.setMonth(11, 31);
    d.setHours(23, 59, 59, 999);
    return d;
}

function getDaysInMonth(date) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + 1, 0);
    return d.getDate();
}

// ========================================
// Storage Functions
// ========================================
function loadState() {
    try {
        const items = localStorage.getItem(STORAGE_KEYS.items);
        const sessions = localStorage.getItem(STORAGE_KEYS.sessions);
        const activeSessions = localStorage.getItem(STORAGE_KEYS.activeSessions);
        const settings = localStorage.getItem(STORAGE_KEYS.settings);

        state.items = items ? JSON.parse(items) : [];
        state.sessions = sessions ? JSON.parse(sessions) : [];
        state.activeSessions = activeSessions ? JSON.parse(activeSessions) : [];
        state.settings = settings ? { ...DEFAULT_SETTINGS, ...JSON.parse(settings) } : { ...DEFAULT_SETTINGS };
    } catch (e) {
        console.error('Failed to load state:', e);
        state = { items: [], sessions: [], activeSessions: [], settings: { ...DEFAULT_SETTINGS } };
    }
}

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEYS.items, JSON.stringify(state.items));
        localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(state.sessions));
        localStorage.setItem(STORAGE_KEYS.activeSessions, JSON.stringify(state.activeSessions));
        localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
    } catch (e) {
        console.error('Failed to save state:', e);
        showToast('データの保存に失敗しました', 'error');
    }
}

// ========================================
// Theme Management
// ========================================
function applyTheme() {
    const theme = state.settings.theme;
    let effectiveTheme = theme;

    if (theme === 'system') {
        effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    document.documentElement.setAttribute('data-theme', effectiveTheme);
    updateThemeIcon(effectiveTheme);
}

function updateThemeIcon(theme) {
    const icon = document.querySelector('.theme-icon');
    if (icon) {
        icon.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    state.settings.theme = newTheme;
    saveState();
    applyTheme();
}

// ========================================
// Toast Notifications
// ========================================
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ========================================
// Modal Management
// ========================================
function openModal(modalId) {
    document.getElementById(modalId).classList.add('show');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('show');
}

// ========================================
// Task Management
// ========================================
function renderTaskList() {
    const container = document.getElementById('taskList');

    if (state.items.length === 0) {
        container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📝</div>
        <div class="empty-state-text">タスクがありません。<br>「+ タスク追加」ボタンから追加してください。</div>
      </div>
    `;
        return;
    }

    container.innerHTML = state.items.map(item => {
        const activeSession = state.activeSessions.find(s => s.itemId === item.id);
        const isActive = !!activeSession;
        const elapsed = isActive ? Date.now() - new Date(activeSession.startAt).getTime() : 0;

        return `
      <div class="task-card ${isActive ? 'active' : ''}" style="--task-color: ${item.color}" data-item-id="${item.id}">
        <div class="task-color-dot" style="background: ${item.color}"></div>
        <div class="task-info">
          <div class="task-name">${escapeHtml(item.name)}</div>
          ${item.note ? `<div class="task-note">${escapeHtml(item.note)}</div>` : ''}
        </div>
        <div class="task-timer" data-timer="${item.id}">${isActive ? formatDuration(elapsed) : ''}</div>
        <div class="task-actions">
          ${isActive
                ? `<button class="btn btn-sm btn-stop" onclick="stopTask('${item.id}')">終了</button>`
                : `<button class="btn btn-sm btn-start" onclick="startTask('${item.id}')">開始</button>`
            }
          <button class="btn btn-sm btn-secondary" onclick="editTask('${item.id}')">編集</button>
          <button class="btn btn-sm btn-danger" onclick="deleteTask('${item.id}')">削除</button>
        </div>
      </div>
    `;
    }).join('');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function addTask(name, color, note) {
    const item = {
        id: generateId(),
        name: name.trim(),
        color: color || '#4A90D9',
        note: note?.trim() || '',
        createdAt: new Date().toISOString()
    };
    state.items.push(item);
    saveState();
    renderTaskList();
    updateLogFilterOptions();
    showToast('タスクを追加しました');
}

function editTask(id) {
    const item = state.items.find(i => i.id === id);
    if (!item) return;

    document.getElementById('taskModalTitle').textContent = 'タスク編集';
    document.getElementById('taskName').value = item.name;
    document.getElementById('taskColor').value = item.color;
    document.getElementById('taskNote').value = item.note || '';
    document.getElementById('taskEditId').value = id;
    openModal('taskModal');
}

function updateTask(id, name, color, note) {
    const index = state.items.findIndex(i => i.id === id);
    if (index === -1) return;

    state.items[index] = {
        ...state.items[index],
        name: name.trim(),
        color: color,
        note: note?.trim() || ''
    };
    saveState();
    renderTaskList();
    updateLogFilterOptions();
    renderLogTable();
    updateSummary();
    showToast('タスクを更新しました');
}

function deleteTask(id) {
    if (!confirm('このタスクと関連するログをすべて削除しますか？')) return;

    // Remove active session if running
    state.activeSessions = state.activeSessions.filter(s => s.itemId !== id);
    // Remove all sessions for this task
    state.sessions = state.sessions.filter(s => s.itemId !== id);
    // Remove the task
    state.items = state.items.filter(i => i.id !== id);

    saveState();
    renderTaskList();
    updateLogFilterOptions();
    renderLogTable();
    updateSummary();
    showToast('タスクを削除しました');
}

// ========================================
// Timer Functions
// ========================================
function startTask(itemId) {
    const item = state.items.find(i => i.id === itemId);
    if (!item) return;

    const existingActive = state.activeSessions.find(s => s.itemId === itemId);
    if (existingActive) {
        showToast('このタスクはすでに稼働中です', 'warning');
        return;
    }

    if (state.settings.concurrencyMode === 'single') {
        // Auto-stop current active session
        if (state.activeSessions.length > 0) {
            const current = state.activeSessions[0];
            finishSession(current.itemId);
        }
    } else {
        // Multi mode - check limit
        if (state.activeSessions.length >= state.settings.maxConcurrent) {
            showToast(`同時稼働数の上限（${state.settings.maxConcurrent}）に達しています`, 'warning');
            return;
        }
    }

    state.activeSessions.push({
        itemId: itemId,
        startAt: new Date().toISOString()
    });

    saveState();
    renderTaskList();
    startTimerUpdates();
    showToast(`「${item.name}」を開始しました`);
}

function stopTask(itemId) {
    const activeSession = state.activeSessions.find(s => s.itemId === itemId);
    if (!activeSession) {
        showToast('このタスクは稼働していません', 'warning');
        return;
    }

    finishSession(itemId);
    showToast('作業を終了しました');
}

function finishSession(itemId) {
    const activeIndex = state.activeSessions.findIndex(s => s.itemId === itemId);
    if (activeIndex === -1) return;

    const active = state.activeSessions[activeIndex];
    const session = {
        id: generateId(),
        itemId: itemId,
        startAt: active.startAt,
        endAt: new Date().toISOString(),
        note: ''
    };

    state.sessions.push(session);
    state.activeSessions.splice(activeIndex, 1);

    saveState();
    renderTaskList();
    renderLogTable();
    updateSummary();

    if (state.activeSessions.length === 0) {
        stopTimerUpdates();
    }
}

function startTimerUpdates() {
    if (timerInterval) return;
    timerInterval = setInterval(updateTimers, 1000);
}

function stopTimerUpdates() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function updateTimers() {
    state.activeSessions.forEach(active => {
        const timerEl = document.querySelector(`[data-timer="${active.itemId}"]`);
        if (timerEl) {
            const elapsed = Date.now() - new Date(active.startAt).getTime();
            timerEl.textContent = formatDuration(elapsed);
        }
    });
}

// ========================================
// Session/Log Management
// ========================================
function renderLogTable() {
    const tbody = document.getElementById('logTableBody');
    const filterTask = document.getElementById('logFilterTask').value;
    const filterDateFrom = document.getElementById('logFilterDateFrom').value;
    const filterDateTo = document.getElementById('logFilterDateTo').value;

    let filtered = [...state.sessions];

    if (filterTask) {
        filtered = filtered.filter(s => s.itemId === filterTask);
    }

    if (filterDateFrom) {
        const from = startOfDay(new Date(filterDateFrom));
        filtered = filtered.filter(s => new Date(s.startAt) >= from);
    }

    if (filterDateTo) {
        const to = endOfDay(new Date(filterDateTo));
        filtered = filtered.filter(s => new Date(s.startAt) <= to);
    }

    // Sort by startAt descending
    filtered.sort((a, b) => new Date(b.startAt) - new Date(a.startAt));

    if (filtered.length === 0) {
        tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--color-text-muted); padding: 32px;">
          ログがありません
        </td>
      </tr>
    `;
        return;
    }

    tbody.innerHTML = filtered.map(session => {
        const item = state.items.find(i => i.id === session.itemId);
        const duration = new Date(session.endAt) - new Date(session.startAt);

        return `
      <tr>
        <td>${formatDate(session.startAt)}</td>
        <td>
          <div class="log-task-cell">
            <div class="task-color-dot" style="background: ${item?.color || '#999'}"></div>
            ${escapeHtml(item?.name || '削除済み')}
          </div>
        </td>
        <td>${formatTime(session.startAt)}</td>
        <td>${formatTime(session.endAt)}</td>
        <td>${formatDuration(duration)}</td>
        <td>${escapeHtml(session.note || '')}</td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="editLog('${session.id}')">編集</button>
          <button class="btn btn-sm btn-danger" onclick="deleteLog('${session.id}')">削除</button>
        </td>
      </tr>
    `;
    }).join('');
}

function updateLogFilterOptions() {
    const select = document.getElementById('logFilterTask');
    const logTaskSelect = document.getElementById('logTask');
    const currentValue = select.value;

    const options = `<option value="">すべてのタスク</option>` +
        state.items.map(item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');

    select.innerHTML = options;
    select.value = currentValue;

    // Update log modal task select
    logTaskSelect.innerHTML = state.items.map(item =>
        `<option value="${item.id}">${escapeHtml(item.name)}</option>`
    ).join('');
}

function openAddLogModal() {
    if (state.items.length === 0) {
        showToast('先にタスクを追加してください', 'warning');
        return;
    }

    document.getElementById('logModalTitle').textContent = 'ログ追加';
    document.getElementById('logTask').value = state.items[0].id;
    document.getElementById('logStartAt').value = formatDateTime(new Date(Date.now() - 3600000));
    document.getElementById('logEndAt').value = formatDateTime(new Date());
    document.getElementById('logNote').value = '';
    document.getElementById('logEditId').value = '';
    openModal('logModal');
}

function editLog(id) {
    const session = state.sessions.find(s => s.id === id);
    if (!session) return;

    document.getElementById('logModalTitle').textContent = 'ログ編集';
    document.getElementById('logTask').value = session.itemId;
    document.getElementById('logStartAt').value = formatDateTime(new Date(session.startAt));
    document.getElementById('logEndAt').value = formatDateTime(new Date(session.endAt));
    document.getElementById('logNote').value = session.note || '';
    document.getElementById('logEditId').value = id;
    openModal('logModal');
}

function deleteLog(id) {
    if (!confirm('このログを削除しますか？')) return;

    state.sessions = state.sessions.filter(s => s.id !== id);
    saveState();
    renderLogTable();
    updateSummary();
    showToast('ログを削除しました');
}

function saveLog(itemId, startAt, endAt, note, editId) {
    const start = new Date(startAt);
    const end = new Date(endAt);

    if (end <= start) {
        showToast('終了日時は開始日時より後にしてください', 'error');
        return false;
    }

    if (editId) {
        const index = state.sessions.findIndex(s => s.id === editId);
        if (index !== -1) {
            state.sessions[index] = {
                ...state.sessions[index],
                itemId,
                startAt: start.toISOString(),
                endAt: end.toISOString(),
                note: note?.trim() || ''
            };
        }
    } else {
        state.sessions.push({
            id: generateId(),
            itemId,
            startAt: start.toISOString(),
            endAt: end.toISOString(),
            note: note?.trim() || ''
        });
    }

    saveState();
    renderLogTable();
    updateSummary();
    showToast(editId ? 'ログを更新しました' : 'ログを追加しました');
    return true;
}

// ========================================
// Summary & Aggregation
// ========================================
function splitSessionByDay(session) {
    const segments = [];
    let current = new Date(session.startAt);
    const end = new Date(session.endAt);

    while (current < end) {
        const dayEnd = endOfDay(current);
        const segmentEnd = dayEnd < end ? new Date(dayEnd.getTime() + 1) : end;

        segments.push({
            itemId: session.itemId,
            date: toLocalDateString(current),
            startAt: current.toISOString(),
            endAt: segmentEnd.toISOString(),
            duration: segmentEnd - current
        });

        current = startOfDay(new Date(current.getTime() + 86400000));
    }

    return segments;
}

function getPeriodRange(period, date) {
    switch (period) {
        case 'day':
            return { start: startOfDay(date), end: endOfDay(date) };
        case 'week':
            return { start: startOfWeek(date), end: endOfWeek(date) };
        case 'month':
            return { start: startOfMonth(date), end: endOfMonth(date) };
        case 'year':
            return { start: startOfYear(date), end: endOfYear(date) };
        case 'all':
            return { start: new Date(0), end: new Date(8640000000000000) };
    }
}

function getSessionsInPeriod(sessions, start, end) {
    return sessions.filter(s => {
        const sessionStart = new Date(s.startAt);
        const sessionEnd = new Date(s.endAt);
        return sessionStart < end && sessionEnd > start;
    });
}

function calculateSummary(period, date) {
    const range = getPeriodRange(period, date);
    const relevantSessions = getSessionsInPeriod(state.sessions, range.start, range.end);

    // Split sessions by day and clip to period boundaries
    const segments = [];
    relevantSessions.forEach(session => {
        const splits = splitSessionByDay(session);
        splits.forEach(seg => {
            const segStart = new Date(seg.startAt);
            const segEnd = new Date(seg.endAt);

            // Clip to period boundaries
            const clippedStart = segStart < range.start ? range.start : segStart;
            const clippedEnd = segEnd > range.end ? range.end : segEnd;

            if (clippedEnd > clippedStart) {
                segments.push({
                    ...seg,
                    startAt: clippedStart.toISOString(),
                    endAt: clippedEnd.toISOString(),
                    duration: clippedEnd - clippedStart
                });
            }
        });
    });

    // Aggregate by task
    const byTask = {};
    state.items.forEach(item => {
        byTask[item.id] = { item, duration: 0 };
    });

    segments.forEach(seg => {
        if (byTask[seg.itemId]) {
            byTask[seg.itemId].duration += seg.duration;
        }
    });

    // Calculate total with overlap
    const totalWithOverlap = Object.values(byTask).reduce((sum, t) => sum + t.duration, 0);

    // Calculate actual working time (non-overlapping)
    const totalActual = calculateActualWorkingTime(segments);

    return {
        range,
        segments,
        byTask,
        totalWithOverlap,
        totalActual
    };
}

function calculateActualWorkingTime(segments) {
    if (segments.length === 0) return 0;

    // Create intervals
    const intervals = segments.map(seg => ({
        start: new Date(seg.startAt).getTime(),
        end: new Date(seg.endAt).getTime()
    }));

    // Sort by start time
    intervals.sort((a, b) => a.start - b.start);

    // Merge overlapping intervals
    const merged = [intervals[0]];
    for (let i = 1; i < intervals.length; i++) {
        const last = merged[merged.length - 1];
        const current = intervals[i];

        if (current.start <= last.end) {
            last.end = Math.max(last.end, current.end);
        } else {
            merged.push(current);
        }
    }

    // Sum durations
    return merged.reduce((sum, interval) => sum + (interval.end - interval.start), 0);
}

function updateSummary() {
    const summary = calculateSummary(currentPeriod, currentDate);

    document.getElementById('totalWithOverlap').textContent = formatDuration(summary.totalWithOverlap);
    document.getElementById('totalActual').textContent = formatDuration(summary.totalActual);

    // Update task summary table
    const tbody = document.querySelector('#taskSummaryTable tbody');
    const taskData = Object.values(summary.byTask).filter(t => t.duration > 0);
    taskData.sort((a, b) => b.duration - a.duration);

    if (taskData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" style="text-align: center; color: var(--color-text-muted);">データなし</td></tr>';
    } else {
        tbody.innerHTML = taskData.map(t => `
      <tr>
        <td>
          <div class="log-task-cell">
            <div class="task-color-dot" style="background: ${t.item.color}"></div>
            ${escapeHtml(t.item.name)}
          </div>
        </td>
        <td>${formatDuration(t.duration)}</td>
      </tr>
    `).join('');
    }

    // Draw chart
    drawChart(summary);
    updateLegend();
}

// ========================================
// Chart Drawing
// ========================================
function getChartLabels(period, date) {
    const labels = [];
    const range = getPeriodRange(period, date);

    switch (period) {
        case 'day':
            labels.push(formatDate(date));
            break;
        case 'week':
            for (let i = 0; i < 7; i++) {
                const d = new Date(range.start);
                d.setDate(d.getDate() + i);
                const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
                labels.push(`${d.getDate()}日(${dayNames[d.getDay()]})`);
            }
            break;
        case 'month':
            const days = getDaysInMonth(date);
            for (let i = 1; i <= days; i++) {
                labels.push(`${i}`);
            }
            break;
        case 'year':
            for (let i = 1; i <= 12; i++) {
                labels.push(`${i}月`);
            }
            break;
        case 'all':
            // Get all months from first to last session
            if (state.sessions.length === 0) {
                labels.push('データなし');
            } else {
                const sorted = [...state.sessions].sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
                const first = new Date(sorted[0].startAt);
                const last = new Date(sorted[sorted.length - 1].endAt);
                const current = startOfMonth(first);
                while (current <= last) {
                    labels.push(`${current.getFullYear()}/${current.getMonth() + 1}`);
                    current.setMonth(current.getMonth() + 1);
                }
            }
            break;
    }

    return labels;
}

function getChartData(period, date, summary) {
    const labels = getChartLabels(period, date);
    const range = getPeriodRange(period, date);
    const datasets = {};

    state.items.forEach(item => {
        datasets[item.id] = {
            item,
            data: new Array(labels.length).fill(0)
        };
    });

    summary.segments.forEach(seg => {
        const segDate = new Date(seg.startAt);
        let index = -1;

        switch (period) {
            case 'day':
                index = 0;
                break;
            case 'week': {
                const weekStart = startOfWeek(date);
                const dayDiff = Math.floor((segDate - weekStart) / 86400000);
                index = Math.max(0, Math.min(6, dayDiff));
                break;
            }
            case 'month':
                index = segDate.getDate() - 1;
                break;
            case 'year':
                index = segDate.getMonth();
                break;
            case 'all': {
                const monthKey = `${segDate.getFullYear()}/${segDate.getMonth() + 1}`;
                index = labels.indexOf(monthKey);
                break;
            }
        }

        if (index >= 0 && index < labels.length && datasets[seg.itemId]) {
            datasets[seg.itemId].data[index] += seg.duration;
        }
    });

    return { labels, datasets: Object.values(datasets) };
}

function drawChart(summary) {
    const canvas = document.getElementById('summaryChart');
    const ctx = canvas.getContext('2d');
    const container = canvas.parentElement;

    // Set canvas size
    const dpr = window.devicePixelRatio || 1;
    canvas.width = container.clientWidth * dpr;
    canvas.height = container.clientHeight * dpr;
    canvas.style.width = container.clientWidth + 'px';
    canvas.style.height = container.clientHeight + 'px';
    ctx.scale(dpr, dpr);

    const width = container.clientWidth;
    const height = container.clientHeight;
    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Get theme colors
    const style = getComputedStyle(document.documentElement);
    const textColor = style.getPropertyValue('--color-chart-text').trim();
    const gridColor = style.getPropertyValue('--color-chart-grid').trim();
    const bgColor = style.getPropertyValue('--color-bg-secondary').trim();

    // Clear canvas
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    const chartData = getChartData(currentPeriod, currentDate, summary);
    const { labels, datasets } = chartData;

    if (labels.length === 0 || labels[0] === 'データなし') {
        ctx.fillStyle = textColor;
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('データがありません', width / 2, height / 2);
        return;
    }

    // Calculate max value for stacked bars
    const stackedTotals = labels.map((_, i) =>
        datasets.reduce((sum, ds) => sum + ds.data[i], 0)
    );
    const maxValue = Math.max(...stackedTotals, 1);

    const barWidth = Math.min(40, (chartWidth / labels.length) * 0.7);
    const barGap = chartWidth / labels.length;

    // Draw grid lines
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
        const y = padding.top + (chartHeight / gridLines) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();

        // Draw Y axis labels (hours)
        const value = ((gridLines - i) / gridLines) * maxValue;
        const hours = Math.round(value / 3600000 * 10) / 10;
        ctx.fillStyle = textColor;
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${hours}h`, padding.left - 8, y + 4);
    }

    // Store bar positions for tooltip
    canvas.barData = [];

    // Draw stacked bars
    labels.forEach((label, i) => {
        const x = padding.left + barGap * i + (barGap - barWidth) / 2;
        let currentY = padding.top + chartHeight;

        datasets.forEach(ds => {
            if (ds.data[i] > 0) {
                const barHeight = (ds.data[i] / maxValue) * chartHeight;
                const y = currentY - barHeight;

                ctx.fillStyle = ds.item.color;
                ctx.fillRect(x, y, barWidth, barHeight);

                canvas.barData.push({
                    x, y, width: barWidth, height: barHeight,
                    item: ds.item,
                    value: ds.data[i],
                    label
                });

                currentY = y;
            }
        });

        // Draw X axis labels
        ctx.fillStyle = textColor;
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, x + barWidth / 2, height - padding.bottom + 20);
    });
}

function updateLegend() {
    const container = document.getElementById('chartLegend');
    container.innerHTML = state.items.map(item => `
    <div class="legend-item">
      <div class="legend-color" style="background: ${item.color}"></div>
      <span>${escapeHtml(item.name)}</span>
    </div>
  `).join('');
}

// ========================================
// Chart Tooltip
// ========================================
function setupChartTooltip() {
    const canvas = document.getElementById('summaryChart');
    const tooltip = document.getElementById('chartTooltip');

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (!canvas.barData) return;

        const bar = canvas.barData.find(b =>
            x >= b.x && x <= b.x + b.width &&
            y >= b.y && y <= b.y + b.height
        );

        if (bar) {
            tooltip.innerHTML = `
        <strong>${escapeHtml(bar.item.name)}</strong><br>
        ${bar.label}: ${formatDuration(bar.value)}
      `;
            tooltip.style.display = 'block';
            tooltip.style.left = (e.clientX - rect.left + 10) + 'px';
            tooltip.style.top = (e.clientY - rect.top - 10) + 'px';
        } else {
            tooltip.style.display = 'none';
        }
    });

    canvas.addEventListener('mouseleave', () => {
        tooltip.style.display = 'none';
    });
}

// ========================================
// Period Navigation
// ========================================
function updatePeriodDisplay() {
    const dateInput = document.getElementById('periodDate');
    dateInput.value = toLocalDateString(currentDate);
}

function navigatePeriod(direction) {
    switch (currentPeriod) {
        case 'day':
            currentDate.setDate(currentDate.getDate() + direction);
            break;
        case 'week':
            currentDate.setDate(currentDate.getDate() + 7 * direction);
            break;
        case 'month':
            currentDate.setMonth(currentDate.getMonth() + direction);
            break;
        case 'year':
            currentDate.setFullYear(currentDate.getFullYear() + direction);
            break;
        case 'all':
            // No navigation for all time
            break;
    }
    updatePeriodDisplay();
    updateSummary();
}

// ========================================
// Export / Import
// ========================================
function exportData() {
    const data = {
        version: 1,
        exportedAt: new Date().toISOString(),
        items: state.items,
        sessions: state.sessions,
        activeSessions: state.activeSessions,
        settings: state.settings
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `work-timer-backup-${toLocalDateString(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('データをエクスポートしました');
}

function importData(file) {
    const reader = new FileReader();

    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);

            // Validate structure
            if (!data.items || !data.sessions || !Array.isArray(data.items) || !Array.isArray(data.sessions)) {
                throw new Error('Invalid data format');
            }

            if (!confirm('現在のデータをすべて上書きします。よろしいですか？')) {
                return;
            }

            state.items = data.items || [];
            state.sessions = data.sessions || [];
            state.activeSessions = data.activeSessions || [];
            state.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };

            saveState();
            applyTheme();
            renderTaskList();
            updateLogFilterOptions();
            renderLogTable();
            updateSummary();
            updateSettingsForm();

            showToast('データをインポートしました');
        } catch (err) {
            console.error('Import error:', err);
            showToast('インポートに失敗しました。ファイル形式を確認してください。', 'error');
        }
    };

    reader.readAsText(file);
}

// ========================================
// Settings
// ========================================
function updateSettingsForm() {
    document.getElementById('concurrencyMode').value = state.settings.concurrencyMode;
    document.getElementById('maxConcurrent').value = state.settings.maxConcurrent;
    document.getElementById('themeSelect').value = state.settings.theme;

    const maxGroup = document.getElementById('maxConcurrentGroup');
    maxGroup.style.display = state.settings.concurrencyMode === 'multi' ? 'block' : 'none';
}

// ========================================
// Event Listeners
// ========================================
function initEventListeners() {
    // Theme toggle
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);

    // Export/Import
    document.getElementById('exportBtn').addEventListener('click', exportData);
    document.getElementById('importBtn').addEventListener('click', () => {
        document.getElementById('importFile').click();
    });
    document.getElementById('importFile').addEventListener('change', (e) => {
        if (e.target.files[0]) {
            importData(e.target.files[0]);
            e.target.value = '';
        }
    });

    // Settings modal
    document.getElementById('settingsBtn').addEventListener('click', () => {
        updateSettingsForm();
        openModal('settingsModal');
    });

    document.getElementById('concurrencyMode').addEventListener('change', (e) => {
        const maxGroup = document.getElementById('maxConcurrentGroup');
        maxGroup.style.display = e.target.value === 'multi' ? 'block' : 'none';
    });

    document.getElementById('settingsForm').addEventListener('submit', (e) => {
        e.preventDefault();
        state.settings.concurrencyMode = document.getElementById('concurrencyMode').value;
        state.settings.maxConcurrent = parseInt(document.getElementById('maxConcurrent').value) || 3;
        state.settings.theme = document.getElementById('themeSelect').value;
        saveState();
        applyTheme();
        closeModal('settingsModal');
        showToast('設定を保存しました');
    });

    // Task modal
    document.getElementById('addTaskBtn').addEventListener('click', () => {
        document.getElementById('taskModalTitle').textContent = 'タスク追加';
        document.getElementById('taskName').value = '';
        document.getElementById('taskColor').value = '#4A90D9';
        document.getElementById('taskNote').value = '';
        document.getElementById('taskEditId').value = '';
        openModal('taskModal');
    });

    document.getElementById('taskForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('taskName').value;
        const color = document.getElementById('taskColor').value;
        const note = document.getElementById('taskNote').value;
        const editId = document.getElementById('taskEditId').value;

        if (editId) {
            updateTask(editId, name, color, note);
        } else {
            addTask(name, color, note);
        }
        closeModal('taskModal');
    });

    // Log modal
    document.getElementById('addLogBtn').addEventListener('click', openAddLogModal);

    document.getElementById('logForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const itemId = document.getElementById('logTask').value;
        const startAt = document.getElementById('logStartAt').value;
        const endAt = document.getElementById('logEndAt').value;
        const note = document.getElementById('logNote').value;
        const editId = document.getElementById('logEditId').value;

        if (saveLog(itemId, startAt, endAt, note, editId)) {
            closeModal('logModal');
        }
    });

    // Log filters
    document.getElementById('logFilterTask').addEventListener('change', renderLogTable);
    document.getElementById('logFilterDateFrom').addEventListener('change', renderLogTable);
    document.getElementById('logFilterDateTo').addEventListener('change', renderLogTable);
    document.getElementById('clearLogFilter').addEventListener('click', () => {
        document.getElementById('logFilterTask').value = '';
        document.getElementById('logFilterDateFrom').value = '';
        document.getElementById('logFilterDateTo').value = '';
        renderLogTable();
    });

    // Modal close buttons
    document.querySelectorAll('.modal-close, .btn-secondary[data-modal]').forEach(btn => {
        btn.addEventListener('click', () => {
            const modalId = btn.getAttribute('data-modal');
            if (modalId) closeModal(modalId);
        });
    });

    // Close modal on backdrop click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
            }
        });
    });

    // Period tabs
    document.querySelectorAll('.period-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.period-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentPeriod = tab.dataset.period;
            updateSummary();
        });
    });

    // Period navigation
    document.getElementById('prevPeriod').addEventListener('click', () => navigatePeriod(-1));
    document.getElementById('nextPeriod').addEventListener('click', () => navigatePeriod(1));
    document.getElementById('periodDate').addEventListener('change', (e) => {
        currentDate = new Date(e.target.value);
        updateSummary();
    });

    // Theme media query listener
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (state.settings.theme === 'system') {
            applyTheme();
        }
    });

    // Window resize for chart
    window.addEventListener('resize', () => {
        updateSummary();
    });
}

// ========================================
// Initialization
// ========================================
function init() {
    loadState();
    applyTheme();
    renderTaskList();
    updateLogFilterOptions();
    renderLogTable();
    updatePeriodDisplay();
    updateSummary();
    initEventListeners();
    setupChartTooltip();

    // Restore running timers
    if (state.activeSessions.length > 0) {
        startTimerUpdates();
    }
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
