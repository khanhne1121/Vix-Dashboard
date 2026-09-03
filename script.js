/* ========================================
   DASHBOARD CONTROLLER WITH DISCORD OAUTH2
======================================== */

// ========================================
// CONFIGURATION
// ========================================
const CONFIG = {
    // Backend API URL - Change this to your deployed backend URL
    API_BASE: 'http://localhost:3000/api',
    FRONTEND_URL: window.location.origin
};

// ========================================
// STATE
// ========================================
const state = {
    currentPage: 'overview',
    theme: 'dark',
    isAuthenticated: false,
    isLoading: false,
    user: null,
    guilds: [],
    permission: null,
    currentUserPage: 1,
    userPageSize: 10
};

// ========================================
// DOM REFS
// ========================================
const DOM = {
    loginOverlay: document.getElementById('loginOverlay'),
    unauthorizedOverlay: document.getElementById('unauthorizedOverlay'),
    unauthorizedMessage: document.getElementById('unauthorizedMessage'),
    loginStatus: document.getElementById('loginStatus'),
    discordLoginBtn: document.getElementById('discordLoginBtn'),
    userProfile: document.getElementById('userProfile'),
    userDisplayName: document.getElementById('userDisplayName'),
    avatarImg: document.getElementById('avatarImg'),
    avatarIcon: document.getElementById('avatarIcon'),
    dropdownAvatarImg: document.getElementById('dropdownAvatarImg'),
    dropdownUsername: document.getElementById('dropdownUsername'),
    dropdownUserId: document.getElementById('dropdownUserId'),
    permissionText: document.getElementById('permissionText'),
    permissionIndicator: document.getElementById('permissionIndicator'),
    userDropdownToggle: document.getElementById('userDropdownToggle'),
    userDropdownMenu: document.getElementById('userDropdownMenu'),
    botStatusDot: document.getElementById('botStatusDot'),
    botStatusText: document.getElementById('botStatusText'),
    toastContainer: document.getElementById('toastContainer'),
    pageTitle: document.getElementById('pageTitle'),
    pageContent: document.getElementById('pageContent'),
    sidebar: document.getElementById('sidebar'),
    menuToggle: document.getElementById('menuToggle'),
    themeToggle: document.getElementById('themeToggle'),
    refreshBtn: document.getElementById('refreshBtn')
};

