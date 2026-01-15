/**
 * TimeFlow - Complete Implementation
 * All features from original specification
 */

(function () {
    console.log('TimeFlow: Immediate execution check...');
    window.switchView = function (view) {
        console.log('switchView called with:', view);
        const titles = { dashboard: 'ダッシュボード', tasks: 'タスク管理', logs: 'ログ一覧', settings: '設定', help: '使い方ガイド' };
        const pageTitleEl = document.getElementById('pageTitle');
        if (pageTitleEl) pageTitleEl.textContent = titles[view] || '';

        document.querySelectorAll('.view-container').forEach(v => v.classList.add('hidden'));
        const viewEl = document.getElementById(view + 'View');
        if (viewEl) viewEl.classList.remove('hidden');

        if (view === 'dashboard' && typeof renderAll === 'function') renderAll();
        if (view === 'logs' && typeof renderLogTable === 'function') renderLogTable();
        if (view === 'tasks' && typeof renderFullTaskList === 'function') renderFullTaskList();
        if (view === 'settings' && typeof loadSettingsForm === 'function') loadSettingsForm();
    };
    console.log('TimeFlow: window.switchView exposed.');
})();

console.log('TimeFlow: app.js loaded and executing main scope...');

const STORAGE_KEYS = {
    items: 'timeflow.items',
    sessions: 'timeflow.sessions',
    activeSessions: 'timeflow.activeSessions',
    settings: 'timeflow.settings'
};

const SUPABASE_CONFIG = {
    url: 'https://uvdtgsrolmnokxruhjsa.supabase.co',
    key: 'sb_publishable_P_u472Y4qc80PRMaJsu7kQ_gbC4xEfZ'
};

const DEFAULT_SETTINGS = {
    concurrencyMode: 'multi',
    maxConcurrent: 10,
    weekStartsOn: 'monday',
    taskCardHeight: 300,
    displayName: ''
};

const COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#EC4899', '#F59E0B', '#EF4444', '#6366F1', '#14B8A6'];

let state = { items: [], sessions: [], activeSessions: [], pausedSessions: {}, settings: { ...DEFAULT_SETTINGS } };
let currentPeriod = 'day';
let currentDate = new Date();
let customStartDate = null;
let customEndDate = null;
let timerInterval = null;
let currentUsername = null;
let supabaseClient = null;

// ========================================
// Initialization
// ========================================
window.onload = async () => {
    console.log('TimeFlow: window.onload triggered');
    // 1. Core UI Init (Sync) - Must run first and not block
    initClock();
    initEventListeners();

    // 2. Data Init (Async) - Wrap in try/catch to prevent blocking UI
    try {
        initSupabase();
        await handleCloudSync();
    } catch (e) {
        console.error('Initialization error:', e);
        loadFromLocalStorage(); // Fallback
    }

    // 3. Final Render
    renderAll();

    // 4. Start timer loop if there are active sessions
    // Use a clean check that filters out null/undefined values
    const hasActiveSessions = state.activeSessions && state.activeSessions.filter(s => s && s.itemId).length > 0;
    console.log('TimeFlow: Active sessions check:', hasActiveSessions, state.activeSessions);
    if (hasActiveSessions) {
        console.log('TimeFlow: Starting timer loop for active sessions');
        startTimerLoop();
    }
};

function initSupabase() {
    if (!window.supabase) {
        console.error('Supabase SDK not loaded');
        return;
    }
    supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);
}

async function handleCloudSync() {
    const urlParams = new URLSearchParams(window.location.search);
    currentUsername = urlParams.get('user');

    if (!currentUsername) {
        // No user specified, fallback to LocalStorage for safety but show a hint
        loadFromLocalStorage();
        return;
    }

    // First, try to load from user-specific local storage (always available, no network needed)
    const localState = loadFromUserLocalStorage();

    // Try to load from Cloud
    showToast(`${currentUsername} さんのデータを読み込み中...`);
    const cloudState = await loadFromCloud(currentUsername);

    if (cloudState) {
        console.log('TimeFlow: Cloud state found, merging with local state');
        // Merge strategy: 
        // 1. Items: prefer one with later updated_at if exists
        const itemMap = new Map();
        [...(localState?.items || []), ...(cloudState.items || [])].forEach(item => {
            const existing = itemMap.get(item.id);
            if (!existing || (item.updatedAt > existing.updatedAt)) {
                itemMap.set(item.id, item);
            }
        });

        // 2. Sessions: unique by ID (sessions are generally immutable logs)
        const sessionMap = new Map();
        [...(localState?.sessions || []), ...(cloudState.sessions || [])].forEach(s => {
            sessionMap.set(s.id, s);
        });

        state.items = Array.from(itemMap.values());
        state.sessions = Array.from(sessionMap.values());
        state.activeSessions = cloudState.activeSessions || [];
        state.settings = { ...state.settings, ...(cloudState.settings || {}) };

        // Also save to user-specific local storage as backup
        saveToUserLocalStorage();
        showToast('クラウドから同期しました');
    } else if (localState) {
        // Cloud failed or empty, but we have local data - use it
        state = { ...state, ...localState };
        showToast('ローカルデータから復元しました');
        // Try to sync to cloud (don't await, do in background)
        saveToCloud().catch(e => console.error('Background cloud sync error:', e));
    } else {
        // Truly new user - start with empty state (don't inherit from other users)
        resetToEmptyState();
        showToast('新しいユーザーとして開始します');
        // Try to save to cloud (don't await)
        saveToCloud().catch(e => console.error('Background cloud sync error:', e));
    }
}

// Reset state to empty for new users
function resetToEmptyState() {
    state.items = [];
    state.sessions = [];
    state.activeSessions = [];
    state.pausedSessions = {};
    state.settings = { ...DEFAULT_SETTINGS };
}

// User-specific local storage functions
function getUserStorageKey(key) {
    if (!currentUsername) return key;
    return `${key}.${currentUsername}`;
}

function saveToUserLocalStorage() {
    if (!currentUsername) return;
    try {
        localStorage.setItem(getUserStorageKey(STORAGE_KEYS.items), JSON.stringify(state.items));
        localStorage.setItem(getUserStorageKey(STORAGE_KEYS.sessions), JSON.stringify(state.sessions));
        localStorage.setItem(getUserStorageKey(STORAGE_KEYS.activeSessions), JSON.stringify(state.activeSessions));
        localStorage.setItem(getUserStorageKey(STORAGE_KEYS.settings), JSON.stringify(state.settings));
        localStorage.setItem(getUserStorageKey('timeflow.pausedSessions'), JSON.stringify(state.pausedSessions));
    } catch (e) { console.error('User local save error:', e); }
}

function loadFromUserLocalStorage() {
    if (!currentUsername) return null;
    try {
        const items = localStorage.getItem(getUserStorageKey(STORAGE_KEYS.items));
        if (!items) return null; // No user-specific data
        return {
            items: JSON.parse(items),
            sessions: JSON.parse(localStorage.getItem(getUserStorageKey(STORAGE_KEYS.sessions)) || '[]'),
            activeSessions: JSON.parse(localStorage.getItem(getUserStorageKey(STORAGE_KEYS.activeSessions)) || '[]'),
            settings: { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(getUserStorageKey(STORAGE_KEYS.settings)) || '{}') },
            pausedSessions: JSON.parse(localStorage.getItem(getUserStorageKey('timeflow.pausedSessions')) || '{}')
        };
    } catch (e) {
        console.error('User local load error:', e);
        return null;
    }
}

async function loadFromCloud(username) {
    try {
        // Simple timeout wrapper for Supabase call
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Cloud load timeout')), 5000)
        );

        const fetchPromise = supabaseClient
            .from('user_data')
            .select('state')
            .eq('username', username)
            .single();

        const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);

        if (error) {
            if (error.code === 'PGRST116') return null; // Not found
            throw error;
        }
        return data.state;
    } catch (e) {
        console.error('Cloud load error:', e);
        return null;
    }
}

async function saveToCloud() {
    if (!currentUsername || !supabaseClient) return;
    try {
        // Remove transient timer values before saving if any (optional)
        const { error } = await supabaseClient
            .from('user_data')
            .upsert({
                username: currentUsername,
                state: state,
                updated_at: new Date().toISOString()
            });

        if (error) throw error;
    } catch (e) {
        console.error('Cloud save error:', e);
    }
}

function loadFromLocalStorage() {
    try {
        state.items = JSON.parse(localStorage.getItem(STORAGE_KEYS.items) || '[]');
        state.sessions = JSON.parse(localStorage.getItem(STORAGE_KEYS.sessions) || '[]');
        state.activeSessions = JSON.parse(localStorage.getItem(STORAGE_KEYS.activeSessions) || '[]');
        state.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) || '{}') };
        state.pausedSessions = JSON.parse(localStorage.getItem('timeflow.pausedSessions') || '{}');
    } catch (e) { console.error('Local load error:', e); }
}

async function saveState() {
    // Save to generic LocalStorage (for no-user mode)
    if (!currentUsername) {
        localStorage.setItem(STORAGE_KEYS.items, JSON.stringify(state.items));
        localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(state.sessions));
        localStorage.setItem(STORAGE_KEYS.activeSessions, JSON.stringify(state.activeSessions));
        localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
        localStorage.setItem('timeflow.pausedSessions', JSON.stringify(state.pausedSessions));
    } else {
        // Save to user-specific local storage as backup
        saveToUserLocalStorage();
        // Save to Cloud
        await saveToCloud();
    }
}



// ========================================
// Clock
// ========================================
function initClock() {
    const update = () => {
        const now = new Date();
        document.getElementById('currentTime').textContent = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false });
        document.getElementById('currentDate').textContent = now.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
    };
    update();
    setInterval(update, 10000);
}

