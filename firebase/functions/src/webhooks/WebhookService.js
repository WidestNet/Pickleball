/**
 * Webhook Service
 * 
 * PodPlay-compatible webhooks for external integrations.
 * Emits events for queue, game, and player actions.
 */

const admin = require('firebase-admin');
const crypto = require('crypto');

/**
 * Webhook event types
 */
const WEBHOOK_EVENTS = {
    QUEUE_PLAYER_JOINED: 'queue.player_joined',
    QUEUE_PLAYER_LEFT: 'queue.player_left',
    QUEUE_POSITION_UPDATED: 'queue.position_updated',
    GAME_STARTED: 'game.started',
    GAME_ENDED: 'game.ended',
    PLAYER_NOTIFIED: 'player.notified'
};

/**
 * Send webhook to all registered endpoints
 * @param {string} event - Event type
 * @param {Object} data - Event data
 * @param {string} facilityId - Facility identifier
 */
async function emitWebhook(event, data, facilityId) {
    const db = admin.firestore();

    // Get registered webhooks for this facility
    const webhooksSnapshot = await db.collection('webhooks')
        .where('facilityId', '==', facilityId)
        .where('enabled', '==', true)
        .where('events', 'array-contains', event)
        .get();

    if (webhooksSnapshot.empty) return;

    const payload = {
        event,
        timestamp: new Date().toISOString(),
        data,
        facilityId
    };

    const results = [];

    for (const doc of webhooksSnapshot.docs) {
        const webhook = doc.data();
        const signature = signPayload(JSON.stringify(payload), webhook.secret);

        try {
            const response = await fetch(webhook.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Webhook-Signature': `sha256=${signature}`,
                    'X-Webhook-Event': event
                },
                body: JSON.stringify(payload)
            });

            results.push({
                webhookId: doc.id,
                success: response.ok,
                status: response.status
            });

            // Log delivery
            await db.collection('webhookLogs').add({
                webhookId: doc.id,
                event,
                payload,
                response: {
                    status: response.status,
                    success: response.ok
                },
                sentAt: admin.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            results.push({
                webhookId: doc.id,
                success: false,
                error: error.message
            });
        }
    }

    return results;
}

/**
 * Sign payload for webhook verification
 * @param {string} payload - JSON payload
 * @param {string} secret - Webhook secret
 * @returns {string} HMAC signature
 */
function signPayload(payload, secret) {
    return crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
}

/**
 * Verify incoming webhook (for when we receive webhooks)
 * @param {string} payload - Raw request body
 * @param {string} signature - X-Webhook-Signature header
 * @param {string} secret - Our secret
 * @returns {boolean} Whether signature is valid
 */
function verifyWebhook(payload, signature, secret) {
    const expected = `sha256=${signPayload(payload, secret)}`;
    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expected)
    );
}

/**
 * Register a new webhook endpoint
 * @param {Object} params - Webhook configuration
 * @returns {Object} Created webhook
 */
async function registerWebhook({ facilityId, url, events, name }) {
    const db = admin.firestore();

    // Generate secret
    const secret = crypto.randomBytes(32).toString('hex');

    const webhookData = {
        facilityId,
        url,
        events,
        name,
        secret,
        enabled: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const ref = await db.collection('webhooks').add(webhookData);

    return {
        webhookId: ref.id,
        secret, // Only returned once - store this!
        ...webhookData
    };
}

/**
 * Get webhooks for a facility
 * @param {string} facilityId - Facility identifier
 * @returns {Array} Webhooks
 */
async function getWebhooks(facilityId) {
    const db = admin.firestore();

    const snapshot = await db.collection('webhooks')
        .where('facilityId', '==', facilityId)
        .get();

    return snapshot.docs.map(doc => ({
        webhookId: doc.id,
        ...doc.data(),
        secret: undefined // Never expose secret
    }));
}

module.exports = {
    emitWebhook,
    signPayload,
    verifyWebhook,
    registerWebhook,
    getWebhooks,
    WEBHOOK_EVENTS
};