// ========================================
// API CLIENT
// ========================================
const API = {
    async request(endpoint, options = {}) {
        const url = `${CONFIG.API_BASE}${endpoint}`;
        const response = await fetch(url, {
            ...options,
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Request failed' }));
            throw new Error(error.message || 'Request failed');
        }

        return response.json();
    },

    async getMe() {
        return this.request('/auth/me');
    },

    async logout() {
        return this.request('/auth/logout');
    },

    async getGuildRoles(guildId) {
        return this.request(`/guild/${guildId}/roles`);
    },

    async getGuildPermission(guildId) {
        return this.request(`/guild/${guildId}/permission`);
    }
};

// ========================================
// AUTHENTICATION
// ========================================
async function checkAuth() {
    try {
        const data = await API.getMe();
        if (data.authenticated) {
            state.isAuthenticated = true;
            state.user = data.user;
            state.guilds = data.guilds || [];
            state.permission = data.permission;

            // Check if user has permission to access dashboard
            if (state.permission && state.permission.hasAccess) {
                showDashboard();
            } else {
                showUnauthorized(state.permission?.message || 'Không có quyền truy cập');
            }

            return true;
        }
    } catch (error) {
        console.log('Not authenticated:', error.message);
    }

    showLogin();
    return false;
}

function showLogin() {
    DOM.loginOverlay.style.display = 'flex';
    DOM.unauthorizedOverlay.style.display = 'none';
    DOM.userProfile.style.display = 'none';
}

function showDashboard() {
    DOM.loginOverlay.style.display = 'none';
    DOM.unauthorizedOverlay.style.display = 'none';
    DOM.userProfile.style.display = 'flex';

    // Update user info
    if (state.user) {
        const displayName = state.user.displayName || state.user.username;
        DOM.userDisplayName.textContent = displayName;
        DOM.dropdownUsername.textContent = displayName;
        DOM.dropdownUserId.textContent = `ID: ${state.user.id}`;

        if (state.user.avatar) {
            const avatarUrl = `https://cdn.discordapp.com/avatars/${state.user.id}/${state.user.avatar}.png?size=64`;
            DOM.avatarImg.src = avatarUrl;
            DOM.avatarImg.style.display = 'block';
            DOM.avatarIcon.style.display = 'none';
            DOM.dropdownAvatarImg.src = avatarUrl;
        } else {
            DOM.avatarImg.style.display = 'none';
            DOM.avatarIcon.style.display = 'block';
            const defaultAvatar = `https://cdn.discordapp.com/embed/avatars/${parseInt(state.user.discriminator) % 5}.png`;
            DOM.dropdownAvatarImg.src = defaultAvatar;
        }
    }

    // Update permission indicator
    if (state.permission) {
        const roleMap = {
            'OWNER': { icon: 'fa-crown', color: '#f1c40f', label: 'Owner' },
            'ADMIN': { icon: 'fa-shield-alt', color: '#e74c3c', label: 'Admin' },
            'STAFF': { icon: 'fa-user-tie', color: '#3498db', label: 'Staff' },
            'USER': { icon: 'fa-user', color: '#95a5a6', label: 'User' }
        };
        const role = roleMap[state.permission.role] || roleMap.USER;
        DOM.permissionText.innerHTML = `<i class="fas ${role.icon}" style="color:${role.color};"></i> Quyền: ${role.label}`;
    }

    // Load initial data
    loadPageData(state.currentPage);
}

function showUnauthorized(message) {
    DOM.loginOverlay.style.display = 'none';
    DOM.unauthorizedOverlay.style.display = 'flex';
    DOM.unauthorizedMessage.textContent = message || 'Bạn không có quyền truy cập dashboard này.';
    DOM.userProfile.style.display = 'none';
}

async function logout() {
    try {
        await API.logout();
        state.isAuthenticated = false;
        state.user = null;
        state.guilds = [];
        state.permission = null;
        showLogin();
        showToast('Đã đăng xuất thành công', 'success');
    } catch (error) {
        showToast('Lỗi đăng xuất: ' + error.message, 'error');
    }
}

// ========================================
// DISCORD LOGIN
// ========================================
function loginWithDiscord() {
    // Construct the OAuth2 URL
    const clientId = 'YOUR_CLIENT_ID_HERE'; // This will be replaced by backend
    const redirectUri = encodeURIComponent('http://localhost:3000/api/auth/callback');
    const scope = 'identify guilds email';
    const state = Math.random().toString(36).substring(2, 15);

    // Store state in sessionStorage for verification
    sessionStorage.setItem('oauth_state', state);

    const authUrl = `${CONFIG.API_BASE}/auth/login`;
    window.location.href = authUrl;
}

// ========================================
// CHECK OAUTH PARAMS
// ========================================
function handleOAuthCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const authStatus = urlParams.get('auth');

    if (authStatus === 'success') {
        // Remove the query param
        window.history.replaceState({}, document.title, window.location.pathname);
        showToast('Đăng nhập thành công!', 'success');
        checkAuth();
    } else if (authStatus === 'error') {
        const message = urlParams.get('message') || 'Đăng nhập thất bại';
        window.history.replaceState({}, document.title, window.location.pathname);
        showToast('Lỗi đăng nhập: ' + message, 'error');
        showLogin();
    }
}

// ========================================
// TOAST SYSTEM
// ========================================
function showToast(message, type = 'info', title = '') {
    const iconMap = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-icon"><i class="fas ${iconMap[type] || 'fa-info-circle'}"></i></div>
        <div class="toast-content">${title ? `<strong>${title}</strong> ` : ''}${message}</div>
        <button class="toast-close"><i class="fas fa-times"></i></button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.remove();
    });

    DOM.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 5000);
}

// ========================================
// NAVIGATION
// ========================================
function navigateTo(page) {
    if (!state.isAuthenticated) return;

    state.currentPage = page;

    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });

    // Update pages
    document.querySelectorAll('.page').forEach(el => {
        el.classList.toggle('active', el.id === `page-${page}`);
    });

    // Update title
    const titles = {
        overview: 'Tổng quan',
        server: 'Máy chủ',
        users: 'Người dùng',
        tickets: 'Ticket',
        orders: 'Đơn hàng',
        stock: 'Kho hàng',
        economy: 'Kinh tế',
        moderation: 'Kiểm duyệt',
        logs: 'Nhật ký',
        commands: 'Lệnh',
        settings: 'Cài đặt',
        'bot-status': 'Trạng thái Bot'
    };
    DOM.pageTitle.textContent = titles[page] || 'Dashboard';

    // Close sidebar on mobile
    if (window.innerWidth <= 768) {
        closeSidebar();
    }

    // Load page data
    loadPageData(page);
}

function openSidebar() {
    DOM.sidebar.classList.add('open');
    const overlay = document.querySelector('.sidebar-overlay');
    if (overlay) overlay.classList.add('active');
}

function closeSidebar() {
    DOM.sidebar.classList.remove('open');
    const overlay = document.querySelector('.sidebar-overlay');
    if (overlay) overlay.classList.remove('active');
}