// ========================================
// Navigation
// ========================================
function initEventListeners() {
    // Navigation (Sidebar)
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            // Sync bottom nav
            const bottomBtn = document.querySelector(`.bottom-nav-item[data-view="${btn.dataset.view}"]`);
            if (bottomBtn) bottomBtn.classList.add('active');
            switchView(btn.dataset.view);
        });
    });

    // Navigation (Bottom - Mobile)
    document.querySelectorAll('.bottom-nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            // Sync sidebar nav
            const sideBtn = document.querySelector(`.nav-item[data-view="${btn.dataset.view}"]`);
            if (sideBtn) sideBtn.classList.add('active');
            switchView(btn.dataset.view);
        });
    });

    // Chart Period
    document.querySelectorAll('.chart-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.chart-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentPeriod = btn.dataset.period;

            // Show/hide custom date range
            const customRange = document.getElementById('customDateRange');
            if (customRange) {
                if (currentPeriod === 'custom') {
                    customRange.classList.remove('hidden');
                } else {
                    customRange.classList.add('hidden');
                }
            }
            updateSummary();
        });
    });

    // Period Navigation
    document.getElementById('prevPeriod').addEventListener('click', () => navigatePeriod(-1));
    document.getElementById('nextPeriod').addEventListener('click', () => navigatePeriod(1));

    // Task Form
    document.getElementById('taskForm').addEventListener('submit', handleTaskSubmit);

    // Log Form
    document.getElementById('logForm').addEventListener('submit', handleLogSubmit);

    // Log Filters
    document.getElementById('logFilterTask').addEventListener('change', renderLogTable);
    document.getElementById('logFilterFrom').addEventListener('change', renderLogTable);
    document.getElementById('logFilterTo').addEventListener('change', renderLogTable);

    // Settings Form
    document.getElementById('settingsForm').addEventListener('submit', handleSettingsSubmit);


    // Export/Import
    document.getElementById('exportBtn').addEventListener('click', exportData);
    document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
    document.getElementById('importFile').addEventListener('change', (e) => {
        if (e.target.files[0]) importData(e.target.files[0]);
        e.target.value = '';
    });

    // Modal keyboard
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));
        }
    });

    // Resize
    window.addEventListener('resize', () => updateSummary());


    // Chart tooltip
    setupChartTooltip();
}

// Function already defined at the top for global availability

// ========================================
// Render All
// ========================================
function renderAll() {
    renderActiveTask();
    renderStats();
    renderQuickTaskList();
    updateSummary();
    updateLogFilterOptions();
    if (typeof renderMiniWindowContent === 'function') renderMiniWindowContent();
}

// ========================================
// Task Management
// ========================================
function renderQuickTaskList(animateId = null) {
    const container = document.getElementById('taskListCompact');
    let activeTasks = state.items.filter(i => !i.archived);
    const archivedTasks = state.items.filter(i => i.archived);

    let html = '';

    if (!activeTasks.length && !archivedTasks.length) {
        container.innerHTML = '<div class="no-active-msg" style="padding:1rem;text-align:center;">タスクがありません</div>';
        return;
    }

    // Use manual order from state.items directly to respect drag & drop results
    const displayTasks = activeTasks;

    // Render tasks
    html += displayTasks.map(item => {



        const activeSession = state.activeSessions.find(s => s.itemId === item.id);
        const isActive = !!activeSession;
        const isPaused = !!state.pausedSessions[item.id];
        const isAnimating = animateId === item.id;

        let timerDisplay = '';
        if (isActive) {
            const currentElapsed = Date.now() - new Date(activeSession.startAt).getTime();
            const totalMs = (activeSession.accumulatedMs || 0) + currentElapsed;
            timerDisplay = formatDuration(totalMs);
        } else if (isPaused) {
            timerDisplay = formatDuration(state.pausedSessions[item.id]);
        }

        const statusClass = isActive ? 'active' : (isPaused ? 'paused' : '');
        const animationClass = isAnimating ? 'task-item-animate' : '';

        const estimatedDisplay = item.estimatedHours ? `<span class="task-estimated">(${item.estimatedHours})</span>` : '';
        const dueDateDisplay = item.dueDate ? `<span class="task-due-date">期日: ${formatDateShort(item.dueDate)}</span>` : '';

        return `
      <div class="task-item ${statusClass} ${animationClass}" draggable="true" data-id="${item.id}" data-task-id="${item.id}">
        <div class="task-color" style="background:${item.color};--task-glow-color:${item.color}"></div>
        <div class="task-details" data-edit-id="${item.id}">
          <div class="task-title">${escapeHtml(item.name)}${estimatedDisplay}</div>
          ${dueDateDisplay}
          ${item.note ? `<div class="task-note">${escapeHtml(item.note)}</div>` : ''}
        </div>

        <div class="task-timer ${isPaused ? 'paused' : ''}" data-timer="${item.id}">${timerDisplay}</div>
        <div class="task-btn-group">
          ${renderControlButtons(item)}
        </div>
      </div>
    `;


    }).join('');

    // Archived tasks section (collapsible)
    if (archivedTasks.length) {
        const arrowIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="transition:transform 0.3s"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
        html += `
        <div class="archive-section-compact">
            <button class="archive-toggle-btn-compact" onclick="toggleDashboardArchive()">
                <span class="archive-toggle-icon" id="dashboardArchiveIcon">${arrowIcon}</span>
                アーカイブ（${archivedTasks.length}件）
            </button>
            <div id="dashboardArchivedContainer" class="dashboard-archived-container hidden">
                ${archivedTasks.map(item => `
                    <div class="task-item archived" data-task-id="${item.id}">
                        <div class="task-color" style="background:${item.color};opacity:0.5"></div>
                        <div class="task-details">
                            <div class="task-title" style="opacity:0.7">${escapeHtml(item.name)}</div>
                        </div>
                        <div class="task-btn-group">
                            <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();restoreTask('${item.id}')" title="復元">↩</button>
                            <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();permanentlyDeleteTask('${item.id}')" title="完全削除">🗑</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>`;
    }

    container.innerHTML = html;

    // Initialize drag and drop for dashboard
    initDashboardDragAndDrop();

    // Add click-to-edit handlers (separate from drag)
    container.querySelectorAll('.task-details[data-edit-id]').forEach(el => {
        el.style.cursor = 'pointer';
        el.addEventListener('click', (e) => {
            // Only open modal if not dragging
            if (!draggedItem) {
                openTaskModal(el.dataset.editId);
            }
        });
    });
}


// Toggle dashboard archive section
window.toggleDashboardArchive = () => {
    const container = document.getElementById('dashboardArchivedContainer');
    const icon = document.getElementById('dashboardArchiveIcon');
    if (container && icon) {
        container.classList.toggle('hidden');
        icon.style.transform = container.classList.contains('hidden') ? '' : 'rotate(90deg)';
    }
};


function renderFullTaskList() {
    const container = document.getElementById('taskListFull');
    const activeTasks = state.items.filter(i => !i.archived);
    const archivedTasks = state.items.filter(i => i.archived);

    if (!state.items.length) {
        container.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-muted);">タスクがありません</div>';
        return;
    }

    let html = '';

    // Active tasks section
    if (activeTasks.length) {
        html += activeTasks.map((item, index) => renderTaskCard(item, index)).join('');
    } else {
        html += '<div style="padding:1rem;text-align:center;color:var(--text-muted);">アクティブなタスクがありません</div>';
    }

    // Archived tasks section (collapsible)
    if (archivedTasks.length) {
        const arrowIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="transition:transform 0.3s"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
        html += `
        <div class="archive-section">
            <button class="archive-toggle-btn" onclick="toggleArchiveSection()">
                <span class="archive-toggle-icon" id="archiveToggleIcon">${arrowIcon}</span>
                アーカイブ済み（${archivedTasks.length}件）
            </button>
            <div id="archivedTasksContainer" class="archived-tasks-container hidden">
                ${archivedTasks.map((item, index) => renderArchivedTaskCard(item, index)).join('')}
            </div>
        </div>`;
    }

    container.innerHTML = html;

    // Initialize drag and drop for active tasks only
    initDragAndDrop();
}

function renderTaskCard(item, index) {
    const activeSession = state.activeSessions.find(s => s.itemId === item.id);
    const isActive = !!activeSession;
    const isPaused = !!state.pausedSessions[item.id];

    let timerDisplay = '';
    let timerClass = '';
    if (isActive) {
        const currentElapsed = Date.now() - new Date(activeSession.startAt).getTime();
        const totalMs = (activeSession.accumulatedMs || 0) + currentElapsed;
        timerDisplay = formatDuration(totalMs);
    } else if (isPaused) {
        timerDisplay = formatDuration(state.pausedSessions[item.id]);
        timerClass = 'paused';
    }

    return `
      <div class="task-card-full ${isPaused ? 'paused' : ''}" draggable="true" data-task-id="${item.id}" data-index="${index}" style="--task-color:${item.color};--task-glow-color:${item.color}">
        <div class="task-color" style="background:${item.color}"></div>
        <div class="drag-handle" title="ドラッグして並べ替え">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.3"><circle cx="9" cy="5" r="1.5"></circle><circle cx="9" cy="12" r="1.5"></circle><circle cx="9" cy="19" r="1.5"></circle><circle cx="15" cy="5" r="1.5"></circle><circle cx="15" cy="12" r="1.5"></circle><circle cx="15" cy="19" r="1.5"></circle></svg>
        </div>
        <div class="task-info">
          <div class="task-name">${escapeHtml(item.name)}</div>
          ${item.note ? `<div class="task-note">${escapeHtml(item.note)}</div>` : ''}
        </div>
        ${(isActive || isPaused) ? `<div class="task-timer-full ${timerClass}" data-timer="${item.id}">${timerDisplay}</div>` : ''}
        <div class="task-actions">
          ${renderControlButtons(item)}
          <button class="btn btn-sm btn-glass" onclick="event.stopPropagation();editTask('${item.id}')">編集</button>
          <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();archiveTask('${item.id}')">アーカイブ</button>
        </div>
      </div>
    `;
}
/**
 * Unified control buttons generator
 * Ensures consistency between Dashboard and Task Management
 */
