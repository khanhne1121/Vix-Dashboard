// server.js - Backend OAuth2 Server
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const session = require('express-session');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ========================================
// CONFIGURATION
// ========================================
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'http://localhost:3000/api/auth/callback';
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

// Owner IDs from bot config
const OWNER_IDS = (process.env.OWNER_IDS || '1402986658177093692,1374200479663525990,989724139243843675').split(',').map(id => id.trim());
const ADMIN_IDS = (process.env.ADMIN_IDS || '1402986658177093692,1374200479663525990,989724139243843675').split(',').map(id => id.trim());
const ADMIN_ROLES = (process.env.ADMIN_ROLES || '1523314585107562497,1533105241803722803,1520985247670341723').split(',').map(id => id.trim());
const STAFF_ROLES = (process.env.STAFF_ROLES || '1527339833717035038,1520994029733548032,1528965946948059136').split(',').map(id => id.trim());
const GUILD_ID = process.env.GUILD_ID || '1520984545699299428';

// ========================================
// SESSION CONFIG
// ========================================
app.use(session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// ========================================
// MIDDLEWARE
// ========================================
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5500',
    credentials: true
}));
app.use(express.json());

// ========================================
// DISCORD OAUTH2 HELPERS
// ========================================
function generateState() {
    return crypto.randomBytes(32).toString('hex');
}

async function exchangeCode(code) {
    const params = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: DISCORD_REDIRECT_URI
    });

    const response = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params
    });

    if (!response.ok) {
        throw new Error('Failed to exchange code');
    }

    return response.json();
}

