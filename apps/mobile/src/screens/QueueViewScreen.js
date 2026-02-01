/**
 * Queue View Screen
 * 
 * Shows player's position in queue with wait time prediction
 * The "hostess" feature - real-time updates on when you're up
 */

import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    SafeAreaView,
    StatusBar,
    ScrollView,
    Alert
} from 'react-native';
import {
    subscribeToQueue,
    leaveQueue,
    getWaitTimePrediction
} from '../services/firebase';
import { auth } from '../services/firebase';

export default function QueueViewScreen({ route, navigation }) {
    const { court, queueId } = route.params;
    const [queue, setQueue] = useState(null);
    const [prediction, setPrediction] = useState(null);
    const [myPosition, setMyPosition] = useState(null);

    const userId = auth.currentUser?.uid;

    useEffect(() => {
        const unsubscribe = subscribeToQueue(queueId, handleQueueUpdate);
        return () => unsubscribe();
    }, [queueId]);

    useEffect(() => {
        if (myPosition) {
            loadPrediction();
        }
    }, [myPosition]);

    function handleQueueUpdate(queueData) {
        setQueue(queueData);

        // Find my position
        const myEntry = queueData.players?.find(p => p.playerId === userId);
        setMyPosition(myEntry?.position || null);
    }

    async function loadPrediction() {
        try {
            const pred = await getWaitTimePrediction(queueId, myPosition);
            setPrediction(pred);
        } catch (error) {
            console.error('Error loading prediction:', error);
        }
    }

    async function handleLeaveQueue() {
        Alert.alert(
            'Leave Queue?',
            'Are you sure you want to leave the queue?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Leave',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await leaveQueue(queueId, court.facilityId);
                            navigation.goBack();
                        } catch (error) {
                            Alert.alert('Error', error.message);
                        }
                    }
                }
            ]
        );
    }

    const isNextUp = myPosition && myPosition <= 2;
    const isApproaching = myPosition && myPosition <= 4 && myPosition > 2;

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" />

            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.courtName}>{court.name}</Text>
                <Text style={styles.courtStatus}>
                    {court.status === 'in_game' ? '🎾 Game in Progress' : '✅ Court Ready'}
                </Text>
            </View>

            {/* Position Card */}
            <View style={[
                styles.positionCard,
                isNextUp && styles.positionCardNextUp,
                isApproaching && styles.positionCardApproaching
            ]}>
                {myPosition ? (
                    <>
                        <Text style={styles.positionLabel}>Your Position</Text>
                        <Text style={styles.positionNumber}>#{myPosition}</Text>

                        {isNextUp && (
                            <View style={styles.nextUpBadge}>
                                <Text style={styles.nextUpText}>🎉 YOU'RE NEXT!</Text>
                            </View>
                        )}

                        {isApproaching && (
                            <Text style={styles.approachingText}>Get ready - 2 games away!</Text>
                        )}
                    </>
                ) : (
                    <Text style={styles.notInQueue}>Not in queue</Text>
                )}
            </View>

            {/* Wait Time Prediction ("Hostess" Feature) */}
            {prediction && myPosition && (
                <View style={styles.predictionCard}>
                    <Text style={styles.predictionTitle}>⏱️ Estimated Wait</Text>

                    <View style={styles.predictionMain}>
                        <Text style={styles.predictionTime}>
                            {prediction.estimatedWaitMinutes}
                        </Text>
                        <Text style={styles.predictionUnit}>min</Text>
                    </View>

                    <View style={styles.predictionDetails}>
                        <View style={styles.predictionDetail}>
                            <Text style={styles.detailLabel}>Games Until You</Text>
                            <Text style={styles.detailValue}>{prediction.gamesUntilUp}</Text>
                        </View>
                        <View style={styles.predictionDetail}>
                            <Text style={styles.detailLabel}>Avg Game</Text>
                            <Text style={styles.detailValue}>{prediction.averageGameDuration} min</Text>
                        </View>
                        <View style={styles.predictionDetail}>
                            <Text style={styles.detailLabel}>Accuracy</Text>
                            <Text style={[
                                styles.detailValue,
                                prediction.confidence === 'high' && styles.confidenceHigh,
                                prediction.confidence === 'medium' && styles.confidenceMedium,
                                prediction.confidence === 'low' && styles.confidenceLow,
                            ]}>
                                {prediction.confidence.toUpperCase()}
                            </Text>
                        </View>
                    </View>
                </View>
            )}

            {/* Queue List */}
            <View style={styles.queueSection}>
                <Text style={styles.sectionTitle}>
                    Queue ({queue?.players?.length || 0} waiting)
                </Text>

                <ScrollView style={styles.queueList}>
                    {queue?.players?.map((player, index) => (
                        <View
                            key={player.playerId}
                            style={[
                                styles.queueItem,
                                player.playerId === userId && styles.queueItemMe
                            ]}
                        >
                            <Text style={styles.queuePosition}>#{index + 1}</Text>
                            <Text style={styles.queuePlayer}>
                                {player.playerId === userId ? 'You' : `Player ${index + 1}`}
                            </Text>
                            {index < 4 && (
                                <Text style={styles.queueNextUp}>Next up</Text>
                            )}
                        </View>
                    ))}

                    {(!queue?.players || queue.players.length === 0) && (
                        <Text style={styles.emptyQueue}>No players in queue</Text>
                    )}
                </ScrollView>
            </View>

            {/* Leave Queue Button */}
            {myPosition && (
                <TouchableOpacity
                    style={styles.leaveButton}
                    onPress={handleLeaveQueue}
                >
                    <Text style={styles.leaveButtonText}>Leave Queue</Text>
                </TouchableOpacity>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#111827',
    },
    header: {
        padding: 20,
        alignItems: 'center',
    },
    courtName: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
    courtStatus: {
        fontSize: 14,
        color: '#9CA3AF',
        marginTop: 4,
    },
    positionCard: {
        margin: 20,
        padding: 24,
        backgroundColor: '#1F2937',
        borderRadius: 20,
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#374151',
    },
    positionCardNextUp: {
        borderColor: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
    },
    positionCardApproaching: {
        borderColor: '#FBBF24',
        backgroundColor: 'rgba(251, 191, 36, 0.1)',
    },
    positionLabel: {
        fontSize: 14,
        color: '#9CA3AF',
        marginBottom: 8,
    },
    positionNumber: {
        fontSize: 64,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
    nextUpBadge: {
        marginTop: 12,
        backgroundColor: '#10B981',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
    },
    nextUpText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 16,
    },
    approachingText: {
        marginTop: 8,
        color: '#FBBF24',
        fontSize: 14,
        fontWeight: '500',
    },
    notInQueue: {
        fontSize: 18,
        color: '#6B7280',
    },
    predictionCard: {
        marginHorizontal: 20,
        padding: 20,
        backgroundColor: '#1F2937',
        borderRadius: 16,
        marginBottom: 20,
    },
    predictionTitle: {
        fontSize: 14,
        color: '#9CA3AF',
        marginBottom: 8,
    },
    predictionMain: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'center',
        marginBottom: 16,
    },
    predictionTime: {
        fontSize: 48,
        fontWeight: 'bold',
        color: '#10B981',
    },
    predictionUnit: {
        fontSize: 20,
        color: '#10B981',
        marginLeft: 4,
    },
    predictionDetails: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    predictionDetail: {
        alignItems: 'center',
    },
    detailLabel: {
        fontSize: 12,
        color: '#6B7280',
        marginBottom: 2,
    },
    detailValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    confidenceHigh: {
        color: '#10B981',
    },
    confidenceMedium: {
        color: '#FBBF24',
    },
    confidenceLow: {
        color: '#6B7280',
    },
    queueSection: {
        flex: 1,
        paddingHorizontal: 20,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
        marginBottom: 12,
    },
    queueList: {
        flex: 1,
    },
    queueItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        backgroundColor: '#1F2937',
        borderRadius: 12,
        marginBottom: 8,
    },
    queueItemMe: {
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        borderWidth: 1,
        borderColor: '#10B981',
    },
    queuePosition: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#9CA3AF',
        width: 40,
    },
    queuePlayer: {
        fontSize: 16,
        color: '#FFFFFF',
        flex: 1,
    },
    queueNextUp: {
        fontSize: 12,
        color: '#10B981',
        fontWeight: '500',
    },
    emptyQueue: {
        textAlign: 'center',
        color: '#6B7280',
        padding: 20,
    },
    leaveButton: {
        margin: 20,
        padding: 16,
        backgroundColor: '#374151',
        borderRadius: 12,
        alignItems: 'center',
    },
    leaveButtonText: {
        color: '#F87171',
        fontSize: 16,
        fontWeight: '600',
    },
});
