/**
 * St Pete Athletic Pickleball Queue System
 * 
 * Cloud Functions entry point
 * API endpoints for queue management, games, and predictions
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');

// Initialize Firebase Admin
admin.initializeApp();

// Import services
const QueueService = require('./queue/QueueService');
const GameService = require('./games/GameService');
const NotificationService = require('./notifications/NotificationService');
const PredictionService = require('./ml/PredictionService');
const WebhookService = require('./webhooks/WebhookService');

// Create Express app
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// Auth middleware
const authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split('Bearer ')[1];

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// Apply auth to all routes
app.use(authenticate);

// ========================================
// QUEUE ENDPOINTS
// ========================================

/**
 * Join a queue
 * POST /queues/:queueId/join
 */
app.post('/queues/:queueId/join', async (req, res) => {
    try {
        const { queueId } = req.params;
        const playerId = req.user.uid;

        const result = await QueueService.joinQueue(queueId, playerId);

        // Emit webhook
        await WebhookService.emitWebhook(
            WebhookService.WEBHOOK_EVENTS.QUEUE_PLAYER_JOINED,
            { queueId, playerId, position: result.position },
            req.body.facilityId
        );

        // Get wait time prediction
        const prediction = await PredictionService.predictWaitTime(queueId, result.position);

        res.json({ ...result, prediction });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * Leave a queue
 * DELETE /queues/:queueId/leave
 */
app.delete('/queues/:queueId/leave', async (req, res) => {
    try {
        const { queueId } = req.params;
        const playerId = req.user.uid;

        const result = await QueueService.leaveQueue(queueId, playerId);

        // Emit webhook
        await WebhookService.emitWebhook(
            WebhookService.WEBHOOK_EVENTS.QUEUE_PLAYER_LEFT,
            { queueId, playerId },
            req.body.facilityId
        );

        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * Get queue status
 * GET /queues/:queueId
 */
app.get('/queues/:queueId', async (req, res) => {
    try {
        const { queueId } = req.params;
        const status = await QueueService.getQueueStatus(queueId);
        res.json(status);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ========================================
// GAME ENDPOINTS
// ========================================

/**
 * Start a new game
 * POST /games
 */
app.post('/games', async (req, res) => {
    try {
        const { courtId, queueId, players, teams, facilityId } = req.body;

        const game = await GameService.createGame({
            courtId,
            queueId,
            players,
            teams,
            facilityId
        });

        // Emit webhook
        await WebhookService.emitWebhook(
            WebhookService.WEBHOOK_EVENTS.GAME_STARTED,
            game,
            facilityId
        );

        res.json(game);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * End a game with result
 * PATCH /games/:gameId/end
 */
app.patch('/games/:gameId/end', async (req, res) => {
    try {
        const { gameId } = req.params;
        const { team1Score, team2Score } = req.body;

        const result = await GameService.endGame(gameId, {
            team1: team1Score,
            team2: team2Score
        });

        // Process queue rotation
        const game = await GameService.getGame(gameId);
        const rotation = await QueueService.processGameEnd(gameId, {
            team1Score,
            team2Score
        });

        // Notify next players
        const courtDoc = await admin.firestore().collection('courts').doc(game.courtId).get();
        await NotificationService.notifyNextPlayers(game.queueId, courtDoc.data());

        // Emit webhook
        await WebhookService.emitWebhook(
            WebhookService.WEBHOOK_EVENTS.GAME_ENDED,
            { ...result, rotation },
            game.facilityId
        );

        res.json({ ...result, rotation });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * Get game details
 * GET /games/:gameId
 */
app.get('/games/:gameId', async (req, res) => {
    try {
        const { gameId } = req.params;
        const game = await GameService.getGame(gameId);
        res.json(game);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ========================================
// PREDICTION ENDPOINTS
// ========================================

/**
 * Get wait time prediction
 * GET /predictions/wait-time
 */
app.get('/predictions/wait-time', async (req, res) => {
    try {
        const { queueId, position } = req.query;
        const prediction = await PredictionService.predictWaitTime(
            queueId,
            parseInt(position, 10)
        );
        res.json(prediction);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * Get game stats for analytics
 * GET /predictions/stats/:facilityId
 */
app.get('/predictions/stats/:facilityId', async (req, res) => {
    try {
        const { facilityId } = req.params;
        const { days } = req.query;
        const stats = await PredictionService.getGameStats(
            facilityId,
            days ? parseInt(days, 10) : 30
        );
        res.json(stats);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ========================================
// WEBHOOK MANAGEMENT
// ========================================

/**
 * Register a webhook
 * POST /webhooks
 */
app.post('/webhooks', async (req, res) => {
    try {
        const { facilityId, url, events, name } = req.body;
        const webhook = await WebhookService.registerWebhook({
            facilityId,
            url,
            events,
            name
        });
        res.json(webhook);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * Get webhooks for facility
 * GET /webhooks/:facilityId
 */
app.get('/webhooks/:facilityId', async (req, res) => {
    try {
        const { facilityId } = req.params;
        const webhooks = await WebhookService.getWebhooks(facilityId);
        res.json(webhooks);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ========================================
// ADMIN ENDPOINTS
// ========================================

/**
 * Get facility analytics
 * GET /admin/analytics/:facilityId
 */
app.get('/admin/analytics/:facilityId', async (req, res) => {
    try {
        const { facilityId } = req.params;
        const { days } = req.query;

        const games = await GameService.getRecentGames(
            facilityId,
            days ? parseInt(days, 10) : 7
        );
        const stats = await PredictionService.getGameStats(
            facilityId,
            days ? parseInt(days, 10) : 30
        );

        res.json({
            games: games.length,
            stats,
            recentGames: games.slice(0, 20)
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Export as Firebase Function
exports.api = functions.https.onRequest(app);

// ========================================
// FIRESTORE TRIGGERS
// ========================================

/**
 * Notify players when queue updates
 */
exports.onQueueUpdate = functions.firestore
    .document('queues/{queueId}')
    .onUpdate(async (change, context) => {
        const before = change.before.data();
        const after = change.after.data();

        // Check for position changes
        const beforePlayers = new Set((before.players || []).map(p => p.playerId));
        const afterPlayers = (after.players || []);

        // Notify players whose position improved
        for (const player of afterPlayers) {
            const wasInQueue = beforePlayers.has(player.playerId);
            if (wasInQueue && player.position <= 4 && !player.notified) {
                await NotificationService.sendNotification(
                    player.playerId,
                    player.position <= 2 ? 'NEXT_UP' : 'APPROACHING',
                    { position: player.position, court: after.courtName }
                );
            }
        }
    });

/**
 * Clean up old game metrics (keep 90 days for ML)
 */
exports.cleanupMetrics = functions.pubsub
    .schedule('0 3 * * *') // 3 AM daily
    .timeZone('America/New_York')
    .onRun(async () => {
        const db = admin.firestore();
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 90);

        const oldMetrics = await db.collection('gameMetrics')
            .where('createdAt', '<', admin.firestore.Timestamp.fromDate(cutoff))
            .limit(500)
            .get();

        const batch = db.batch();
        oldMetrics.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        console.log(`Cleaned up ${oldMetrics.size} old game metrics`);
        return null;
    });