function renderControlButtons(item) {
    const activeSession = state.activeSessions.find(s => s.itemId === item.id);
    const isActive = !!activeSession;
    const isPaused = !!state.pausedSessions[item.id];

    // SVG Icons
    const playIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M7 4L19 12L7 20V4Z"></path></svg>`;
    const pauseIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="5" width="3" height="14" rx="1.5"></rect><rect x="15" y="5" width="3" height="14" rx="1.5"></rect></svg>`;
    const completeIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;


    if (isActive) {
        return `
            <button class="btn btn-sm btn-icon-only btn-warning task-play-btn" onclick="event.stopPropagation();toggleTask('${item.id}')" title="一時停止">${pauseIcon}</button>
        `;
    } else if (isPaused) {
        return `
            <button class="btn btn-sm btn-icon-only btn-primary task-play-btn" onclick="event.stopPropagation();toggleTask('${item.id}')" title="再開">${playIcon}</button>
            <button class="btn btn-sm btn-icon-only btn-success task-play-btn" onclick="event.stopPropagation();stopTask('${item.id}')" title="完了">${completeIcon}</button>
        `;
    } else {
        return `<button class="btn btn-sm btn-icon-only btn-primary task-play-btn" onclick="event.stopPropagation();toggleTask('${item.id}')" title="開始">${playIcon}</button>`;
    }
}


function renderArchivedTaskCard(item, index) {
    const sessionCount = state.sessions.filter(s => s.itemId === item.id).length;
    return `
      <div class="task-card-full archived" style="--task-color:${item.color}">
        <div class="task-color" style="background:${item.color};width:12px;height:12px;opacity:0.5"></div>
        <div class="task-info" style="flex:1">
          <div class="task-name">${escapeHtml(item.name)}</div>
          <div class="task-note">ログ: ${sessionCount}件</div>
        </div>
        <div class="task-actions">
          <button class="btn btn-sm btn-primary" onclick="event.stopPropagation();restoreTask('${item.id}')">復元</button>
          <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();permanentlyDeleteTask('${item.id}')">完全削除</button>
        </div>
      </div>
    `;
}

window.toggleArchiveSection = () => {
    const container = document.getElementById('archivedTasksContainer');
    const icon = document.getElementById('archiveToggleIcon');
    if (container) {
        container.classList.toggle('hidden');
        const isHidden = container.classList.contains('hidden');
        icon.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(90deg)';
    }
};

window.openTaskModal = (id = null) => {
    const modal = document.getElementById('taskModal');
    const title = document.getElementById('taskModalTitle');
    document.getElementById('taskEditId').value = id || '';

    // History elements
    const historySection = document.getElementById('taskHistorySection');
    const historyList = document.getElementById('taskHistoryList');

    if (id) {
        const item = state.items.find(i => i.id === id);
        if (item) {
            title.textContent = 'タスク編集';
            document.getElementById('taskName').value = item.name;
            document.getElementById('taskColor').value = item.color;
            document.getElementById('taskNote').value = item.note || '';
            const estimatedEl = document.getElementById('taskEstimatedHours');
            if (estimatedEl) estimatedEl.value = item.estimatedHours || '';
            const dueDateEl = document.getElementById('taskDueDate');
            if (dueDateEl) dueDateEl.value = item.dueDate || '';

            // Render History
            if (historySection && historyList) {
                historySection.classList.remove('hidden');

                // Get related logs
                const logs = state.sessions
                    .filter(s => s.itemId === id)
                    .sort((a, b) => new Date(b.startAt) - new Date(a.startAt));

                if (logs.length > 0) {
                    historyList.innerHTML = logs.map(log => {
                        const dur = formatDuration(new Date(log.endAt) - new Date(log.startAt));
                        const date = formatDateShort(log.startAt) + ' ' + formatTime(log.startAt);
                        return `
                            <li class="history-item">
                                <span class="history-date">${date}</span>
                                <span class="history-duration">${dur}</span>
                            </li>
                        `;
                    }).join('');
                } else {
                    historyList.innerHTML = '<li class="history-item" style="justify-content:center;">履歴はありません</li>';
                }
            }
        }
    } else {
        title.textContent = 'タスク追加';
        document.getElementById('taskName').value = '';
        document.getElementById('taskNote').value = '';
        document.getElementById('taskColor').value = COLORS[0];
        const estimatedEl = document.getElementById('taskEstimatedHours');
        if (estimatedEl) estimatedEl.value = '';
        const dueDateEl = document.getElementById('taskDueDate');
        if (dueDateEl) dueDateEl.value = '';

        // Hide history for new task
        if (historySection) historySection.classList.add('hidden');
    }

    renderColorPicker();
    modal.classList.add('show');
    document.getElementById('taskName').focus();
};



window.editTask = (id) => openTaskModal(id);

// Cancel task without recording (reset timer)
window.cancelTask = (id) => {
    const item = state.items.find(i => i.id === id);
    if (!item) return;

    showConfirm('計測のキャンセル', `「${item.name}」の計測をキャンセルしますか？\n（このセッションは記録されません）`, () => {
        // Remove from active sessions
        const idx = state.activeSessions.findIndex(s => s.itemId === id);
        if (idx !== -1) {
            state.activeSessions.splice(idx, 1);
            if (state.activeSessions.length === 0) stopTimerLoop();
        }

        // Also clear paused state
        delete state.pausedSessions[id];

        saveState();
        renderAll();
        renderFullTaskList();
        showToast('計測をキャンセルしました', 'warning');
    });
};

// Custom confirmation helper
const showConfirm = (title, message, onConfirm) => {
    const modal = document.getElementById('confirmModal');
    const titleEl = document.getElementById('confirmTitle');
    const messageEl = document.getElementById('confirmMessage');
    const okBtn = document.getElementById('confirmOk');
    const cancelBtn = document.getElementById('confirmCancel');

    titleEl.textContent = title;
    messageEl.textContent = message;
    modal.classList.add('show');

    // Cleanup existing listeners
    const newOkBtn = okBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    newOkBtn.addEventListener('click', () => {
        modal.classList.remove('show');
        onConfirm();
    });

    newCancelBtn.addEventListener('click', () => {
        modal.classList.remove('show');
    });

    modal.onclick = (event) => {
        if (event.target == modal) {
            modal.classList.remove('show');
        }
    };
};

// Archive task (soft delete) - no confirmation
window.archiveTask = (id) => {
    const item = state.items.find(i => i.id === id);
    if (!item) return;

    // Stop any active session for this task
    state.activeSessions = state.activeSessions.filter(s => s.itemId !== id);
    delete state.pausedSessions[id];
    if (state.activeSessions.length === 0) stopTimerLoop();

    // Mark as archived
    item.archived = true;
    item.archivedAt = new Date().toISOString();

    saveState();

    // UI Updates - call individually to avoid one failure stopping others
    try { renderActiveTask(); } catch (e) { console.error(e); }
    try { renderQuickTaskList(); } catch (e) { console.error(e); }
    try { renderFullTaskList(); } catch (e) { console.error(e); }
    try { updateSummary(); } catch (e) { console.error(e); }
    try { updateLogFilterOptions(); } catch (e) { console.error(e); }

    showToast('タスクをアーカイブしました');
};

// Restore archived task
window.restoreTask = (id) => {
    const item = state.items.find(i => i.id === id);
    if (!item) return;

    item.archived = false;
    delete item.archivedAt;

    saveState();
    renderAll();
    renderFullTaskList();
    showToast('タスクを復元しました');
};

// Permanently delete task (from archive)
window.permanentlyDeleteTask = (id) => {
    const item = state.items.find(i => i.id === id);
    if (!item) return;

    const sessionCount = state.sessions.filter(s => s.itemId === id).length;
    const msg = sessionCount > 0
        ? `「${item.name}」を完全に削除しますか？\n\n関連するログ ${sessionCount} 件も削除されます。\n\n※この操作は取り消せません`
        : `「${item.name}」を完全に削除しますか？\n\n※この操作は取り消せません`;

    showConfirm('完全削除', msg, () => {
        state.sessions = state.sessions.filter(s => s.itemId !== id);
        state.items = state.items.filter(i => i.id !== id);

        saveState();
        renderAll();
        renderFullTaskList();
        updateLogFilterOptions();
        showToast('タスクを完全に削除しました');
    });
};

window.confirmDeleteTask = window.archiveTask; // Alias for backward compatibility
window.deleteTask = window.archiveTask;

function handleTaskSubmit(e) {
    e.preventDefault();
    const editId = document.getElementById('taskEditId').value;
    const name = document.getElementById('taskName').value.trim();
    const color = document.getElementById('taskColor').value;
    const note = document.getElementById('taskNote').value.trim();
    const estimatedHours = document.getElementById('taskEstimatedHours')?.value.trim() || '';
    const dueDate = document.getElementById('taskDueDate')?.value || '';

    let animateId = null;
    if (editId) {
        const idx = state.items.findIndex(i => i.id === editId);
        if (idx !== -1) {
            state.items[idx] = { ...state.items[idx], name, color, note, estimatedHours, dueDate };
        }
        animateId = editId;
        showToast('タスクを更新しました');
    } else {
        const newId = generateId();
        state.items.push({ id: newId, name, color, note, estimatedHours, dueDate, createdAt: new Date().toISOString() });
        animateId = newId;
        showToast('タスクを追加しました');
    }

    saveState();
    closeModal('taskModal');
    renderStats();
    renderQuickTaskList(animateId);
    renderFullTaskList();
}




function renderColorPicker() {
    const container = document.getElementById('colorPicker');
    const current = document.getElementById('taskColor').value;
    container.innerHTML = COLORS.map(c => `
    <div class="color-option ${c === current ? 'selected' : ''}" style="background:${c}" onclick="selectColor('${c}')"></div>
  `).join('');
}

window.selectColor = (c) => {
    document.getElementById('taskColor').value = c;
    renderColorPicker();
};

// ========================================
// Timer Logic
// ========================================
window.toggleTask = (id) => {
    const activeIdx = state.activeSessions.findIndex(s => s.itemId === id);
    if (activeIdx !== -1) {
        // Active task: pause it (save accumulated time for resume)
        pauseTask(id);
        saveState();
        renderAll();
        renderFullTaskList();
    } else {
        startTask(id);
    }
};

function startTask(id) {
    console.log('TimeFlow: startTask called for', id);

    if (state.activeSessions.some(s => s.itemId === id)) {
        showToast('このタスクはすでに稼働中です', 'warning');
        return;
    }

    if (state.settings.concurrencyMode === 'single') {
        if (state.activeSessions.length > 0) {
            const current = state.activeSessions[0];
            pauseTask(current.itemId); // Pause instead of finish
        }
    } else {
        if (state.activeSessions.length >= state.settings.maxConcurrent) {
            showToast(`同時稼働数の上限（${state.settings.maxConcurrent}）に達しています`, 'warning');
            return;
        }
    }

    // Check if there's accumulated time from a previous pause
    const accumulated = state.pausedSessions[id] || 0;

    state.activeSessions.push({
        itemId: id,
        startAt: new Date().toISOString(),
        accumulatedMs: accumulated // Store accumulated time
    });

    // Clear paused state
    delete state.pausedSessions[id];

    // Move started task to top of list (active tasks at top)
    const taskIdx = state.items.findIndex(i => i.id === id);
    if (taskIdx > 0) {
        const [task] = state.items.splice(taskIdx, 1);
        state.items.unshift(task);
    }

    // CRITICAL: Start timer loop FIRST, before save (so timer starts even if save fails)
    console.log('TimeFlow: Starting timer loop from startTask');
    startTimerLoop();

    // Then update UI
    renderStats();
    renderQuickTaskList(id);
    renderFullTaskList();
    // Sync mini window
    if (typeof renderMiniWindowContent === 'function') renderMiniWindowContent();

    // Save state in background (don't block timer start)
    saveState().catch(e => console.error('TimeFlow: saveState error:', e));
}


window.stopTask = (id) => {
    console.log('TimeFlow: stopTask called for', id);

    // Check if task is in active sessions
    const activeIdx = state.activeSessions.findIndex(s => s.itemId === id);

    if (activeIdx !== -1) {
        // Task is active - use finishSession
        finishSession(id);
    } else if (state.pausedSessions[id] !== undefined) {
        // Task is paused - create log from paused time
        const totalMs = state.pausedSessions[id];
        const effectiveStartAt = new Date(Date.now() - totalMs).toISOString();

        state.sessions.push({
            id: generateId(),
            itemId: id,
            startAt: effectiveStartAt,
            endAt: new Date().toISOString(),
            note: ''
        });
        console.log('TimeFlow: Created session from paused state, duration:', totalMs);
    }

    // Clear any paused time since we recorded the full session
    delete state.pausedSessions[id];

    // Mark as archived and move to end of state.items for consistency
    const taskIdx = state.items.findIndex(i => i.id === id);
    if (taskIdx !== -1) {
        state.items[taskIdx].archived = true;
        state.items[taskIdx].archivedAt = new Date().toISOString();
        const [task] = state.items.splice(taskIdx, 1);
        state.items.push(task);
    }

    // Update UI and analysis immediately
    renderAll();
    updateSummary();
    // Sync mini window explicitly
    if (typeof renderMiniWindowContent === 'function') renderMiniWindowContent();

    // Save in background
    saveState().catch(e => console.error('TimeFlow: saveState error in stopTask:', e));
}





// Pause task (save accumulated time without recording log)
function pauseTask(id) {
    const idx = state.activeSessions.findIndex(s => s.itemId === id);
    if (idx === -1) return;

    const active = state.activeSessions[idx];
    const currentElapsed = Date.now() - new Date(active.startAt).getTime();
    const totalAccumulated = (active.accumulatedMs || 0) + currentElapsed;

    // Save accumulated time
    state.pausedSessions[id] = totalAccumulated;

    // Remove from active without creating log
    state.activeSessions.splice(idx, 1);

    if (state.activeSessions.length === 0) stopTimerLoop();
}

function finishSession(itemId) {
    const idx = state.activeSessions.findIndex(s => s.itemId === itemId);
    if (idx === -1) return;

    const active = state.activeSessions[idx];
    const currentElapsed = Date.now() - new Date(active.startAt).getTime();
    const totalMs = (active.accumulatedMs || 0) + currentElapsed;

    // Calculate proper start time for the full session
    const effectiveStartAt = new Date(Date.now() - totalMs).toISOString();

    state.sessions.push({
        id: generateId(),
        itemId,
        startAt: effectiveStartAt,
        endAt: new Date().toISOString(),
        note: ''
    });
    state.activeSessions.splice(idx, 1);

    if (state.activeSessions.length === 0) stopTimerLoop();
}

function startTimerLoop() {
    if (timerInterval) {
        console.log('TimeFlow: Timer loop already running');
        return;
    }
    console.log('TimeFlow: Starting timer loop');
    timerInterval = setInterval(updateTimers, 1000);
    // Immediately call updateTimers once to show initial values
    updateTimers();
}

function stopTimerLoop() {
    if (timerInterval) {
        console.log('TimeFlow: Stopping timer loop');
        clearInterval(timerInterval);
        timerInterval = null;
    }

    // Close mini window if open
    if (window.miniWindow && !window.miniWindow.closed) {
        window.miniWindow.close();
        window.miniWindow = null;
    }

    // Reset the analysis update counter when stopping
    analysisUpdateCounter = 0;
}

// ========================================
// Mini Timer (PiP)
// ========================================
window.miniWindow = null;

// ========================================
// Mini Dashboard (Multi-Task Window)
// ========================================
window.miniWindow = null;

window.openMiniDashboard = () => {
    if (window.miniWindow && !window.miniWindow.closed) {
        window.miniWindow.focus();
        return;
    }

    window.miniWindow = window.open('', 'TimeFlowMini', 'width=360,height=600,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes,popup=yes');

    if (!window.miniWindow) return;

    const doc = window.miniWindow.document;

    // Inject Styles
    doc.head.innerHTML = `
        <meta charset="UTF-8">
        <title>TimeFlow Mini</title>
        <link rel="stylesheet" href="${window.location.origin}/style.css"> 
        <style>
            body.mini-window-body { padding: 12px; background: var(--bg-body, #111827); color: var(--text-main, #fff); overflow-y: auto; }
            .mini-window-body .empty-msg { text-align: center; color: var(--text-muted); font-size: 13px; margin-top: 2rem; opacity: 0.7; }
        </style>
    `;
    doc.body.className = document.body.className + ' mini-window-body';

    renderMiniWindowContent();

    // Periodic sync to ensure mini window stays updated
    window.miniWindowSyncInterval = setInterval(() => {
        if (window.miniWindow && !window.miniWindow.closed) {
            renderMiniWindowContent();
        } else {
            clearInterval(window.miniWindowSyncInterval);
            window.miniWindowSyncInterval = null;
        }
    }, 500); // Sync every 500ms

    window.miniWindow.addEventListener('pagehide', () => {
        if (window.miniWindowSyncInterval) {
            clearInterval(window.miniWindowSyncInterval);
            window.miniWindowSyncInterval = null;
        }
        window.miniWindow = null;
    });
};

window.renderMiniWindowContent = () => {
    if (!window.miniWindow || window.miniWindow.closed) return;
    const doc = window.miniWindow.document;
    const container = doc.body;

    const activeList = state.activeSessions.map(s => s.itemId);
    const pausedList = Object.keys(state.pausedSessions);

    // Active and Paused items unique list
    const targetIds = [...new Set([...activeList, ...pausedList])];

    // Use dashboard order (state.items order) - filter to only active/paused but keep original order
    const targetItems = state.items.filter(i => targetIds.includes(i.id) && !i.archived);

    if (targetItems.length === 0) {
        container.innerHTML = '<div class="empty-msg" style="padding:2rem;text-align:center;color:#6b7280;font-size:13px;">アクティブなタスクは<br>ありません</div>';
        return;
    }

    const html = targetItems.map(item => {
        const activeSession = state.activeSessions.find(s => s.itemId === item.id);
        const isActive = !!activeSession;
        const isPaused = !!state.pausedSessions[item.id];

        let timerDisplay = '00:00:00';
        if (isActive) {
            const elapsed = (activeSession.accumulatedMs || 0) + (Date.now() - new Date(activeSession.startAt).getTime());
            timerDisplay = formatDuration(elapsed);
        } else if (isPaused) {
            timerDisplay = formatDuration(state.pausedSessions[item.id]);
        }

        const timerId = isActive ? `id="mini-timer-${item.id}"` : '';
        const playIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M7 4L19 12L7 20V4Z"></path></svg>`;
        const pauseIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="5" width="3" height="14" rx="1.5"></rect><rect x="15" y="5" width="3" height="14" rx="1.5"></rect></svg>`;
        const completeIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

        let buttons = '';
        if (isActive) {
            buttons = `<button class="btn btn-sm btn-icon-only btn-warning" onclick="window.opener.toggleTask('${item.id}')" data-tooltip="一時停止">${pauseIcon}</button>`;
        } else {
            buttons = `
                <button class="btn btn-sm btn-icon-only btn-primary" onclick="window.opener.toggleTask('${item.id}')" data-tooltip="再開">${playIcon}</button>
                <button class="btn btn-sm btn-icon-only btn-success" onclick="window.opener.stopTask('${item.id}')" data-tooltip="完了">${completeIcon}</button>
             `;
        }

        return `
            <div class="task-item ${isActive ? 'active' : 'paused'}" draggable="true" data-id="${item.id}" style="margin-bottom:8px;">
                <div class="task-color" style="background:${item.color};--task-glow-color:${item.color}"></div>
                <div class="task-details">
                     <div class="task-title" style="font-size:13px;">${escapeHtml(item.name)}</div>
                </div>
                <div class="task-timer ${isActive ? '' : 'paused'}" ${timerId} style="font-size:15px; min-width:auto;">${timerDisplay}</div>
                <div class="task-btn-group" style="gap:4px;">${buttons}</div>
            </div>
        `;
    }).join('');

    // Ensure we don't wipe styles if we were to append, but here we replace body innerHTML? 
    // No, that kills styles. Let's create a main container.
    let contentDiv = doc.getElementById('miniContent');
    if (!contentDiv) {
        contentDiv = doc.createElement('div');
        contentDiv.id = 'miniContent';
        doc.body.appendChild(contentDiv);
    }
    contentDiv.innerHTML = html;

    // Add drag and drop functionality to mini window
    setupMiniWindowDragAndDrop(doc);
};

// Mini window drag and drop setup
function setupMiniWindowDragAndDrop(doc) {
    const items = doc.querySelectorAll('.task-item[draggable="true"]');
    let draggedItem = null;

    items.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            draggedItem = item;
            item.style.opacity = '0.5';
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', item.dataset.id);
        });

        item.addEventListener('dragend', () => {
            item.style.opacity = '1';
            draggedItem = null;
            // Remove all drag-over styles
            doc.querySelectorAll('.task-item').forEach(i => i.classList.remove('drag-over'));
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });

        item.addEventListener('dragenter', (e) => {
            e.preventDefault();
            if (item !== draggedItem) {
                item.classList.add('drag-over');
            }
        });

        item.addEventListener('dragleave', () => {
            item.classList.remove('drag-over');
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
            item.classList.remove('drag-over');

            if (draggedItem && draggedItem !== item) {
                const draggedId = draggedItem.dataset.id;
                const targetId = item.dataset.id;

                // Reorder in main window's state
                if (window.opener && window.opener.reorderTasks) {
                    window.opener.reorderTasks(draggedId, targetId);
                }
            }
        });
    });
}

// Counter for 5-second interval updates (more reliable than timestamp comparison)
let analysisUpdateCounter = 0;

function updateTimers() {
    state.activeSessions.forEach(active => {
        // Update all timer displays for this task (dashboard and task management)
        const els = document.querySelectorAll(`[data-timer="${active.itemId}"]`);
        const currentElapsed = Date.now() - new Date(active.startAt).getTime();
        const totalMs = (active.accumulatedMs || 0) + currentElapsed;
        els.forEach(el => {
            el.textContent = formatDuration(totalMs);
        });

        // Update Mini Window if open and matches this task
        if (window.miniWindow && !window.miniWindow.closed) {
            const miniTimer = window.miniWindow.document.getElementById(`mini-timer-${active.itemId}`);
            if (miniTimer) miniTimer.textContent = formatDuration(totalMs);
        }
    });
    // Update main timer
    const mainEl = document.getElementById('mainTimerDisplay');
    if (mainEl && state.activeSessions.length > 0) {
        const first = state.activeSessions[0];
        const currentElapsed = Date.now() - new Date(first.startAt).getTime();
        const totalMs = (first.accumulatedMs || 0) + currentElapsed;
        mainEl.textContent = formatDuration(totalMs);
    }

    // Increment counter and update analysis every 5 seconds (5 ticks of 1-second interval)
    analysisUpdateCounter++;
    if (analysisUpdateCounter >= 5) {
        analysisUpdateCounter = 0;
        // Only update if dashboard view is visible
        const dashboardView = document.getElementById('dashboardView');
        if (dashboardView && !dashboardView.classList.contains('hidden')) {
            // Update stats and summary with active session time included
            renderStats();
            updateSummary();
        }
    }
}



function renderActiveTask() {
    const container = document.getElementById('activeTaskDisplay');
    const indicator = document.getElementById('liveIndicator');

    // Skip if elements don't exist (new dashboard layout)
    if (!container) return;

    if (state.activeSessions.length === 0) {
        container.innerHTML = `
      <div class="no-active-msg">セッション待機中</div>
      <button class="btn btn-primary" onclick="document.querySelector('[data-view=tasks]').click()">タスク管理へ</button>
    `;
        if (indicator) indicator.classList.remove('visible');
        return;
    }

    // Show all active sessions (multi-mode support)
    if (state.activeSessions.length === 1) {
        const active = state.activeSessions[0];
        const item = state.items.find(i => i.id === active.itemId);
        const elapsed = Date.now() - new Date(active.startAt).getTime();
        container.innerHTML = `
        <div class="active-timer-big" id="mainTimerDisplay">${formatDuration(elapsed)}</div>
        <div class="active-task-name" style="color:${item?.color || '#fff'}">${escapeHtml(item?.name || '不明')}</div>
        <div class="active-actions" style="display:flex; gap:10px; justify-content:center; align-items:center; margin-top:1rem;">
            <button class="btn btn-glass btn-sm" onclick="stopTask('${active.itemId}')" style="border-color:${item?.color}">セッション終了</button>
            <button class="btn btn-ghost btn-sm" onclick="openMiniDashboard()" title="ミニウィンドウで開く">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M15 3v6h6"></path><path d="M10 14L21 3"></path></svg>
            </button>
        </div>
      `;
    } else {
        // Multiple active sessions
        container.innerHTML = `
        <div class="multi-active-header" style="display:flex; justify-content:space-between; align-items:center;">
            <div class="multi-active-label">同時稼働中: ${state.activeSessions.length}件</div>
            <button class="btn btn-ghost btn-sm" onclick="openMiniDashboard()" title="ミニウィンドウで開く">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M15 3v6h6"></path><path d="M10 14L21 3"></path></svg>
            </button>
        </div>
        <div class="multi-active-list">
          ${state.activeSessions.map(active => {
            const item = state.items.find(i => i.id === active.itemId);
            const elapsed = Date.now() - new Date(active.startAt).getTime();
            return `
              <div class="multi-active-item">
                <div class="task-color" style="background:${item?.color || '#666'}"></div>
                <span class="multi-active-name">${escapeHtml(item?.name || '不明')}</span>
                <span class="multi-active-timer" data-timer="${active.itemId}">${formatDuration(elapsed)}</span>
                <button class="btn btn-sm btn-glass" onclick="stopTask('${active.itemId}')">停止</button>
              </div>
            `;
        }).join('')}
        </div>
      `;
    }
    if (indicator) indicator.classList.add('visible');
}

// ========================================
// Log Management
// ========================================
function updateLogFilterOptions() {
    const select = document.getElementById('logFilterTask');
    const logSelect = document.getElementById('logTask');
    const currentVal = select.value;

    const opts = '<option value="">すべてのタスク</option>' + state.items.map(i => `<option value="${i.id}">${escapeHtml(i.name)}</option>`).join('');
    select.innerHTML = opts;
    select.value = currentVal;

    logSelect.innerHTML = state.items.map(i => `<option value="${i.id}">${escapeHtml(i.name)}</option>`).join('');
}

function renderLogTable() {
    const tbody = document.getElementById('logTableBody');
    const filterTask = document.getElementById('logFilterTask').value;
    const filterFrom = document.getElementById('logFilterFrom').value;
    const filterTo = document.getElementById('logFilterTo').value;

    let logs = [...state.sessions];

    if (filterTask) logs = logs.filter(s => s.itemId === filterTask);
    if (filterFrom) logs = logs.filter(s => new Date(s.startAt) >= startOfDay(new Date(filterFrom)));
    if (filterTo) logs = logs.filter(s => new Date(s.startAt) <= endOfDay(new Date(filterTo)));

    logs.sort((a, b) => new Date(b.startAt) - new Date(a.startAt));

    if (!logs.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:2rem;">ログがありません</td></tr>';
        return;
    }

    tbody.innerHTML = logs.map(s => {
        const item = state.items.find(i => i.id === s.itemId);
        const dur = new Date(s.endAt) - new Date(s.startAt);
        return `
      <tr>
        <td>${formatDateShort(s.startAt)}</td>
        <td><div class="log-task-cell"><div class="task-color" style="background:${item?.color || '#666'}"></div>${escapeHtml(item?.name || '削除済み')}</div></td>
        <td>${formatTime(s.startAt)}</td>
        <td>${formatTime(s.endAt)}</td>
        <td>${formatDuration(dur)}</td>
        <td>${escapeHtml(s.note || '')}</td>
        <td>
          <button class="btn btn-sm btn-ghost" onclick="editLog('${s.id}')">編集</button>
          <button class="btn btn-sm btn-ghost" onclick="deleteLog('${s.id}')">削除</button>
        </td>
      </tr>
    `;
    }).join('');
}

window.clearLogFilters = () => {
    document.getElementById('logFilterTask').value = '';
    document.getElementById('logFilterFrom').value = '';
    document.getElementById('logFilterTo').value = '';
    renderLogTable();
};

window.openLogModal = (id = null) => {
    if (!state.items.length) {
        showToast('先にタスクを追加してください', 'warning');
        return;
    }

    const modal = document.getElementById('logModal');
    const title = document.getElementById('logModalTitle');

    document.getElementById('logEditId').value = id || '';
    updateLogFilterOptions();

    if (id) {
        const log = state.sessions.find(s => s.id === id);
        if (log) {
            title.textContent = 'ログ編集';
            document.getElementById('logTask').value = log.itemId;
            document.getElementById('logStartAt').value = formatDateTimeLocal(log.startAt);
            document.getElementById('logEndAt').value = formatDateTimeLocal(log.endAt);
            document.getElementById('logNote').value = log.note || '';
        }
    } else {
        title.textContent = 'ログ追加';
        document.getElementById('logTask').value = state.items[0]?.id || '';
        document.getElementById('logStartAt').value = formatDateTimeLocal(new Date(Date.now() - 3600000));
        document.getElementById('logEndAt').value = formatDateTimeLocal(new Date());
        document.getElementById('logNote').value = '';
    }

    modal.classList.add('show');
};

window.editLog = (id) => openLogModal(id);

window.deleteLog = (id) => {
    showConfirm('ログの削除', 'このログを削除しますか？', () => {
        state.sessions = state.sessions.filter(s => s.id !== id);
        saveState();
        renderLogTable();
        updateSummary();
        showToast('ログを削除しました');
    });
};

function handleLogSubmit(e) {
    e.preventDefault();

    const editId = document.getElementById('logEditId').value;
    const itemId = document.getElementById('logTask').value;
    const startAt = new Date(document.getElementById('logStartAt').value);
    const endAt = new Date(document.getElementById('logEndAt').value);
    const note = document.getElementById('logNote').value.trim();

    if (endAt <= startAt) {
        showToast('終了日時は開始日時より後にしてください', 'error');
        return;
    }

    if (editId) {
        const idx = state.sessions.findIndex(s => s.id === editId);
        if (idx !== -1) {
            state.sessions[idx] = { ...state.sessions[idx], itemId, startAt: startAt.toISOString(), endAt: endAt.toISOString(), note };
        }
        showToast('ログを更新しました');
    } else {
        state.sessions.push({ id: generateId(), itemId, startAt: startAt.toISOString(), endAt: endAt.toISOString(), note });
        showToast('ログを追加しました');
    }

    saveState();
    closeModal('logModal');
    renderLogTable();
    updateSummary();
}

// ========================================
// Summary & Chart
// ========================================
function renderStats() {
    // Dashboard stat cards should ideally reflect the same totals as the analysis, 
    // but fixed to Today/Week/Month regardless of analysis view period.
    const todaySum = calculateSummary('day', new Date());
    const weekSum = calculateSummary('week', new Date());
    const monthSum = calculateSummary('month', new Date());

    const getOverlapTotal = (s) => s.totalWithOverlap || 0;

    const elToday = document.getElementById('statToday');
    const elWeek = document.getElementById('statWeek');
    const elMonth = document.getElementById('statMonth');

    if (elToday) elToday.textContent = formatDurationShort(getOverlapTotal(todaySum));
    if (elWeek) elWeek.textContent = formatDurationShort(getOverlapTotal(weekSum));
    if (elMonth) elMonth.textContent = formatDurationShort(getOverlapTotal(monthSum));
}


function updateSummary() {
    const summary = calculateSummary(currentPeriod, currentDate);

    document.getElementById('periodLabel').textContent = getPeriodLabel(currentPeriod, currentDate);
    document.getElementById('totalOverlap').textContent = formatDuration(summary.totalWithOverlap);
    document.getElementById('totalActual').textContent = formatDuration(summary.totalActual);

    drawChart(summary);
    renderLegend();
    renderTaskBreakdown(summary);
}
window.updateSummary = updateSummary;

// Render task breakdown with numbers and bars
function renderTaskBreakdown(summary) {
    const container = document.getElementById('taskBreakdown');
    if (!container) return;

    const tasksWithTime = Object.values(summary.byTask)
        .filter(t => t.duration > 0)
        .sort((a, b) => b.duration - a.duration);

    if (!tasksWithTime.length) {
        container.innerHTML = '<div class="breakdown-empty">この期間のデータがありません</div>';
        return;
    }

    const maxDuration = tasksWithTime[0].duration;

    // Remove empty message if it exists
    if (container.querySelector('.breakdown-empty')) {
        container.innerHTML = '';
    }

    const currentItems = Array.from(container.querySelectorAll('.breakdown-item'));
    const currentIds = currentItems.map(el => el.dataset.id);
    const newIds = tasksWithTime.map(t => t.item.id);

    // If order or set of tasks changed, do a full re-render (stable order is handled by sort)
    if (JSON.stringify(currentIds) !== JSON.stringify(newIds)) {
        container.innerHTML = tasksWithTime.map(t => {
            const percent = maxDuration > 0 ? (t.duration / maxDuration) * 100 : 0;
            const percentOfTotal = summary.totalWithOverlap > 0
                ? Math.round((t.duration / summary.totalWithOverlap) * 100)
                : 0;
            return `
                <div class="breakdown-item" data-id="${t.item.id}">
                    <div class="breakdown-header">
                        <div class="breakdown-task">
                            <div class="task-color" style="background:${t.item.color}"></div>
                            <span class="breakdown-name">${escapeHtml(t.item.name)}</span>
                        </div>
                        <div class="breakdown-stats">
                            <span class="breakdown-time">${formatDuration(t.duration)}</span>
                            <span class="breakdown-percent">${percentOfTotal}%</span>
                        </div>
                    </div>
                    <div class="breakdown-bar-container">
                        <div class="breakdown-bar" style="width:${percent}%;background:${t.item.color}"></div>
                    </div>
                </div>
            `;
        }).join('');
    } else {
        // Granular update to prevent pulsing (keep same DOM elements)
        tasksWithTime.forEach((t, i) => {
            const el = currentItems[i];
            const percent = maxDuration > 0 ? (t.duration / maxDuration) * 100 : 0;
            const percentOfTotal = summary.totalWithOverlap > 0
                ? Math.round((t.duration / summary.totalWithOverlap) * 100)
                : 0;

            const timeEl = el.querySelector('.breakdown-time');
            const percEl = el.querySelector('.breakdown-percent');
            const barEl = el.querySelector('.breakdown-bar');

            if (timeEl) timeEl.textContent = formatDuration(t.duration);
            if (percEl) percEl.textContent = `${percentOfTotal}%`;
            if (barEl) barEl.style.width = `${percent}%`;
        });
    }
}


function calculateSummary(period, date) {
    if (!period) period = currentPeriod || 'day';
    if (!date) date = currentDate || new Date();

    const range = getPeriodRange(period, date);
    if (!range) return { segments: [], byTask: {}, totalWithOverlap: 0, totalActual: 0 };

    const excludeArchived = document.getElementById('excludeArchived')?.checked || false;

    // Filter items based on archive status (inverted logic: default show all)
    const visibleItems = excludeArchived
        ? state.items.filter(i => !i.archived)
        : state.items;
    const visibleItemIds = new Set(visibleItems.map(i => i.id));


    const relevantSessions = state.sessions.filter(s => {
        if (!visibleItemIds.has(s.itemId)) return false;
        const start = new Date(s.startAt);
        const end = new Date(s.endAt);
        return start < range.end && end > range.start;
    });

    // Split by day and clip
    const segments = [];
    const processSession = (s, isActive = false) => {
        const splits = splitSessionByDay(s);
        splits.forEach(seg => {
            const segStart = new Date(seg.startAt);
            const segEnd = new Date(seg.endAt);
            const clippedStart = segStart < range.start ? range.start : segStart;
            const clippedEnd = segEnd > range.end ? range.end : segEnd;
            if (clippedEnd > clippedStart) {
                segments.push({
                    ...seg,
                    startAt: clippedStart.toISOString(),
                    endAt: clippedEnd.toISOString(),
                    duration: clippedEnd - clippedStart,
                    isActive
                });
            }
        });
    };

    relevantSessions.forEach(s => processSession(s, false));

    // Include paused session time (unrecorded time from current sessions)
    Object.entries(state.pausedSessions).forEach(([itemId, duration]) => {
        if (!visibleItemIds.has(itemId)) return;
        // We treat paused time as occurring "now" for the purpose of today's summary
        // (Or more precisely, we create a pseudo-session ending now)
        const tempSession = {
            itemId: itemId,
            startAt: new Date(Date.now() - duration).toISOString(),
            endAt: new Date().toISOString()
        };
        processSession(tempSession, false);
    });

    // Include current active sessions in analysis
    state.activeSessions.forEach(as => {
        if (!visibleItemIds.has(as.itemId)) return;
        const currentElapsed = Date.now() - new Date(as.startAt).getTime();
        const totalMs = (as.accumulatedMs || 0) + currentElapsed;
        const tempSession = {
            itemId: as.itemId,
            startAt: new Date(Date.now() - totalMs).toISOString(),
            endAt: new Date().toISOString()
        };
        processSession(tempSession, true);
    });


    // Aggregate by task
    const byTask = {};
    visibleItems.forEach(item => { byTask[item.id] = { item, duration: 0 }; });
    segments.forEach(seg => { if (byTask[seg.itemId]) byTask[seg.itemId].duration += seg.duration; });

    const totalWithOverlap = Object.values(byTask).reduce((sum, t) => sum + t.duration, 0);
    const totalActual = calculateActualWorkingTime(segments);

    return { range, segments, byTask, totalWithOverlap, totalActual };
}

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

function calculateActualWorkingTime(segments) {
    if (!segments.length) return 0;
    const intervals = segments.map(s => ({ start: new Date(s.startAt).getTime(), end: new Date(s.endAt).getTime() }));
    intervals.sort((a, b) => a.start - b.start);
    const merged = [intervals[0]];
    for (let i = 1; i < intervals.length; i++) {
        const last = merged[merged.length - 1];
        const curr = intervals[i];
        if (curr.start <= last.end) {
            last.end = Math.max(last.end, curr.end);
        } else {
            merged.push(curr);
        }
    }
    return merged.reduce((sum, i) => sum + (i.end - i.start), 0);
}

function navigatePeriod(dir) {
    switch (currentPeriod) {
        case 'day': currentDate.setDate(currentDate.getDate() + dir); break;
        case 'week': currentDate.setDate(currentDate.getDate() + 7 * dir); break;
        case 'month': currentDate.setMonth(currentDate.getMonth() + dir); break;
        case 'year': currentDate.setFullYear(currentDate.getFullYear() + dir); break;
    }
    updateSummary();
}

function getPeriodLabel(period, date) {
    const d = new Date(date);
    switch (period) {
        case 'day': return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
        case 'week': { const ws = getWeekStart(d); const we = new Date(ws); we.setDate(we.getDate() + 6); return `${ws.getMonth() + 1}/${ws.getDate()} - ${we.getMonth() + 1}/${we.getDate()}`; }
        case 'month': return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' });
        case 'custom': {
            if (customStartDate && customEndDate) {
                return `${customStartDate.getMonth() + 1}/${customStartDate.getDate()} - ${customEndDate.getMonth() + 1}/${customEndDate.getDate()}`;
            }
            return '期間を選択';
        }
    }
}

function getPeriodRange(period, date) {
    if (!date) date = new Date();
    switch (period) {
        case 'day': return { start: startOfDay(date), end: endOfDay(date) };
        case 'week': { const s = getWeekStart(date); const e = new Date(s); e.setDate(e.getDate() + 6); return { start: s, end: endOfDay(e) }; }
        case 'month': return { start: startOfMonth(date), end: endOfMonth(date) };
        case 'custom': {
            if (customStartDate && customEndDate) {
                return { start: startOfDay(customStartDate), end: endOfDay(customEndDate) };
            }
            return { start: startOfDay(new Date()), end: endOfDay(new Date()) };
        }
        default:
            // Fallback to day if period is unknown or missing
            return { start: startOfDay(date), end: endOfDay(date) };
    }
}

function drawChart(summary) {
    const canvas = document.getElementById('mainChart');
    const ctx = canvas.getContext('2d');
    const container = canvas.parentElement;

    // Filter to only show tasks that have activity in this period
    // Sort by duration descending (most time first)
    const activeItems = Object.values(summary.byTask)
        .filter(t => t.duration > 0)
        .sort((a, b) => b.duration - a.duration)
        .map(t => t.item);


    const dpr = window.devicePixelRatio || 1;

    // Calculate required width for horizontal scroll
    const { labels, datasets } = getChartData(currentPeriod, currentDate, summary, activeItems);
    const numTasks = activeItems.length;
    const numLabels = labels.length;

    // Bar settings: thin bars with grouping
    const singleBarWidth = 12; // Thin bars
    const barGap = 4;
    const groupGap = 24;
    const groupWidth = numTasks > 0 ? (numTasks * singleBarWidth + (numTasks - 1) * barGap) : singleBarWidth;
    const minChartWidth = Math.max(container.clientWidth, numLabels * (groupWidth + groupGap) + 100);

    // Apply width for horizontal scroll
    canvas.style.width = minChartWidth + 'px';
    container.style.overflowX = minChartWidth > container.parentElement.clientWidth ? 'auto' : 'hidden';

    canvas.width = minChartWidth * dpr;
    canvas.height = container.clientHeight * dpr;
    canvas.style.height = '100%';
    ctx.scale(dpr, dpr);

    const width = minChartWidth;
    const height = container.clientHeight;
    const padding = { top: 10, right: 20, bottom: 25, left: 45 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    ctx.clearRect(0, 0, width, height);

    if (!labels.length || numTasks === 0) {
        ctx.fillStyle = '#6B7280';
        ctx.font = '12px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('データがありません', container.clientWidth / 2, height / 2);
        return;
    }

    // Find max value across all individual bars (not stacked)
    const maxVal = Math.max(
        ...datasets.flatMap(ds => ds.data),
        3600000 // Minimum 1 hour scale
    );

    // Grid
    // Grid (Web3 Tech Style)
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.1)';
    ctx.fillStyle = '#8B9BB4';
    ctx.font = '10px "SF Mono", Menlo, monospace';
    ctx.textAlign = 'right';

    const steps = 4;
    for (let i = 0; i <= steps; i++) {
        const y = padding.top + (chartH / steps) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
        const val = (maxVal * (steps - i)) / steps;
        ctx.fillText(`${(val / 3600000).toFixed(1)}h`, padding.left - 8, y + 3);
    }

    // Grouped Bars
    const gap = chartW / labels.length;
    canvas.barData = [];

    labels.forEach((label, i) => {
        const groupStartX = padding.left + gap * i + (gap - groupWidth) / 2;

        // Draw each task's bar side by side
        datasets.forEach((ds, taskIdx) => {
            const val = ds.data[i];
            const x = groupStartX + taskIdx * (singleBarWidth + barGap);

            if (val > 0) {
                const h = (val / maxVal) * chartH;
                const y = padding.top + chartH - h;

                ctx.fillStyle = ds.item.color;
                ctx.beginPath();
                ctx.roundRect(x, y, singleBarWidth, h, 2);
                ctx.fill();

                canvas.barData.push({ x, y, w: singleBarWidth, h, name: ds.item.name, value: val, label, color: ds.item.color });
            }
        });

        // X-axis label
        ctx.fillStyle = '#8B9BB4';
        ctx.textAlign = 'center';
        ctx.font = '10px "Outfit", sans-serif';
        ctx.fillText(label, groupStartX + groupWidth / 2, height - 5);
    });
}

function getChartData(period, date, summary, activeItems) {
    const labels = getChartLabels(period, date);
    // Use only activeItems (tasks that have activity in this period)
    const datasets = activeItems.map(item => ({ item, data: new Array(labels.length).fill(0) }));

    summary.segments.forEach(seg => {
        const segDate = new Date(seg.startAt);
        let idx = -1;

        switch (period) {
            case 'day': idx = 0; break;
            case 'week': {
                const ws = getWeekStart(date);
                idx = Math.floor((segDate - ws) / 86400000);
                if (idx < 0 || idx > 6) idx = -1;
                break;
            }
            case 'month': idx = segDate.getDate() - 1; break;
            case 'custom': {
                if (customStartDate && customEndDate) {
                    idx = Math.floor((segDate - customStartDate) / 86400000);
                    const maxIdx = Math.ceil((customEndDate - customStartDate) / 86400000);
                    if (idx < 0 || idx > maxIdx) idx = -1;
                }
                break;
            }
        }

        if (idx >= 0 && idx < labels.length) {
            const dsIdx = datasets.findIndex(d => d.item.id === seg.itemId);
            if (dsIdx !== -1) datasets[dsIdx].data[idx] += seg.duration;
        }
    });

    return { labels, datasets };
}

function getChartLabels(period, date) {
    const labels = [];
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

    switch (period) {
        case 'day':
            labels.push(new Date(date).getDate() + '日');
            break;
        case 'week':
            for (let i = 0; i < 7; i++) {
                const d = new Date(getWeekStart(date));
                d.setDate(d.getDate() + i);
                labels.push(dayNames[d.getDay()]);
            }
            break;
        case 'month':
            const days = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
            for (let i = 1; i <= days; i++) labels.push(i.toString());
            break;
        case 'custom':
            if (customStartDate && customEndDate) {
                const diff = Math.ceil((customEndDate - customStartDate) / 86400000) + 1;
                for (let i = 0; i < diff; i++) {
                    const d = new Date(customStartDate);
                    d.setDate(d.getDate() + i);
                    labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
                }
            } else {
                labels.push('未選択');
            }
            break;
    }
    return labels;
}

function renderLegend() {
    // Legend removed for minimalist design - tooltip handles info
    const container = document.getElementById('chartLegend');
    if (container) container.innerHTML = '';
}

function setupChartTooltip() {
    const canvas = document.getElementById('mainChart');
    const tooltip = document.getElementById('chartTooltip');

    canvas.addEventListener('mousemove', (e) => {
        if (!canvas.barData) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const bar = canvas.barData.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);

        if (bar) {
            tooltip.innerHTML = `<strong>${escapeHtml(bar.name)}</strong><br>${bar.label}: ${formatDuration(bar.value)}`;
            tooltip.style.display = 'block';
            tooltip.style.left = (x + 10) + 'px';
            tooltip.style.top = (y - 10) + 'px';
        } else {
            tooltip.style.display = 'none';
        }
    });

    canvas.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
}

// ========================================
// Settings
// ========================================
function loadSettingsForm() {
    const displayNameEl = document.getElementById('settingDisplayName');
    const weekStartEl = document.getElementById('settingWeekStart');
    if (displayNameEl) displayNameEl.value = state.settings.displayName || '';
    if (weekStartEl) weekStartEl.value = state.settings.weekStartsOn || 'monday';
}

function handleSettingsSubmit(e) {
    e.preventDefault();
    const displayNameEl = document.getElementById('settingDisplayName');
    const weekStartEl = document.getElementById('settingWeekStart');
    if (displayNameEl) state.settings.displayName = displayNameEl.value.trim();
    if (weekStartEl) state.settings.weekStartsOn = weekStartEl.value;
    saveState();
    showToast('設定を保存しました', 'success');
}

// Data reset function
window.confirmResetAllData = () => {
    showConfirm(
        '全データを削除',
        'すべてのタスク、ログ、設定が削除されます。\nこの操作は取り消せません。実行しますか？',
        async () => {
            // Stop any running timers
            stopTimerLoop();

            // Clear generic local storage
            localStorage.removeItem(STORAGE_KEYS.items);
            localStorage.removeItem(STORAGE_KEYS.sessions);
            localStorage.removeItem(STORAGE_KEYS.activeSessions);
            localStorage.removeItem(STORAGE_KEYS.settings);
            localStorage.removeItem('timeflow.pausedSessions');

            // Clear user-specific local storage if user is specified
            if (currentUsername) {
                localStorage.removeItem(getUserStorageKey(STORAGE_KEYS.items));
                localStorage.removeItem(getUserStorageKey(STORAGE_KEYS.sessions));
                localStorage.removeItem(getUserStorageKey(STORAGE_KEYS.activeSessions));
                localStorage.removeItem(getUserStorageKey(STORAGE_KEYS.settings));
                localStorage.removeItem(getUserStorageKey('timeflow.pausedSessions'));
            }

            // Reset state to empty
            state = { items: [], sessions: [], activeSessions: [], pausedSessions: {}, settings: { ...DEFAULT_SETTINGS } };

            // Clear cloud data if user is specified
            if (currentUsername && supabaseClient) {
                try {
                    await saveToCloud(); // This will save the empty state to cloud
                } catch (e) {
                    console.error('Cloud clear error:', e);
                }
            }

            // Update all UI
            renderAll();
            renderFullTaskList();
            renderLogTable();
            loadSettingsForm();
            showToast('全データを削除しました', 'success');
        }
    );
};

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
    a.download = `timeflow-backup-${toLocalDateString(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('データをエクスポートしました', 'success');
}

function importData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.items || !data.sessions || !Array.isArray(data.items)) throw new Error('Invalid format');

            showConfirm('データのインポート', '現在のデータをすべて上書きします。よろしいですか？', () => {
                state.items = data.items || [];
                state.sessions = data.sessions || [];
                state.activeSessions = data.activeSessions || [];
                state.settings = { ...DEFAULT_SETTINGS, ...data.settings };
                saveState();
                renderAll();
                updateLogFilterOptions();
                showToast('データをインポートしました', 'success');
            });
        } catch (err) {
            showToast('インポートに失敗しました', 'error');
        }
    };
    reader.readAsText(file);
}

