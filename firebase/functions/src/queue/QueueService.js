/**
 * Queue Management Service
 * 
 * Core business logic for the virtual paddle rack queue system.
 * Handles player check-in, queue positioning, and smart rotation.
 */

const admin = require('firebase-admin');

const ROTATION_THRESHOLD = 8; // If 8+ waiting, all 4 rotate off
const MAX_CONSECUTIVE_WINS = 3; // Winners time-limited to 3 games

/**
 * Add a player to a queue
 * @param {string} queueId - Queue identifier (court/skill level based)
 * @param {string} playerId - Player's user ID
 * @returns {Object} Queue position info
 */
async function joinQueue(queueId, playerId) {
  const db = admin.firestore();
  const queueRef = db.collection('queues').doc(queueId);
  
  return db.runTransaction(async (transaction) => {
    const queueDoc = await transaction.get(queueRef);
    
    if (!queueDoc.exists) {
      throw new Error('Queue not found');
    }
    
    const queueData = queueDoc.data();
    const players = queueData.players || [];
    
    // Check if player already in queue
    if (players.some(p => p.playerId === playerId)) {
      throw new Error('Player already in queue');
    }
    
    // Add player to end of queue
    const position = players.length + 1;
    const newPlayer = {
      playerId,
      joinedAt: admin.firestore.FieldValue.serverTimestamp(),
      position,
      notified: false
    };
    
    transaction.update(queueRef, {
      players: admin.firestore.FieldValue.arrayUnion(newPlayer),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return {
      success: true,
      position,
      queueId,
      playersAhead: position - 1
    };
  });
}

/**
 * Remove a player from a queue
 * @param {string} queueId - Queue identifier
 * @param {string} playerId - Player's user ID
 * @returns {Object} Result
 */
async function leaveQueue(queueId, playerId) {
  const db = admin.firestore();
  const queueRef = db.collection('queues').doc(queueId);
  
  return db.runTransaction(async (transaction) => {
    const queueDoc = await transaction.get(queueRef);
    
    if (!queueDoc.exists) {
      throw new Error('Queue not found');
    }
    
    const queueData = queueDoc.data();
    let players = queueData.players || [];
    
    // Find and remove player
    const playerIndex = players.findIndex(p => p.playerId === playerId);
    if (playerIndex === -1) {
      throw new Error('Player not in queue');
    }
    
    players.splice(playerIndex, 1);
    
    // Recalculate positions
    players = players.map((p, idx) => ({
      ...p,
      position: idx + 1
    }));
    
    transaction.update(queueRef, {
      players,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return { success: true, queueId };
  });
}

/**
 * Get current queue status
 * @param {string} queueId - Queue identifier
 * @returns {Object} Queue status with players and positions
 */
async function getQueueStatus(queueId) {
  const db = admin.firestore();
  const queueDoc = await db.collection('queues').doc(queueId).get();
  
  if (!queueDoc.exists) {
    throw new Error('Queue not found');
  }
  
  const data = queueDoc.data();
  return {
    queueId,
    courtId: data.courtId,
    skillLevel: data.skillLevel,
    playerCount: (data.players || []).length,
    players: data.players || [],
    currentGame: data.currentGame || null
  };
}

/**
 * Determine rotation based on queue length and game result
 * 
 * BUSINESS LOGIC:
 * - 8+ waiting: All 4 players rotate off court
 * - <8 waiting: Only losing 2 players rotate off, winners stay
 * - Winners limited to MAX_CONSECUTIVE_WINS games
 * 
 * @param {Object} gameResult - Game result with winner info
 * @param {Array} queuePlayers - Current queue
 * @returns {Object} Rotation instructions
 */
function determineRotation(gameResult, queuePlayers) {
  const queueLength = queuePlayers.length;
  const { winningTeam, losingTeam, winnerConsecutiveWins } = gameResult;
  
  // Check if winners exceeded consecutive limit
  const winnersExceededLimit = winnerConsecutiveWins >= MAX_CONSECUTIVE_WINS;
  
  if (queueLength >= ROTATION_THRESHOLD || winnersExceededLimit) {
    // Full rotation - all 4 players come off
    return {
      rotationType: 'FULL',
      playersOff: [...winningTeam, ...losingTeam],
      playersStay: [],
      reason: winnersExceededLimit 
        ? 'consecutive_win_limit' 
        : 'high_demand',
      nextUp: queuePlayers.slice(0, 4).map(p => p.playerId)
    };
  } else {
    // Partial rotation - only losing team off
    return {
      rotationType: 'PARTIAL',
      playersOff: losingTeam,
      playersStay: winningTeam,
      reason: 'normal_play',
      nextUp: queuePlayers.slice(0, 2).map(p => p.playerId)
    };
  }
}

/**
 * Process game end and update queue
 * @param {string} gameId - Game identifier
 * @param {Object} result - Game result (score, winner)
 * @returns {Object} Updated queue and rotation info
 */
async function processGameEnd(gameId, result) {
  const db = admin.firestore();
  const gameRef = db.collection('games').doc(gameId);
  
  return db.runTransaction(async (transaction) => {
    const gameDoc = await transaction.get(gameRef);
    
    if (!gameDoc.exists) {
      throw new Error('Game not found');
    }
    
    const gameData = gameDoc.data();
    const queueRef = db.collection('queues').doc(gameData.queueId);
    const queueDoc = await transaction.get(queueRef);
    const queueData = queueDoc.data();
    
    // Calculate game duration
    const now = admin.firestore.Timestamp.now();
    const duration = now.seconds - gameData.startedAt.seconds;
    
    // Determine winning/losing teams
    const winningTeamKey = result.team1Score > result.team2Score ? 'team1' : 'team2';
    const losingTeamKey = winningTeamKey === 'team1' ? 'team2' : 'team1';
    
    // Get consecutive wins for winner tracking
    const winnerConsecutiveWins = await getConsecutiveWins(
      gameData.teams[winningTeamKey],
      gameData.courtId
    );
    
    const gameResult = {
      winningTeam: gameData.teams[winningTeamKey],
      losingTeam: gameData.teams[losingTeamKey],
      winnerConsecutiveWins
    };
    
    // Determine rotation
    const rotation = determineRotation(gameResult, queueData.players || []);
    
    // Update game document
    transaction.update(gameRef, {
      endedAt: now,
      duration,
      score: {
        team1: result.team1Score,
        team2: result.team2Score
      },
      winner: winningTeamKey,
      status: 'completed'
    });
    
    // Remove next-up players from queue
    let updatedPlayers = (queueData.players || [])
      .filter(p => !rotation.nextUp.includes(p.playerId))
      .map((p, idx) => ({ ...p, position: idx + 1 }));
    
    transaction.update(queueRef, {
      players: updatedPlayers,
      updatedAt: now
    });
    
    return {
      gameId,
      duration,
      rotation,
      updatedQueueLength: updatedPlayers.length
    };
  });
}

/**
 * Get consecutive wins for players on a court
 * @param {Array} playerIds - Player IDs to check
 * @param {string} courtId - Court identifier
 * @returns {number} Consecutive wins count
 */
async function getConsecutiveWins(playerIds, courtId) {
  const db = admin.firestore();
  
  // Get recent games on this court
  const recentGames = await db.collection('games')
    .where('courtId', '==', courtId)
    .where('status', '==', 'completed')
    .orderBy('endedAt', 'desc')
    .limit(MAX_CONSECUTIVE_WINS)
    .get();
  
  let consecutiveWins = 0;
  
  for (const doc of recentGames.docs) {
    const game = doc.data();
    const winnerKey = game.winner;
    const winners = game.teams[winnerKey];
    
    // Check if same players won
    const sameWinners = playerIds.every(id => winners.includes(id));
    if (sameWinners) {
      consecutiveWins++;
    } else {
      break;
    }
  }
  
  return consecutiveWins;
}

/**
 * Get players who need notification (next up or approaching)
 * @param {string} queueId - Queue identifier
 * @returns {Array} Players to notify
 */
async function getPlayersToNotify(queueId) {
  const db = admin.firestore();
  const queueDoc = await db.collection('queues').doc(queueId).get();
  
  if (!queueDoc.exists) return [];
  
  const players = queueDoc.data().players || [];
  const toNotify = [];
  
  players.forEach(player => {
    if (player.position <= 4 && !player.notified) {
      toNotify.push({
        ...player,
        notificationType: player.position <= 2 ? 'NEXT_UP' : 'APPROACHING'
      });
    }
  });
  
  return toNotify;
}

module.exports = {
  joinQueue,
  leaveQueue,
  getQueueStatus,
  determineRotation,
  processGameEnd,
  getPlayersToNotify,
  ROTATION_THRESHOLD,
  MAX_CONSECUTIVE_WINS
};
