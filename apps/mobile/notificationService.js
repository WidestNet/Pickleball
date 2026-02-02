/**
 * Push Notification Service for Pickleball Queue
 * Uses Expo Push Notifications
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import Constants from 'expo-constants';

// Configure notification behavior
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
    }),
});

/**
 * Request permission and get push token
 * @param {string} userId - Firebase user ID
 * @returns {string|null} Push token or null if failed
 */
export async function registerForPushNotifications(userId) {
    let token = null;

    try {
        // Check if physical device
        if (!Device.isDevice) {
            console.log('Push notifications only work on physical devices');
            return null;
        }

        // Check existing permission
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        // Request permission if not granted
        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== 'granted') {
            console.log('Push notification permission denied');
            return null;
        }

        // Get Expo push token - try with projectId, fallback to without
        try {
            const projectId = Constants.expoConfig?.extra?.eas?.projectId;
            if (projectId) {
                const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
                token = tokenData.data;
            } else {
                // Development mode without EAS - skip push token
                console.log('No EAS projectId configured, skipping push token registration');
                return null;
            }
        } catch (tokenError) {
            console.log('Push token registration skipped (dev mode):', tokenError.message);
            return null;
        }

        console.log('Push token:', token);

        // Store token in Firestore
        if (userId && token) {
            await setDoc(doc(db, 'users', userId), {
                pushToken: token,
                pushTokenUpdatedAt: serverTimestamp(),
                platform: Platform.OS,
            }, { merge: true });
            console.log('Push token stored for user:', userId);
        }

        // Configure Android channel
        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('queue-alerts', {
                name: 'Queue Alerts',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#52796F',
                sound: 'default',
            });
        }

        return token;
    } catch (error) {
        console.log('Push notification setup skipped:', error.message);
        return null;
    }
}

/**
 * Schedule a local notification (for testing)
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {number} seconds - Delay in seconds
 */
export async function scheduleLocalNotification(title, body, seconds = 1) {
    try {
        await Notifications.scheduleNotificationAsync({
            content: {
                title,
                body,
                sound: 'default',
                data: { type: 'queue_alert' },
            },
            trigger: seconds > 0 ? { type: 'timeInterval', seconds, repeats: false } : null,
        });
    } catch (error) {
        console.log('Notification error (may be simulator):', error.message);
    }
}

/**
 * Send immediate local notification (for testing)
 */
export async function sendImmediateNotification(title, body) {
    await Notifications.presentNotificationAsync({
        title,
        body,
        sound: 'default',
    });
}

/**
 * Add listener for notification received while app is foregrounded
 * @param {function} handler - Callback function
 * @returns {Subscription} Subscription to remove later
 */
export function addNotificationReceivedListener(handler) {
    return Notifications.addNotificationReceivedListener(handler);
}

/**
 * Add listener for notification interaction (tap)
 * @param {function} handler - Callback function
 * @returns {Subscription} Subscription to remove later
 */
export function addNotificationResponseListener(handler) {
    return Notifications.addNotificationResponseReceivedListener(handler);
}

/**
 * Save a push token to Firestore for a user
 * @param {string} userId - Firebase user ID
 * @param {string} token - Push token
 */
export async function savePushToken(userId, token) {
    if (!userId || !token) return;

    try {
        await setDoc(doc(db, 'users', userId), {
            pushToken: token,
            pushTokenUpdatedAt: serverTimestamp(),
            platform: Platform.OS,
        }, { merge: true });
        console.log('Push token saved for user:', userId);
    } catch (error) {
        console.error('Error saving push token:', error);
    }
}

export default {
    registerForPushNotifications,
    scheduleLocalNotification,
    sendImmediateNotification,
    addNotificationReceivedListener,
    addNotificationResponseListener,
    savePushToken,
};
