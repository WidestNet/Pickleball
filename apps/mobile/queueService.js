/**
 * Firestore Queue Service
 * Handles all queue operations for Pickleball Queue
 */

import { db } from './firebase';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    arrayUnion,
    arrayRemove,
    serverTimestamp,
    query,
    orderBy,
    where,
    increment,
    runTransaction,
} from 'firebase/firestore';

// Facility ID - St Pete Athletic
const FACILITY_ID = 'st-pete-athletic';

// Skill level colors - must match COLORS in index.js
const SKILL_COLORS = {
    beginner: '#22C55E',     // Bright green 🟢
    intermediate: '#3B82F6', // Bright blue 🔵
    advanced: '#A855F7',     // Purple 🟣
};

// ========================================
// FACILITY DATA
// ========================================

/**
 * Initialize facility data if it doesn't exist
 */
export async function initializeFacility() {
    const facilityRef = doc(db, 'facilities', FACILITY_ID);
    const facilitySnap = await getDoc(facilityRef);

    if (!facilitySnap.exists()) {
        console.log('Creating facility data...');
        await setDoc(facilityRef, {
            name: 'St Pete Athletic',
            tagline: 'Paddle & Social',
            courtCount: 14,
            createdAt: serverTimestamp(),
        });

        // Create skill level queues with distinct colors
        const queues = [
            {
                id: 'beginner',
                label: 'Beginner Open Play',
                description: '2.0 - 2.5',
                color: SKILL_COLORS.beginner,
                courts: '1-4',
                totalCourts: 4,
                activeCourts: 0,
                players: [],
            },
            {
                id: 'intermediate',
                label: 'Intermediate Open Play',
                description: '3.0 - 3.5',
                color: SKILL_COLORS.intermediate,
                courts: '5-10',
                totalCourts: 6,
                activeCourts: 0,
                players: [],
            },
            {
                id: 'advanced',
                label: 'Advanced Open Play',
                description: '4.0+',
                color: SKILL_COLORS.advanced,
                courts: '11-14',
                totalCourts: 4,
                activeCourts: 0,
                players: [],
            },
        ];

        for (const queue of queues) {
            await setDoc(doc(db, 'facilities', FACILITY_ID, 'queues', queue.id), {
                ...queue,
                updatedAt: serverTimestamp(),
            });
        }

        console.log('Facility initialized');
    }

    return facilitySnap.exists() ? facilitySnap.data() : null;
}

/**
 * Get facility info
 */
export async function getFacility() {
    const facilityRef = doc(db, 'facilities', FACILITY_ID);
    const facilitySnap = await getDoc(facilityRef);
    return facilitySnap.exists() ? { id: facilitySnap.id, ...facilitySnap.data() } : null;
}

/**
 * Update queue colors to match new distinct color scheme
 * Call this once to migrate existing queues
 */
export async function updateQueueColors() {
    const updates = [
        { id: 'beginner', color: SKILL_COLORS.beginner },
        { id: 'intermediate', color: SKILL_COLORS.intermediate },
        { id: 'advanced', color: SKILL_COLORS.advanced },
    ];

    for (const update of updates) {
        const queueRef = doc(db, 'facilities', FACILITY_ID, 'queues', update.id);
        await updateDoc(queueRef, {
            color: update.color,
            updatedAt: serverTimestamp(),
        });
        console.log(`Updated ${update.id} color to ${update.color}`);
    }

    console.log('All queue colors updated!');
}

// ========================================
// QUEUE OPERATIONS
// ========================================

/**
 * Subscribe to all queues for real-time updates
 */
export function subscribeToQueues(callback) {
    const queuesRef = collection(db, 'facilities', FACILITY_ID, 'queues');

    return onSnapshot(queuesRef, (snapshot) => {
        const queues = [];
        snapshot.forEach((doc) => {
            queues.push({ id: doc.id, ...doc.data() });
        });
        // Sort by order: beginner, intermediate, advanced
        const order = ['beginner', 'intermediate', 'advanced'];
        queues.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
        callback(queues);
    });
}

/**
 * Join a queue
 */
export async function joinQueue(queueId, user) {
    const queueRef = doc(db, 'facilities', FACILITY_ID, 'queues', queueId);

    return runTransaction(db, async (transaction) => {
        const queueDoc = await transaction.get(queueRef);

        if (!queueDoc.exists()) {
            throw new Error('Queue not found');
        }

        const queueData = queueDoc.data();
        const players = queueData.players || [];

        // Check if already in queue
        if (players.some(p => p.uid === user.uid)) {
            throw new Error('Already in this queue');
        }

        const newPlayer = {
            uid: user.uid,
            name: user.displayName || `Player ${players.length + 1}`,
            joinedAt: new Date().toISOString(),
            position: players.length + 1,
        };

        transaction.update(queueRef, {
            players: [...players, newPlayer],
            updatedAt: serverTimestamp(),
        });

        // Also update user's current queue
        const userRef = doc(db, 'users', user.uid);
        transaction.set(userRef, {
            currentQueue: {
                facilityId: FACILITY_ID,
                queueId: queueId,
                position: newPlayer.position,
                joinedAt: newPlayer.joinedAt,
            },
            updatedAt: serverTimestamp(),
        }, { merge: true });

        return newPlayer;
    });
}

/**
 * Leave a queue
 */
export async function leaveQueue(queueId, userId) {
    const queueRef = doc(db, 'facilities', FACILITY_ID, 'queues', queueId);

    return runTransaction(db, async (transaction) => {
        const queueDoc = await transaction.get(queueRef);

        if (!queueDoc.exists()) {
            throw new Error('Queue not found');
        }

        const queueData = queueDoc.data();
        const players = queueData.players || [];

        // Remove player and recalculate positions
        const updatedPlayers = players
            .filter(p => p.uid !== userId)
            .map((p, index) => ({ ...p, position: index + 1 }));

        transaction.update(queueRef, {
            players: updatedPlayers,
            updatedAt: serverTimestamp(),
        });

        // Clear user's current queue
        const userRef = doc(db, 'users', userId);
        transaction.update(userRef, {
            currentQueue: null,
            updatedAt: serverTimestamp(),
        });

        return true;
    });
}

/**
 * Get user's current queue status
 */
export async function getUserQueueStatus(userId) {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
        return null;
    }

    return userSnap.data().currentQueue || null;
}

/**
 * Subscribe to a specific queue for real-time updates
 */
export function subscribeToQueue(queueId, callback) {
    const queueRef = doc(db, 'facilities', FACILITY_ID, 'queues', queueId);

    return onSnapshot(queueRef, (doc) => {
        if (doc.exists()) {
            callback({ id: doc.id, ...doc.data() });
        }
    });
}

/**
 * Subscribe to user's queue status
 */
export function subscribeToUserQueue(userId, callback) {
    const userRef = doc(db, 'users', userId);

    return onSnapshot(userRef, (doc) => {
        if (doc.exists()) {
            callback(doc.data().currentQueue || null);
        } else {
            callback(null);
        }
    });
}

export { FACILITY_ID };
