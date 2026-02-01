/**
 * ML Prediction Service
 * 
 * "Hostess" feature - predicts game durations and wait times.
 * Uses historical data with gradual model improvement over time.
 */

const admin = require('firebase-admin');

// Default constants when we don't have enough data
const DEFAULT_GAME_DURATION_SECONDS = 15 * 60; // 15 minutes
const MIN_GAMES_FOR_PREDICTION = 10;

/**
 * Predict wait time for a player in queue
 * @param {string} queueId - Queue identifier
 * @param {number} position - Player's position in queue
 * @returns {Object} Wait time prediction
 */
async function predictWaitTime(queueId, position) {
    const db = admin.firestore();

    // Get queue info
    const queueDoc = await db.collection('queues').doc(queueId).get();
    if (!queueDoc.exists) {
        throw new Error('Queue not found');
    }

    const queueData = queueDoc.data();
    const courtId = queueData.courtId;

    // Get average game duration for this court/context
    const avgDuration = await getAverageGameDuration(courtId);

    // Calculate games until player is up
    // Each game uses 4 players, but rotation depends on queue length
    const gamesUntilUp = Math.ceil(position / 2); // Simplified: 2 players per rotation

    const estimatedWaitSeconds = gamesUntilUp * avgDuration;
    const confidence = calculateConfidence(courtId);

    return {
        estimatedWaitMinutes: Math.round(estimatedWaitSeconds / 60),
        estimatedWaitSeconds: Math.round(estimatedWaitSeconds),
        gamesUntilUp,
        averageGameDuration: Math.round(avgDuration / 60),
        confidence, // 'low', 'medium', 'high'
        calculatedAt: new Date().toISOString()
    };
}

/**
 * Get average game duration for a court
 * @param {string} courtId - Court identifier
 * @returns {number} Average duration in seconds
 */
async function getAverageGameDuration(courtId) {
    const db = admin.firestore();
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();

    // Try to get contextual average (same time of day, same day of week)
    const contextualGames = await db.collection('gameMetrics')
        .where('courtId', '==', courtId)
        .where('timeOfDay', '>=', currentHour - 1)
        .where('timeOfDay', '<=', currentHour + 1)
        .orderBy('timeOfDay')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();

    if (contextualGames.size >= MIN_GAMES_FOR_PREDICTION) {
        const durations = contextualGames.docs.map(d => d.data().duration);
        return calculateWeightedAverage(durations);
    }

    // Fall back to all games on this court
    const allGames = await db.collection('gameMetrics')
        .where('courtId', '==', courtId)
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get();

    if (allGames.size >= MIN_GAMES_FOR_PREDICTION) {
        const durations = allGames.docs.map(d => d.data().duration);
        return calculateWeightedAverage(durations);
    }

    // Fall back to facility average
    const courtDoc = await db.collection('courts').doc(courtId).get();
    if (courtDoc.exists) {
        const facilityId = courtDoc.data().facilityId;
        const facilityGames = await db.collection('gameMetrics')
            .where('facilityId', '==', facilityId)
            .orderBy('createdAt', 'desc')
            .limit(200)
            .get();

        if (facilityGames.size >= MIN_GAMES_FOR_PREDICTION) {
            const durations = facilityGames.docs.map(d => d.data().duration);
            return calculateWeightedAverage(durations);
        }
    }

    return DEFAULT_GAME_DURATION_SECONDS;
}

/**
 * Calculate weighted average (more recent games weighted higher)
 * @param {Array} values - Array of values
 * @returns {number} Weighted average
 */
function calculateWeightedAverage(values) {
    if (values.length === 0) return DEFAULT_GAME_DURATION_SECONDS;

    // Exponential decay weights - recent games count more
    const weights = values.map((_, i) => Math.exp(-0.05 * i));
    const weightSum = weights.reduce((a, b) => a + b, 0);

    const weightedSum = values.reduce((sum, val, i) => {
        return sum + (val * weights[i]);
    }, 0);

    return weightedSum / weightSum;
}

/**
 * Calculate prediction confidence based on available data
 * @param {string} courtId - Court identifier
 * @returns {string} Confidence level
 */
async function calculateConfidence(courtId) {
    const db = admin.firestore();

    const recentGames = await db.collection('gameMetrics')
        .where('courtId', '==', courtId)
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get();

    if (recentGames.size >= 100) return 'high';
    if (recentGames.size >= 30) return 'medium';
    return 'low';
}

/**
 * Get aggregated stats for ML training/analytics
 * @param {string} facilityId - Facility identifier
 * @param {number} days - Number of days to aggregate
 * @returns {Object} Aggregated stats
 */
async function getGameStats(facilityId, days = 30) {
    const db = admin.firestore();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const games = await db.collection('gameMetrics')
        .where('facilityId', '==', facilityId)
        .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(cutoff))
        .get();

    if (games.empty) {
        return { totalGames: 0, avgDuration: 0, byHour: {}, byDay: {} };
    }

    const durations = [];
    const byHour = {};
    const byDay = {};

    games.docs.forEach(doc => {
        const data = doc.data();
        durations.push(data.duration);

        // Group by hour
        const hour = data.timeOfDay;
        byHour[hour] = byHour[hour] || [];
        byHour[hour].push(data.duration);

        // Group by day
        const day = data.dayOfWeek;
        byDay[day] = byDay[day] || [];
        byDay[day].push(data.duration);
    });

    // Calculate averages
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

    Object.keys(byHour).forEach(h => {
        byHour[h] = byHour[h].reduce((a, b) => a + b, 0) / byHour[h].length;
    });

    Object.keys(byDay).forEach(d => {
        byDay[d] = byDay[d].reduce((a, b) => a + b, 0) / byDay[d].length;
    });

    return {
        totalGames: games.size,
        avgDuration: Math.round(avgDuration / 60), // minutes
        byHour: Object.fromEntries(
            Object.entries(byHour).map(([k, v]) => [k, Math.round(v / 60)])
        ),
        byDay: Object.fromEntries(
            Object.entries(byDay).map(([k, v]) => [k, Math.round(v / 60)])
        ),
        periodDays: days
    };
}

module.exports = {
    predictWaitTime,
    getAverageGameDuration,
    getGameStats,
    DEFAULT_GAME_DURATION_SECONDS,
    MIN_GAMES_FOR_PREDICTION
};