// ========================================
// DATA LOADING
// ========================================
async function loadPageData(page) {
    if (state.isLoading) return;
    state.isLoading = true;

    try {
        // Check if authenticated
        if (!state.isAuthenticated) {
            await checkAuth();
            return;
        }

        // Check if user has permission
        if (!state.permission || !state.permission.hasAccess) {
            showUnauthorized(state.permission?.message || 'Không có quyền truy cập');
            return;
        }

        // Load page specific data
        // For now, using mock data since we haven't connected to bot yet
        // In production, fetch from backend API

        switch (page) {
            case 'overview':
                renderOverview();
                break;
            case 'server':
                renderServer();
                break;
            case 'users':
                renderUsers();
                break;
            case 'tickets':
                renderTickets();
                break;
            case 'orders':
                renderOrders();
                break;
            case 'stock':
                renderStock();
                break;
            case 'economy':
                renderEconomy();
                break;
            case 'moderation':
                renderModeration();
                break;
            case 'logs':
                renderLogs();
                break;
            case 'commands':
                renderCommands();
                break;
            case 'settings':
                renderSettings();
                break;
            case 'bot-status':
                renderBotStatus();
                break;
        }
    } catch (error) {
        showToast('Lỗi tải dữ liệu: ' + error.message, 'error');
    } finally {
        state.isLoading = false;
    }
}

// ========================================
// RENDER FUNCTIONS (Keep existing ones)
// ========================================
// ... (all existing render functions from previous version)
// They remain the same - no changes needed

// ========================================
// EVENT LISTENERS
// ========================================

// Discord Login
DOM.discordLoginBtn.addEventListener('click', loginWithDiscord);

// User dropdown toggle
DOM.userDropdownToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    DOM.userDropdownMenu.classList.toggle('show');
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.user-dropdown')) {
        DOM.userDropdownMenu.classList.remove('show');
    }
});

// Navigation
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(item.dataset.page);
    });
});

// Sidebar toggle
DOM.menuToggle.addEventListener('click', () => {
    if (DOM.sidebar.classList.contains('open')) {
        closeSidebar();
    } else {
        openSidebar();
    }
});

// Theme toggle
DOM.themeToggle.addEventListener('click', () => {
    const isDark = document.body.style.backgroundColor !== '#f5f5f5';
    if (isDark) {
        // Light mode
        document.documentElement.style.setProperty('--bg-primary', '#f0f0f5');
        document.documentElement.style.setProperty('--bg-secondary', '#ffffff');
        document.documentElement.style.setProperty('--bg-card', '#ffffff');
        document.documentElement.style.setProperty('--bg-input', '#f5f5fa');
        document.documentElement.style.setProperty('--text-primary', '#1a1a2e');
        document.documentElement.style.setProperty('--text-secondary', '#4a4a6a');
        document.documentElement.style.setProperty('--text-muted', '#8a8a9a');
        document.documentElement.style.setProperty('--border-color', '#e0e0e8');
        DOM.themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    } else {
        // Dark mode
        document.documentElement.style.setProperty('--bg-primary', '#0f0f13');
        document.documentElement.style.setProperty('--bg-secondary', '#1a1a23');
        document.documentElement.style.setProperty('--bg-card', '#222233');
        document.documentElement.style.setProperty('--bg-input', '#1a1a28');
        document.documentElement.style.setProperty('--text-primary', '#f0f0f5');
        document.documentElement.style.setProperty('--text-secondary', '#a0a0b8');
        document.documentElement.style.setProperty('--text-muted', '#6a6a82');
        document.documentElement.style.setProperty('--border-color', '#2a2a3d');
        DOM.themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
    }
});

// Refresh button
DOM.refreshBtn.addEventListener('click', () => {
    showToast('Đang làm mới dữ liệu...', 'info');
    loadPageData(state.currentPage);
});

// ========================================
// KEYBOARD SHORTCUTS
// ========================================
document.addEventListener('keydown', (e) => {
    // Ctrl+R to refresh
    if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        DOM.refreshBtn.click();
    }
    // Escape to close dropdown
    if (e.key === 'Escape') {
        DOM.userDropdownMenu.classList.remove('show');
    }
});

// ========================================
// INITIALIZATION
// ========================================
async function init() {
    // Create sidebar overlay
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);

    // Handle OAuth callback
    handleOAuthCallback();

    // Check authentication
    await checkAuth();

    // Check for hash navigation
    const hash = window.location.hash.slice(1);
    if (hash && document.querySelector(`.nav-item[data-page="${hash}"]`)) {
        navigateTo(hash);
    }

    console.log('✅ Vix Community Dashboard with Discord OAuth2 initialized');
}

// Handle hash change for navigation
window.addEventListener('hashchange', () => {
    const hash = window.location.hash.slice(1);
    if (hash && document.querySelector(`.nav-item[data-page="${hash}"]`)) {
        navigateTo(hash);
    }
});

// Handle window resize
window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
        closeSidebar();
    }
});

// Init
document.addEventListener('DOMContentLoaded', init);

// ========================================
// EXPOSE FUNCTIONS TO GLOBAL
// ========================================
window.navigateTo = navigateTo;
window.logout = logout;
window.showToast = showToast;