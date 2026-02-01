/**
 * Push Notification Service
 * 
 * Handles registration and permission for push notifications
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db, auth } from './firebase';

// Configure notification behavior
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
    }),
});

/**
 * Register for push notifications
 * Returns the Expo push token
 */
export async function registerForPushNotifications() {
    let token;

    if (!Device.isDevice) {
        console.log('Push notifications only work on physical devices');
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
        console.log('Push notification permission denied');
        return null;
    }

    // Get push token
    try {
        token = (await Notifications.getExpoPushTokenAsync({
            projectId: 'YOUR_EAS_PROJECT_ID' // Replace with actual project ID
        })).data;
    } catch (error) {
        console.error('Error getting push token:', error);
        return null;
    }

    // Android-specific channel
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#10B981',
        });

        // High priority channel for "you're up" notifications
        await Notifications.setNotificationChannelAsync('urgent', {
            name: 'Court Ready',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 500, 250, 500],
            lightColor: '#10B981',
            sound: 'default',
        });
    }

    return token;
}

/**
 * Save push token to user's Firestore document
 */
export async function savePushToken(token) {
    const user = auth.currentUser;
    if (!user || !token) return;

    const playerRef = doc(db, 'players', user.uid);

    await updateDoc(playerRef, {
        fcmTokens: arrayUnion(token),
        lastTokenUpdate: new Date()
    });
}

/**
 * Add notification listener
 * Returns unsubscribe function
 */
export function addNotificationListener(callback) {
    const subscription = Notifications.addNotificationReceivedListener(callback);
    return () => subscription.remove();
}

/**
 * Add notification response listener (when user taps notification)
 */
export function addNotificationResponseListener(callback) {
    const subscription = Notifications.addNotificationResponseReceivedListener(callback);
    return () => subscription.remove();
}

/**
 * Get last notification response (for when app opened from notification)
 */
export async function getLastNotificationResponse() {
    return Notifications.getLastNotificationResponseAsync();
}
