/**
 * Firebase Configuration for Pickleball Queue
 * Project: pickleball-queue-stpete
 */

import { initializeApp, getApps } from 'firebase/app';
import {
    getAuth,
    signInAnonymously,
    onAuthStateChanged
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyByBmiK7du10u1i0lZO5PXmVb9vXSTUTlQ",
    authDomain: "pickleball-queue-stpete.firebaseapp.com",
    projectId: "pickleball-queue-stpete",
    storageBucket: "pickleball-queue-stpete.firebasestorage.app",
    messagingSenderId: "612420627927",
    appId: "1:612420627927:web:424b05df6798f734e26f92"
};

// Initialize Firebase (prevent duplicate initialization)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize Auth (simple approach for Expo Go compatibility)
const auth = getAuth(app);

// Initialize Firestore
const db = getFirestore(app);

// Anonymous sign-in helper
export async function signInAnon() {
    try {
        console.log('Attempting anonymous sign-in...');
        const userCredential = await signInAnonymously(auth);
        console.log('Signed in anonymously:', userCredential.user.uid);
        return userCredential.user;
    } catch (error) {
        console.error('Anonymous sign-in error:', error.code, error.message);
        throw error;
    }
}

// Auth state listener
export function onAuthChange(callback) {
    return onAuthStateChanged(auth, callback);
}

// Get current user
export function getCurrentUser() {
    return auth.currentUser;
}

export { app, auth, db };
