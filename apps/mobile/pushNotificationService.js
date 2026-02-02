/**
 * Push Notifications Service
 * 
 * Handles FCM push notification delivery for queue position updates.
 * Works with Expo Push Notifications for cross-platform delivery.
 */

import { db } from '../firebase';
import {
    doc,
    getDoc,
    updateDoc,
} from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
    }),
});

const FACILITY_ID = 'st-pete-athletic';

// ========================================
// PUSH TOKEN REGISTRATION
// ========================================

/**
 * Register for push notifications and get the Expo push token
 * @returns {string|null} The Expo push token or null if registration failed
 */
export async function registerForPushNotifications() {
    if (!Device.isDevice) {
        console.log('[Push] Must use physical device for Push Notifications');
        return null;
    }

    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permissions if not granted
    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }

    if (finalStatus !== 'granted') {
        console.log('[Push] Failed to get push notification permissions');
        return null;
    }

    // Get the Expo push token
    try {
        const projectId = Constants.expoConfig?.extra?.eas?.projectId
            ?? Constants.easConfig?.projectId;

        if (!projectId) {
            console.log('[Push] No EAS project ID found');
            return null;
        }

        const token = await Notifications.getExpoPushTokenAsync({
            projectId,
        });

        console.log('[Push] Token obtained:', token.data);

        // Android-specific channel setup
        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('queue-updates', {
                name: 'Queue Updates',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#1B4332',
                sound: 'default',
            });
        }

        return token.data;
    } catch (error) {
        console.error('[Push] Error getting token:', error);
        return null;
    }
}

/**
 * Save the push token to the user's document
 * @param {string} userId - User UID
 * @param {string} token - Expo push token
 */
export async function savePushToken(userId, token) {
    if (!userId || !token) return;

    try {
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
            pushToken: token,
            pushTokenUpdatedAt: new Date().toISOString(),
            pushPlatform: Platform.OS,
        });
        console.log('[Push] Token saved for user:', userId);
    } catch (error) {
        console.error('[Push] Error saving token:', error);
    }
}

/**
 * Get a user's push token from Firestore
 * @param {string} userId - User UID
 * @returns {string|null} The push token or null
 */
export async function getPushToken(userId) {
    try {
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);

        if (userDoc.exists()) {
            return userDoc.data().pushToken || null;
        }
        return null;
    } catch (error) {
        console.error('[Push] Error getting token:', error);
        return null;
    }
}

// ========================================
// LOCAL NOTIFICATION HELPERS
// ========================================

/**
 * Schedule a local notification immediately
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {Object} data - Extra data to include
 */
export async function scheduleLocalNotification(title, body, data = {}) {
    try {
        await Notifications.scheduleNotificationAsync({
            content: {
                title,
                body,
                data,
                sound: 'default',
            },
            trigger: null, // Immediate
        });
        console.log('[Push] Local notification scheduled:', title);
    } catch (error) {
        console.error('[Push] Error scheduling notification:', error);
    }
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelAllNotifications() {
    await Notifications.cancelAllScheduledNotificationsAsync();
    console.log('[Push] All notifications cancelled');
}

// ========================================
// NOTIFICATION LISTENERS
// ========================================

/**
 * Add a listener for when notification is received while app is open
 * @param {function} callback - Function to call with notification data
 * @returns {function} Cleanup function
 */
export function addNotificationReceivedListener(callback) {
    const subscription = Notifications.addNotificationReceivedListener(notification => {
        console.log('[Push] Notification received:', notification);
        callback(notification);
    });

    return () => subscription.remove();
}

/**
 * Add a listener for when user interacts with a notification
 * @param {function} callback - Function to call with response data
 * @returns {function} Cleanup function
 */
export function addNotificationResponseListener(callback) {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
        console.log('[Push] Notification response:', response);
        callback(response);
    });

    return () => subscription.remove();
}

// ========================================
// POSITION-BASED NOTIFICATIONS
// ========================================

/**
 * Send notification based on queue position
 * @param {number} position - Current queue position
 * @param {Object} queueInfo - Queue information
 */
export async function notifyPositionChange(position, queueInfo) {
    if (position === 1) {
        await scheduleLocalNotification(
            "🎾 IT'S YOUR TURN!",
            `Head to ${queueInfo.level?.label || 'your court'} now! Court ${queueInfo.courts || '1'} is ready.`,
            { type: 'YOUR_TURN', position, queueId: queueInfo.id }
        );
    } else if (position === 2) {
        await scheduleLocalNotification(
            "⚡ You're Almost Up!",
            `You're #2 in line for ${queueInfo.level?.label || 'your queue'}. Get ready!`,
            { type: 'ALMOST_UP', position, queueId: queueInfo.id }
        );
    } else if (position <= 4) {
        await scheduleLocalNotification(
            "📍 Queue Update",
            `You're now #${position} in line. Won't be long now!`,
            { type: 'POSITION_UPDATE', position, queueId: queueInfo.id }
        );
    }
}

export default {
    registerForPushNotifications,
    savePushToken,
    getPushToken,
    scheduleLocalNotification,
    cancelAllNotifications,
    addNotificationReceivedListener,
    addNotificationResponseListener,
    notifyPositionChange,
};
