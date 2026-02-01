/**
 * Firebase Configuration & Services
 * 
 * Centralized Firebase setup for the mobile app
 */

import { initializeApp } from 'firebase/app';
import {
    getAuth,
    signInWithPhoneNumber,
    PhoneAuthProvider,
    signOut as firebaseSignOut
} from 'firebase/auth';
import {
    getFirestore,
    collection,
    doc,
    onSnapshot,
    getDocs,
    query,
    where,
    orderBy
} from 'firebase/firestore';

// Firebase config - replace with your actual config
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "stpete-pickleball.firebaseapp.com",
    projectId: "stpete-pickleball",
    storageBucket: "stpete-pickleball.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// API base URL
const API_BASE = 'https://us-central1-stpete-pickleball.cloudfunctions.net/api';

/**
 * Get auth token for API calls
 */
async function getAuthToken() {
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    return user.getIdToken();
}

/**
 * Make authenticated API request
 */
async function apiRequest(endpoint, options = {}) {
    const token = await getAuthToken();

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...options.headers
        }
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'API request failed');
    }

    return response.json();
}

// ========================================
// AUTH FUNCTIONS
// ========================================

export async function signInWithPhone(phoneNumber, recaptchaVerifier) {
    const confirmationResult = await signInWithPhoneNumber(
        auth,
        phoneNumber,
        recaptchaVerifier
    );
    return confirmationResult;
}

export async function signOut() {
    await firebaseSignOut(auth);
}

export function onAuthStateChanged(callback) {
    return auth.onAuthStateChanged(callback);
}

// ========================================
// QUEUE FUNCTIONS
// ========================================

export async function joinQueue(queueId, facilityId) {
    return apiRequest(`/queues/${queueId}/join`, {
        method: 'POST',
        body: JSON.stringify({ facilityId })
    });
}

export async function leaveQueue(queueId, facilityId) {
    return apiRequest(`/queues/${queueId}/leave`, {
        method: 'DELETE',
        body: JSON.stringify({ facilityId })
    });
}

export async function getQueueStatus(queueId) {
    return apiRequest(`/queues/${queueId}`);
}

/**
 * Subscribe to real-time queue updates
 */
export function subscribeToQueue(queueId, callback) {
    const queueRef = doc(db, 'queues', queueId);
    return onSnapshot(queueRef, (snapshot) => {
        if (snapshot.exists()) {
            callback({ queueId, ...snapshot.data() });
        }
    });
}

// ========================================
// GAME FUNCTIONS
// ========================================

export async function startGame(gameData) {
    return apiRequest('/games', {
        method: 'POST',
        body: JSON.stringify(gameData)
    });
}

export async function endGame(gameId, score) {
    return apiRequest(`/games/${gameId}/end`, {
        method: 'PATCH',
        body: JSON.stringify(score)
    });
}

export async function getGame(gameId) {
    return apiRequest(`/games/${gameId}`);
}

// ========================================
// PREDICTION FUNCTIONS
// ========================================

export async function getWaitTimePrediction(queueId, position) {
    return apiRequest(`/predictions/wait-time?queueId=${queueId}&position=${position}`);
}

// ========================================
// FACILITY FUNCTIONS
// ========================================

export async function getFacilities() {
    const facilitiesRef = collection(db, 'facilities');
    const snapshot = await getDocs(facilitiesRef);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function getCourts(facilityId) {
    const courtsRef = collection(db, 'courts');
    const q = query(
        courtsRef,
        where('facilityId', '==', facilityId),
        orderBy('name')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Subscribe to court status updates
 */
export function subscribeToCourt(courtId, callback) {
    const courtRef = doc(db, 'courts', courtId);
    return onSnapshot(courtRef, (snapshot) => {
        if (snapshot.exists()) {
            callback({ courtId, ...snapshot.data() });
        }
    });
}

// Export Firebase instances for direct use
export { auth, db };
