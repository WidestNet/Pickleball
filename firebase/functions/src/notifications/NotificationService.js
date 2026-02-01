/**
 * Notification Service
 * 
 * Handles push notifications (FCM) and SMS (Twilio) for player alerts.
 * SMS reserved for critical alerts only to manage costs.
 */

const admin = require('firebase-admin');

// Lazy load Twilio to avoid cold start costs
let twilioClient = null;
function getTwilioClient() {
    if (!twilioClient) {
        const functions = require('firebase-functions');
        const twilio = require('twilio');
        twilioClient = twilio(
            functions.config().twilio?.sid,
            functions.config().twilio?.token
        );
    }
    return twilioClient;
}

const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER;

/**
 * Notification types and their channels
 */
const NOTIFICATION_CONFIG = {
    NEXT_UP: {
        title: "You're Next! 🏓",
        body: "Head to Court {court} - you're up!",
        channels: ['push', 'sms'], // SMS for critical
        priority: 'high'
    },
    APPROACHING: {
        title: "Get Ready! 🎾",
        body: "2 games until you're on court",
        channels: ['push'], // Push only
        priority: 'normal'
    },
    GAME_STARTING: {
        title: "Game Time!",
        body: "Your game on Court {court} is starting",
        channels: ['push'],
        priority: 'high'
    },
    QUEUE_UPDATE: {
        title: "Queue Update",
        body: "You're now #{position} in line",
        channels: ['push'],
        priority: 'normal'
    },
    REMOVED_INACTIVE: {
        title: "Removed from Queue",
        body: "You've been removed due to inactivity",
        channels: ['push', 'sms'],
        priority: 'high'
    }
};

/**
 * Send notification to a player
 * @param {string} playerId - Player's user ID
 * @param {string} type - Notification type
 * @param {Object} data - Template data
 */
async function sendNotification(playerId, type, data = {}) {
    const db = admin.firestore();
    const playerDoc = await db.collection('players').doc(playerId).get();

    if (!playerDoc.exists) {
        console.error(`Player ${playerId} not found`);
        return;
    }

    const player = playerDoc.data();
    const config = NOTIFICATION_CONFIG[type];

    if (!config) {
        console.error(`Unknown notification type: ${type}`);
        return;
    }

    // Format message with data
    const title = formatMessage(config.title, data);
    const body = formatMessage(config.body, data);

    const results = {
        push: null,
        sms: null
    };

    // Send push notification
    if (config.channels.includes('push') && player.notificationPrefs?.push !== false) {
        results.push = await sendPushNotification(player.fcmTokens, title, body, data);
    }

    // Send SMS for critical notifications only
    if (config.channels.includes('sms') &&
        player.notificationPrefs?.sms === true &&
        player.phone) {
        results.sms = await sendSMS(player.phone, `${title}\n${body}`);
    }

    // Log notification
    await db.collection('notificationLogs').add({
        playerId,
        type,
        data,
        results,
        sentAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return results;
}

/**
 * Send push notification via FCM
 * @param {Array} tokens - FCM tokens
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {Object} data - Additional data
 */
async function sendPushNotification(tokens, title, body, data = {}) {
    if (!tokens || tokens.length === 0) {
        return { success: false, reason: 'no_tokens' };
    }

    const message = {
        notification: { title, body },
        data: {
            ...Object.fromEntries(
                Object.entries(data).map(([k, v]) => [k, String(v)])
            ),
            click_action: 'FLUTTER_NOTIFICATION_CLICK'
        },
        tokens
    };

    try {
        const response = await admin.messaging().sendEachForMulticast(message);
        return {
            success: response.successCount > 0,
            successCount: response.successCount,
            failureCount: response.failureCount
        };
    } catch (error) {
        console.error('FCM error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send SMS via Twilio
 * @param {string} phone - Phone number
 * @param {string} message - Message text
 */
async function sendSMS(phone, message) {
    try {
        const client = getTwilioClient();
        const result = await client.messages.create({
            body: message,
            from: TWILIO_PHONE,
            to: phone
        });
        return { success: true, sid: result.sid };
    } catch (error) {
        console.error('Twilio error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Format message with template variables
 * @param {string} template - Message template
 * @param {Object} data - Template data
 * @returns {string} Formatted message
 */
function formatMessage(template, data) {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
        return data[key] !== undefined ? data[key] : match;
    });
}

/**
 * Notify next players in queue after game ends
 * @param {string} queueId - Queue identifier
 * @param {Object} courtInfo - Court information
 */
async function notifyNextPlayers(queueId, courtInfo) {
    const db = admin.firestore();
    const queueDoc = await db.collection('queues').doc(queueId).get();

    if (!queueDoc.exists) return;

    const players = queueDoc.data().players || [];

    // Notify first 4 players (next game)
    for (let i = 0; i < Math.min(4, players.length); i++) {
        const player = players[i];
        const type = i < 2 ? 'NEXT_UP' : 'APPROACHING';

        await sendNotification(player.playerId, type, {
            court: courtInfo.name,
            position: i + 1
        });

        // Mark as notified
        players[i].notified = true;
    }

    // Update queue
    await db.collection('queues').doc(queueId).update({ players });
}

module.exports = {
    sendNotification,
    sendPushNotification,
    sendSMS,
    notifyNextPlayers,
    NOTIFICATION_CONFIG
};
