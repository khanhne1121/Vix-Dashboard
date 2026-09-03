// server.js - Backend OAuth2
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const fetch = require('node-fetch');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Config
const {
    DISCORD_CLIENT_ID,
    DISCORD_CLIENT_SECRET,
    DISCORD_REDIRECT_URI,
    FRONTEND_URL,
    SESSION_SECRET
} = process.env;

// Middleware
app.use(cors({ 
    origin: FRONTEND_URL || 'https://khanhne1121.github.io', 
    credentials: true 
}));
app.use(express.json());
app.use(session({
    secret: SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 
    }
}));

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Login - Redirect to Discord
app.get('/api/auth/login', (req, res) => {
    const state = crypto.randomBytes(32).toString('hex');
    req.session.oauthState = state;
    
    const url = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&response_type=code&scope=identify%20guilds&state=${state}`;
    res.redirect(url);
});

// Callback - Discord redirects here
app.get('/api/auth/callback', async (req, res) => {
    const { code, state } = req.query;
    
    if (!code || state !== req.session.oauthState) {
        return res.redirect(`${FRONTEND_URL}?auth=error&message=Invalid+state`);
    }
    
    try {
        // Exchange code for token
        const params = new URLSearchParams({
            client_id: DISCORD_CLIENT_ID,
            client_secret: DISCORD_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: DISCORD_REDIRECT_URI
        });
        
        const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params
        });
        const tokenData = await tokenRes.json();
        
        // Get user info
        const userRes = await fetch('https://discord.com/api/users/@me', {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        });
        const user = await userRes.json();
        
        // Get user guilds
        const guildRes = await fetch('https://discord.com/api/users/@me/guilds', {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        });
        const guilds = await guildRes.json();
        
        // Store session
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.avatar = user.avatar;
        req.session.accessToken = tokenData.access_token;
        req.session.loggedIn = true;
        req.session.guilds = guilds;
        
        res.redirect(`${FRONTEND_URL}?auth=success`);
    } catch (error) {
        res.redirect(`${FRONTEND_URL}?auth=error&message=${encodeURIComponent(error.message)}`);
    }
});

// Get current user
app.get('/api/auth/me', (req, res) => {
    if (!req.session.loggedIn) {
        return res.status(401).json({ authenticated: false });
    }
    res.json({
        authenticated: true,
        user: {
            id: req.session.userId,
            username: req.session.username,
            avatar: req.session.avatar
        },
        guilds: req.session.guilds
    });
});

// Logout
app.get('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`🚀 OAuth2 Server running on port ${PORT}`));