// ========================================
// Utilities
// ========================================
function generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 9); }
function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
function formatDuration(ms) { const s = Math.floor(ms / 1000); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const ss = s % 60; return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`; }
function formatDurationShort(ms) { const h = (ms / 3600000); return h < 1 ? `${Math.round(h * 60)}m` : `${h.toFixed(1)}h`; }
function formatTime(d) { const dt = new Date(d); return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`; }
function formatDateShort(d) { const dt = new Date(d); const days = ['日', '月', '火', '水', '木', '金', '土']; return `${dt.getMonth() + 1}/${dt.getDate()}（${days[dt.getDay()]}）`; }

function formatDateTimeLocal(d) { const dt = new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}T${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`; }
function toLocalDateString(d) { const dt = new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`; }
function startOfDay(d) { const dt = new Date(d); dt.setHours(0, 0, 0, 0); return dt; }
function endOfDay(d) { const dt = new Date(d); dt.setHours(23, 59, 59, 999); return dt; }
function startOfMonth(d) { const dt = new Date(d); dt.setDate(1); dt.setHours(0, 0, 0, 0); return dt; }
function endOfMonth(d) { const dt = new Date(d); dt.setMonth(dt.getMonth() + 1, 0); dt.setHours(23, 59, 59, 999); return dt; }
function startOfYear(d) { const dt = new Date(d); dt.setMonth(0, 1); dt.setHours(0, 0, 0, 0); return dt; }
function endOfYear(d) { const dt = new Date(d); dt.setMonth(11, 31); dt.setHours(23, 59, 59, 999); return dt; }
function getWeekStart(d) {
    const dt = new Date(d);
    const day = dt.getDay();
    const diff = state.settings.weekStartsOn === 'monday' ? (day === 0 ? -6 : 1 - day) : -day;
    dt.setDate(dt.getDate() + diff);
    dt.setHours(0, 0, 0, 0);
    return dt;
}