async function getUserInfo(accessToken) {
    const response = await fetch('https://discord.com/api/users/@me', {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (!response.ok) {
        throw new Error('Failed to get user info');
    }

    return response.json();
}

async function getUserGuilds(accessToken) {
    const response = await fetch('https://discord.com/api/users/@me/guilds', {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (!response.ok) {
        throw new Error('Failed to get user guilds');
    }

    return response.json();
}

async function getGuildRoles(accessToken, guildId) {
    const response = await fetch(`https://discord.com/api/guilds/${guildId}/roles`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (!response.ok) {
        throw new Error('Failed to get guild roles');
    }

    return response.json();
}

async function getGuildMember(accessToken, guildId, userId) {
    const response = await fetch(`https://discord.com/api/guilds/${guildId}/members/${userId}`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (!response.ok) {
        return null;
    }

    return response.json();
}

// ========================================
// PERMISSION CHECKER
// ========================================
function checkPermissions(userId, guildId, userGuilds, memberRoles = []) {
    const userGuild = userGuilds.find(g => g.id === guildId);
    if (!userGuild) {
        return { role: 'USER', hasAccess: false, message: 'Không có quyền truy cập server này' };
    }

    const isOwner = OWNER_IDS.includes(userId);
    const isAdminUser = ADMIN_IDS.includes(userId);

    // Check guild ownership (server owner)
    if (userGuild.owner) {
        return { role: 'OWNER', hasAccess: true, message: 'Chủ sở hữu server' };
    }

    // Check if user is bot owner
    if (isOwner) {
        return { role: 'OWNER', hasAccess: true, message: 'Bot Owner' };
    }

    // Check if user is admin
    if (isAdminUser) {
        return { role: 'ADMIN', hasAccess: true, message: 'Admin' };
    }

    // Check if user has admin role in guild
    const hasAdminRole = memberRoles.some(roleId => ADMIN_ROLES.includes(roleId));
    if (hasAdminRole) {
        return { role: 'ADMIN', hasAccess: true, message: 'Admin Role' };
    }

    // Check if user has staff role in guild
    const hasStaffRole = memberRoles.some(roleId => STAFF_ROLES.includes(roleId));
    if (hasStaffRole) {
        return { role: 'STAFF', hasAccess: true, message: 'Staff' };
    }

    // Check permissions in guild (manage guild, manage roles, etc.)
    const permissions = userGuild.permissions || 0;
    const ADMIN_PERMISSION = 0x8; // Administrator
    const MANAGE_GUILD = 0x20;
    const MANAGE_ROLES = 0x10000000;

    if (permissions & ADMIN_PERMISSION || permissions & MANAGE_GUILD || permissions & MANAGE_ROLES) {
        return { role: 'ADMIN', hasAccess: true, message: 'Guild Administrator' };
    }

    return { role: 'USER', hasAccess: false, message: 'Không có quyền quản lý server này' };
}

// ========================================
// ROUTES
// ========================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth endpoint - redirect to Discord
app.get('/api/auth/login', (req, res) => {
    const state = generateState();
    req.session.oauthState = state;

    const params = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        redirect_uri: DISCORD_REDIRECT_URI,
        response_type: 'code',
        scope: 'identify guilds email',
        state: state
    });

    res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

// Auth callback
app.get('/api/auth/callback', async (req, res) => {
    const { code, state } = req.query;

    if (!code) {
        return res.status(400).send('Missing code parameter');
    }

    if (state !== req.session.oauthState) {
        return res.status(400).send('Invalid state parameter');
    }

    try {
        // Exchange code for token
        const tokenData = await exchangeCode(code);
        const { access_token, refresh_token, expires_in } = tokenData;

        // Get user info
        const user = await getUserInfo(access_token);

        // Get user guilds
        const guilds = await getUserGuilds(access_token);

        // Store session
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.discriminator = user.discriminator;
        req.session.avatar = user.avatar;
        req.session.accessToken = access_token;
        req.session.refreshToken = refresh_token;
        req.session.tokenExpires = Date.now() + expires_in * 1000;
        req.session.guilds = guilds;
        req.session.loggedIn = true;

        // Get member roles for target guild
        let memberRoles = [];
        try {
            const member = await getGuildMember(access_token, GUILD_ID, user.id);
            if (member) {
                memberRoles = member.roles || [];
            }
        } catch (e) {
            console.log('Could not fetch member roles:', e.message);
        }

        // Check permissions
        const permission = checkPermissions(user.id, GUILD_ID, guilds, memberRoles);
        req.session.permission = permission;

        // Redirect to frontend
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5500';
        res.redirect(`${frontendUrl}?auth=success`);

    } catch (error) {
        console.error('Auth callback error:', error);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5500';
        res.redirect(`${frontendUrl}?auth=error&message=${encodeURIComponent(error.message)}`);
    }
});

// Get current user
app.get('/api/auth/me', (req, res) => {
    if (!req.session.loggedIn) {
        return res.status(401).json({ 
            authenticated: false, 
            message: 'Not authenticated' 
        });
    }

    // Check if token expired
    if (Date.now() > req.session.tokenExpires) {
        return res.status(401).json({
            authenticated: false,
            message: 'Session expired'
        });
    }

    res.json({
        authenticated: true,
        user: {
            id: req.session.userId,
            username: req.session.username,
            discriminator: req.session.discriminator,
            avatar: req.session.avatar,
            displayName: req.session.globalName || req.session.username
        },
        guilds: req.session.guilds,
        permission: req.session.permission,
        guildId: GUILD_ID
    });
});

// Logout
app.get('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.json({ success: true });
    });
});

// Get user's guild roles
app.get('/api/guild/:guildId/roles', async (req, res) => {
    if (!req.session.loggedIn) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const { guildId } = req.params;
    try {
        const roles = await getGuildRoles(req.session.accessToken, guildId);
        res.json(roles);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Check permission for specific guild
app.get('/api/guild/:guildId/permission', async (req, res) => {
    if (!req.session.loggedIn) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const { guildId } = req.params;
    const guilds = req.session.guilds || [];
    const permission = checkPermissions(req.session.userId, guildId, guilds);
    res.json(permission);
});

// ========================================
// START SERVER
// ========================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 OAuth2 Server running on port ${PORT}`);
    console.log(`📋 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5500'}`);
    console.log(`🔗 Redirect URI: ${DISCORD_REDIRECT_URI}`);
});

// ========================================
// ERROR HANDLING
// ========================================
process.on('unhandledRejection', (error) => {
    console.error('Unhandled Promise Rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});