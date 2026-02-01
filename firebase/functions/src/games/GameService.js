/**
 * Game Management Service
 * 
 * Handles game lifecycle: creation, tracking, scoring, and completion.
 */

const admin = require('firebase-admin');

/**
 * Create a new game
 * @param {Object} params - Game parameters
 * @returns {Object} Created game info
 */
async function createGame({ courtId, queueId, players, teams, facilityId }) {
    const db = admin.firestore();

    if (players.length !== 4) {
        throw new Error('Game requires exactly 4 players');
    }

    if (!teams.team1 || !teams.team2 ||
        teams.team1.length !== 2 || teams.team2.length !== 2) {
        throw new Error('Invalid team configuration');
    }

    const gameData = {
        courtId,
        queueId,
        facilityId,
        players,
        playerIds: players, // For querying
        teams,
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
        endedAt: null,
        duration: null,
        score: null,
        winner: null,
        status: 'in_progress'
    };

    const gameRef = await db.collection('games').add(gameData);

    // Update court status
    await db.collection('courts').doc(courtId).update({
        status: 'in_game',
        currentGame: gameRef.id
    });

    return {
        gameId: gameRef.id,
        ...gameData
    };
}

/**
 * End a game with score
 * @param {string} gameId - Game identifier
 * @param {Object} score - Score object { team1: number, team2: number }
 * @returns {Object} Completed game info
 */
async function endGame(gameId, score) {
    const db = admin.firestore();
    const gameRef = db.collection('games').doc(gameId);
    const gameDoc = await gameRef.get();

    if (!gameDoc.exists) {
        throw new Error('Game not found');
    }

    const gameData = gameDoc.data();

    if (gameData.status === 'completed') {
        throw new Error('Game already ended');
    }

    const now = admin.firestore.Timestamp.now();
    const duration = now.seconds - gameData.startedAt.seconds;
    const winner = score.team1 > score.team2 ? 'team1' : 'team2';

    await gameRef.update({
        endedAt: now,
        duration,
        score,
        winner,
        status: 'completed'
    });

    // Update court status
    await db.collection('courts').doc(gameData.courtId).update({
        status: 'available',
        currentGame: null
    });

    // Store for ML training
    await storeGameMetrics(gameId, {
        duration,
        players: gameData.players,
        courtId: gameData.courtId,
        facilityId: gameData.facilityId,
        timeOfDay: now.toDate().getHours(),
        dayOfWeek: now.toDate().getDay()
    });

    return {
        gameId,
        duration,
        score,
        winner,
        winningTeam: gameData.teams[winner],
        losingTeam: gameData.teams[winner === 'team1' ? 'team2' : 'team1']
    };
}

/**
 * Store game metrics for ML training
 * @param {string} gameId - Game identifier
 * @param {Object} metrics - Game metrics
 */
async function storeGameMetrics(gameId, metrics) {
    const db = admin.firestore();

    await db.collection('gameMetrics').add({
        gameId,
        ...metrics,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
}

/**
 * Get game details
 * @param {string} gameId - Game identifier
 * @returns {Object} Game data
 */
async function getGame(gameId) {
    const db = admin.firestore();
    const gameDoc = await db.collection('games').doc(gameId).get();

    if (!gameDoc.exists) {
        throw new Error('Game not found');
    }

    return {
        gameId,
        ...gameDoc.data()
    };
}

/**
 * Get active games for a facility
 * @param {string} facilityId - Facility identifier
 * @returns {Array} Active games
 */
async function getActiveGames(facilityId) {
    const db = admin.firestore();

    const snapshot = await db.collection('games')
        .where('facilityId', '==', facilityId)
        .where('status', '==', 'in_progress')
        .get();

    return snapshot.docs.map(doc => ({
        gameId: doc.id,
        ...doc.data()
    }));
}

/**
 * Get recent games for analytics
 * @param {string} facilityId - Facility identifier
 * @param {number} days - Number of days to look back
 * @returns {Array} Recent games
 */
async function getRecentGames(facilityId, days = 7) {
    const db = admin.firestore();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const snapshot = await db.collection('games')
        .where('facilityId', '==', facilityId)
        .where('endedAt', '>=', admin.firestore.Timestamp.fromDate(cutoff))
        .orderBy('endedAt', 'desc')
        .limit(500)
        .get();

    return snapshot.docs.map(doc => ({
        gameId: doc.id,
        ...doc.data()
    }));
}

module.exports = {
    createGame,
    endGame,
    getGame,
    getActiveGames,
    getRecentGames
};