window.closeModal = (id) => {
    document.getElementById(id).classList.remove('show');
    if (id === 'taskModal') document.getElementById('taskForm').reset();
    if (id === 'logModal') document.getElementById('logForm').reset();
};

function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast ${type} show`;
    setTimeout(() => t.classList.remove('show'), 3000);
}

// ========================================
// Drag and Drop for Task Reordering
// ========================================
let draggedItem = null;

function initDragAndDrop() {
    const container = document.getElementById('taskListFull');
    const items = container.querySelectorAll('.task-card-full');

    items.forEach(item => {
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragend', handleDragEnd);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('drop', handleDrop);
        item.addEventListener('dragenter', handleDragEnter);
        item.addEventListener('dragleave', handleDragLeave);
    });
}

function handleDragStart(e) {
    draggedItem = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.taskId);
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.task-card-full').forEach(item => {
        item.classList.remove('drag-over');
    });
    draggedItem = null;
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter(e) {
    e.preventDefault();
    if (this !== draggedItem) {
        this.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    this.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    this.classList.remove('drag-over');

    if (!draggedItem || this === draggedItem) return;

    const draggedId = draggedItem.dataset.taskId;
    const targetId = this.dataset.taskId;

    const draggedIndex = state.items.findIndex(i => i.id === draggedId);
    const targetIndex = state.items.findIndex(i => i.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Reorder array
    const [removed] = state.items.splice(draggedIndex, 1);
    state.items.splice(targetIndex, 0, removed);

    saveState();
    renderFullTaskList();
    renderQuickTaskList();

}

// Global reorderTasks function for mini window drag and drop
window.reorderTasks = function (draggedId, targetId) {
    const draggedIndex = state.items.findIndex(i => i.id === draggedId);
    const targetIndex = state.items.findIndex(i => i.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Reorder array
    const [removed] = state.items.splice(draggedIndex, 1);
    state.items.splice(targetIndex, 0, removed);

    saveState();
    renderAll();
};

// Dashboard Drag and Drop
function initDashboardDragAndDrop() {
    const container = document.getElementById('taskListCompact');
    if (!container) return;

    const items = container.querySelectorAll('.task-item:not(.archived)');

    items.forEach(item => {
        item.addEventListener('dragstart', handleDashboardDragStart);
        item.addEventListener('dragend', handleDashboardDragEnd);
        item.addEventListener('dragover', handleDashboardDragOver);
        item.addEventListener('drop', handleDashboardDrop);
    });
}

function handleDashboardDragStart(e) {
    draggedItem = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.taskId);
    // Make drag image slightly transparent
    setTimeout(() => this.style.opacity = '0.4', 0);
}

function handleDashboardDragEnd(e) {
    this.classList.remove('dragging');
    this.style.opacity = '';
    document.querySelectorAll('.task-item').forEach(item => {
        item.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    draggedItem = null;
}

function handleDashboardDragOver(e) {
    e.preventDefault();
    if (!draggedItem || this === draggedItem) return;

    // Remove previous indicators
    document.querySelectorAll('.task-item').forEach(item => {
        item.classList.remove('drag-over-top', 'drag-over-bottom');
    });

    // Determine if cursor is in top or bottom half
    const rect = this.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;

    if (e.clientY < midpoint) {
        this.classList.add('drag-over-top');
    } else {
        this.classList.add('drag-over-bottom');
    }
}

function handleDashboardDrop(e) {
    e.preventDefault();

    if (!draggedItem || this === draggedItem) return;

    const draggedId = draggedItem.dataset.taskId;
    const targetId = this.dataset.taskId;

    // Determine insert position based on indicator
    const insertBefore = this.classList.contains('drag-over-top');

    // Clean up indicators
    this.classList.remove('drag-over-top', 'drag-over-bottom');

    // Find indices in state.items
    const draggedIndex = state.items.findIndex(i => i.id === draggedId);
    const targetIndex = state.items.findIndex(i => i.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Remove dragged item
    const [removed] = state.items.splice(draggedIndex, 1);

    // Calculate new target index (may have shifted after removal)
    let newTargetIndex = state.items.findIndex(i => i.id === targetId);
    if (newTargetIndex === -1) newTargetIndex = targetIndex;

    // Insert at correct position
    if (insertBefore) {
        state.items.splice(newTargetIndex, 0, removed);
    } else {
        state.items.splice(newTargetIndex + 1, 0, removed);
    }

    saveState();
    renderQuickTaskList();
}


// Apply custom date range for chart
window.applyCustomRange = () => {
    const startEl = document.getElementById('customStartDate');
    const endEl = document.getElementById('customEndDate');

    if (startEl && endEl && startEl.value && endEl.value) {
        customStartDate = new Date(startEl.value);
        customEndDate = new Date(endEl.value);

        if (customEndDate < customStartDate) {
            showToast('終了日は開始日より後にしてください', 'warning');
            return;
        }

        updateSummary();
        showToast('期間を適用しました');
    } else {
        showToast('開始日と終了日を入力してください', 'warning');
    }
};

// Task card resize functionality
window.initTaskCardResize = () => {
    const card = document.getElementById('taskCard');
    const handle = document.getElementById('taskResizeHandle');
    if (!card || !handle) return;

    // Apply saved height from settings
    if (state.settings && state.settings.taskCardHeight) {
        card.style.height = state.settings.taskCardHeight + 'px';
    }

    let isResizing = false;
    let startY, startHeight;

    handle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startY = e.clientY;
        startHeight = card.offsetHeight;
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
        card.classList.add('resizing');
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const diff = e.clientY - startY;
        const newHeight = Math.max(300, startHeight + diff);
        card.style.height = newHeight + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            card.classList.remove('resizing');

            // Save current height to settings
            const currentHeight = card.offsetHeight;
            state.settings.taskCardHeight = currentHeight;
            saveState();
        }
    });
};

// Initialize resize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTaskCardResize);
} else {
    initTaskCardResize();
}
