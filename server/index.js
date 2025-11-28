const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'supersecretkey123';

// Database
const db = new sqlite3.Database('./db/inkverse.db', (err) => {
    if (err) console.error('Database error:', err);
    else console.log('Connected to database');
});

// Create tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS drawings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        image_data TEXT NOT NULL,
        is_public INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS likes (
        user_id INTEGER NOT NULL,
        drawing_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, drawing_id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (drawing_id) REFERENCES drawings(id)
    )`);
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Auth middleware
function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).send('No token');

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (err) {
        res.status(401).send('Invalid token');
    }
}

// Optional Auth middleware (for public views that might show user-specific state like "liked")
function optionalAuthMiddleware(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.userId = decoded.userId;
        } catch (err) {
            // Invalid token, just proceed as guest
        }
    }
    next();
}

// API Routes - MUST come BEFORE static files!
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    console.log('Register attempt:', username, email);

    if (!username || !email || !password) {
        return res.status(400).send('Missing fields');
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        db.run(
            'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
            [username, email, hashedPassword],
            function (err) {
                if (err) {
                    console.error('DB error:', err);
                    return res.status(400).send('User already exists');
                }

                const token = jwt.sign({ userId: this.lastID }, JWT_SECRET, { expiresIn: '24h' });
                res.json({ token, user: { id: this.lastID, username, email } });
            }
        );
    } catch (err) {
        console.error('Error:', err);
        res.status(500).send('Server error');
    }
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    console.log('Login attempt:', email);

    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err || !user) return res.status(400).send('Invalid credentials');

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(400).send('Invalid credentials');

        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
    });
});

app.post('/api/drawings', authMiddleware, (req, res) => {
    const { title, image_data, is_public } = req.body;

    db.run(
        'INSERT INTO drawings (user_id, title, image_data, is_public) VALUES (?, ?, ?, ?)',
        [req.userId, title, image_data, is_public ? 1 : 0],
        function (err) {
            if (err) return res.status(500).send('Error saving');
            res.json({ id: this.lastID });
        }
    );
});

app.get('/api/drawings', authMiddleware, (req, res) => {
    db.all(
        'SELECT id, title, image_data, is_public, created_at FROM drawings WHERE user_id = ? ORDER BY created_at DESC',
        [req.userId],
        (err, rows) => {
            if (err) return res.status(500).send('Error');
            res.json(rows);
        }
    );
});

// Toggle Like
app.post('/api/drawings/:id/like', authMiddleware, (req, res) => {
    const drawingId = req.params.id;
    const userId = req.userId;

    db.get('SELECT * FROM likes WHERE user_id = ? AND drawing_id = ?', [userId, drawingId], (err, row) => {
        if (err) return res.status(500).send('Error');

        if (row) {
            // Unlike
            db.run('DELETE FROM likes WHERE user_id = ? AND drawing_id = ?', [userId, drawingId], (err) => {
                if (err) return res.status(500).send('Error unliking');
                res.json({ liked: false });
            });
        } else {
            // Like
            db.run('INSERT INTO likes (user_id, drawing_id) VALUES (?, ?)', [userId, drawingId], (err) => {
                if (err) return res.status(500).send('Error liking');
                res.json({ liked: true });
            });
        }
    });
});

// Get User Profile & Drawings
app.get('/api/users/:id', optionalAuthMiddleware, (req, res) => {
    const targetUserId = req.params.id;
    const currentUserId = req.userId; // Might be undefined if guest

    db.get('SELECT id, username, created_at FROM users WHERE id = ?', [targetUserId], (err, user) => {
        if (err || !user) return res.status(404).send('User not found');

        db.all(
            `SELECT d.id, d.title, d.image_data, d.created_at, 
            (SELECT COUNT(*) FROM likes WHERE drawing_id = d.id) as like_count,
            (SELECT COUNT(*) FROM likes WHERE drawing_id = d.id AND user_id = ?) as is_liked
            FROM drawings d 
            WHERE d.user_id = ? AND d.is_public = 1 
            ORDER BY d.created_at DESC`,
            [currentUserId || -1, targetUserId],
            (err, drawings) => {
                if (err) return res.status(500).send('Error fetching drawings');
                res.json({ user, drawings });
            }
        );
    });
});

app.get('/api/community', optionalAuthMiddleware, (req, res) => {
    const currentUserId = req.userId;

    db.all(
        `SELECT d.id, d.title, d.image_data, d.created_at, u.id as user_id, u.username,
         (SELECT COUNT(*) FROM likes WHERE drawing_id = d.id) as like_count,
         (SELECT COUNT(*) FROM likes WHERE drawing_id = d.id AND user_id = ?) as is_liked
         FROM drawings d 
         JOIN users u ON d.user_id = u.id 
         WHERE d.is_public = 1 
         ORDER BY d.created_at DESC 
         LIMIT 50`,
        [currentUserId || -1],
        (err, rows) => {
            if (err) return res.status(500).send('Error');
            res.json(rows);
        }
    );
});

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Redirect root to index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/html/index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
