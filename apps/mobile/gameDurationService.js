/**
 * Game Duration Service
 * 
 * Tracks game session durations for ML-powered wait time predictions.
 * Stores data in Firestore and calculates rolling averages per skill level.
 */

import { db } from '../firebase';
import {
    collection,
    doc,
    setDoc,
    updateDoc,
    getDocs,
    query,
    where,
    orderBy,
    limit,
    serverTimestamp,
    Timestamp,
} from 'firebase/firestore';

const FACILITY_ID = 'st-pete-athletic';

// ========================================
// GAME SESSION TRACKING
// ========================================

/**
 * Start a new game session
 * @param {string} courtId - Court number/ID
 * @param {string} level - Skill level (beginner, intermediate, advanced)
 * @param {string[]} playerIds - Array of player UIDs
 * @returns {string} Session ID
 */
export async function startGameSession(courtId, level, playerIds = []) {
    const sessionId = `${courtId}-${Date.now()}`;
    const sessionsRef = collection(db, 'facilities', FACILITY_ID, 'gameSessions');

    await setDoc(doc(sessionsRef, sessionId), {
        courtId,
        level,
        playerIds,
        playerCount: playerIds.length || 4,
        startedAt: serverTimestamp(),
        endedAt: null,
        durationMs: null,
        createdAt: serverTimestamp(),
    });

    console.log(`[GameDuration] Started session ${sessionId}`);
    return sessionId;
}

/**
 * End a game session and record duration
 * @param {string} sessionId - Session ID from startGameSession
 * @param {number} startedAtMs - Optional start timestamp in ms (if known)
 */
export async function endGameSession(sessionId, startedAtMs = null) {
    const sessionRef = doc(db, 'facilities', FACILITY_ID, 'gameSessions', sessionId);
    const endedAt = Timestamp.now();

    // Calculate duration if we have start time
    let durationMs = null;
    if (startedAtMs) {
        durationMs = Date.now() - startedAtMs;
    }

    await updateDoc(sessionRef, {
        endedAt,
        durationMs,
    });

    console.log(`[GameDuration] Ended session ${sessionId}, duration: ${durationMs ? Math.round(durationMs / 60000) + 'm' : 'unknown'}`);
    return { sessionId, durationMs };
}

// ========================================
// AVERAGE DURATION CALCULATION
// ========================================

/**
 * Get average game duration for a skill level
 * @param {string} level - Skill level (beginner, intermediate, advanced)
 * @param {number} daysBack - How many days of history to consider
 * @returns {number} Average duration in minutes
 */
export async function getAverageDuration(level, daysBack = 7) {
    const sessionsRef = collection(db, 'facilities', FACILITY_ID, 'gameSessions');
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    const sessionsQuery = query(
        sessionsRef,
        where('level', '==', level),
        where('endedAt', '!=', null),
        where('createdAt', '>=', Timestamp.fromDate(cutoffDate)),
        orderBy('createdAt', 'desc'),
        limit(50)
    );

    try {
        const snapshot = await getDocs(sessionsQuery);

        if (snapshot.empty) {
            // No data, return default
            return getDefaultDuration(level);
        }

        const durations = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.durationMs && data.durationMs > 0) {
                durations.push(data.durationMs);
            }
        });

        if (durations.length === 0) {
            return getDefaultDuration(level);
        }

        // Calculate average
        const avgMs = durations.reduce((a, b) => a + b, 0) / durations.length;
        const avgMinutes = Math.round(avgMs / 60000);

        console.log(`[GameDuration] ${level} avg: ${avgMinutes}m (from ${durations.length} games)`);
        return avgMinutes;
    } catch (error) {
        console.error('[GameDuration] Error getting average:', error);
        return getDefaultDuration(level);
    }
}

/**
 * Get all averages for all levels at once
 * @returns {Object} { beginner: number, intermediate: number, advanced: number }
 */
export async function getAllAverageDurations() {
    const [beginner, intermediate, advanced] = await Promise.all([
        getAverageDuration('beginner'),
        getAverageDuration('intermediate'),
        getAverageDuration('advanced'),
    ]);

    return { beginner, intermediate, advanced };
}

// ========================================
// WAIT TIME PREDICTION
// ========================================

/**
 * Predict wait time based on position and historical data
 * @param {number} position - Current position in queue
 * @param {number} avgDurationMinutes - Average game duration for this level
 * @param {number} activeCourts - Number of active courts
 * @returns {number} Estimated wait in minutes
 */
export function predictWaitTime(position, avgDurationMinutes, activeCourts = 1) {
    if (position <= 0) return 0;

    // Players per game
    const playersPerGame = 4;

    // How many "rotations" until this player's turn
    // Each rotation plays playersPerGame people
    const gamesNeeded = Math.ceil(position / playersPerGame);

    // With multiple courts, games happen in parallel
    // But not perfectly parallel - assume 70% efficiency
    const parallelEfficiency = 0.7;
    const effectiveCourts = Math.max(1, activeCourts * parallelEfficiency);

    // Estimated wait
    const estimatedMinutes = (gamesNeeded * avgDurationMinutes) / effectiveCourts;

    // Round to nearest 5 minutes for cleaner display
    return Math.max(0, Math.round(estimatedMinutes / 5) * 5);
}

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Get default duration when no historical data exists
 * Higher levels tend to play longer
 */
function getDefaultDuration(level) {
    switch (level) {
        case 'beginner':
            return 12; // 12 minutes average
        case 'intermediate':
            return 15; // 15 minutes
        case 'advanced':
            return 18; // 18 minutes (longer rallies)
        default:
            return 15;
    }
}

/**
 * Format wait time for display
 * @param {number} minutes - Wait time in minutes
 * @returns {string} Formatted string like "~15m" or "< 5m"
 */
export function formatWaitTime(minutes) {
    if (minutes <= 0) return 'No Wait';
    if (minutes < 5) return '< 5m';
    if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return mins > 0 ? `~${hours}h ${mins}m` : `~${hours}h`;
    }
    return `~${minutes}m`;
}
