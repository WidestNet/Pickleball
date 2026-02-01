/**
 * Home Screen
 * 
 * Main screen showing courts and queue options
 * Players can view available courts and join queues
 */

import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    RefreshControl,
    StatusBar,
    SafeAreaView
} from 'react-native';
import { getFacilities, getCourts, subscribeToQueue } from '../services/firebase';

const SKILL_LEVELS = [
    { id: '2.5-3.0', label: '2.5 - 3.0', color: '#60A5FA' },
    { id: '3.0-3.5', label: '3.0 - 3.5', color: '#34D399' },
    { id: '3.5-4.0', label: '3.5 - 4.0', color: '#FBBF24' },
    { id: '4.0+', label: '4.0+', color: '#F87171' },
];

export default function HomeScreen({ navigation }) {
    const [courts, setCourts] = useState([]);
    const [queues, setQueues] = useState({});
    const [refreshing, setRefreshing] = useState(false);
    const [selectedLevel, setSelectedLevel] = useState(null);

    // Hardcoded facility for now - would come from auth/settings
    const facilityId = 'st-pete-athletic';

    useEffect(() => {
        loadCourts();
    }, []);

    useEffect(() => {
        // Subscribe to queue updates for all courts
        const unsubscribes = courts.map(court => {
            return subscribeToQueue(court.queueId, (queueData) => {
                setQueues(prev => ({
                    ...prev,
                    [court.id]: queueData
                }));
            });
        });

        return () => unsubscribes.forEach(unsub => unsub && unsub());
    }, [courts]);

    async function loadCourts() {
        try {
            const courtsList = await getCourts(facilityId);
            setCourts(courtsList);
        } catch (error) {
            console.error('Error loading courts:', error);
        }
    }

    async function handleRefresh() {
        setRefreshing(true);
        await loadCourts();
        setRefreshing(false);
    }

    function handleJoinQueue(court) {
        navigation.navigate('JoinQueue', {
            court,
            queue: queues[court.id],
            skillLevel: selectedLevel
        });
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" />

            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>St Pete Athletic</Text>
                <Text style={styles.headerSubtitle}>🏓 Pickleball Courts</Text>
            </View>

            {/* Skill Level Filter */}
            <View style={styles.skillFilter}>
                <Text style={styles.filterLabel}>Your Skill Level</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {SKILL_LEVELS.map(level => (
                        <TouchableOpacity
                            key={level.id}
                            style={[
                                styles.skillChip,
                                selectedLevel === level.id && {
                                    backgroundColor: level.color,
                                    borderColor: level.color
                                }
                            ]}
                            onPress={() => setSelectedLevel(
                                selectedLevel === level.id ? null : level.id
                            )}
                        >
                            <Text style={[
                                styles.skillChipText,
                                selectedLevel === level.id && styles.skillChipTextSelected
                            ]}>
                                {level.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {/* Courts List */}
            <ScrollView
                style={styles.courtsList}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
                }
            >
                {courts.map(court => {
                    const queue = queues[court.id];
                    const playerCount = queue?.players?.length || 0;
                    const isAvailable = court.status === 'available';

                    return (
                        <TouchableOpacity
                            key={court.id}
                            style={styles.courtCard}
                            onPress={() => handleJoinQueue(court)}
                        >
                            <View style={styles.courtHeader}>
                                <Text style={styles.courtName}>{court.name}</Text>
                                <View style={[
                                    styles.statusBadge,
                                    isAvailable ? styles.statusAvailable : styles.statusInGame
                                ]}>
                                    <Text style={styles.statusText}>
                                        {isAvailable ? 'Available' : 'In Game'}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.courtInfo}>
                                <View style={styles.infoItem}>
                                    <Text style={styles.infoLabel}>In Queue</Text>
                                    <Text style={styles.infoValue}>{playerCount}</Text>
                                </View>

                                <View style={styles.infoItem}>
                                    <Text style={styles.infoLabel}>Est. Wait</Text>
                                    <Text style={styles.infoValue}>
                                        {playerCount > 0
                                            ? `~${Math.ceil(playerCount / 2 * 15)} min`
                                            : 'Now'}
                                    </Text>
                                </View>

                                {court.skillLevel && (
                                    <View style={styles.infoItem}>
                                        <Text style={styles.infoLabel}>Level</Text>
                                        <Text style={styles.infoValue}>{court.skillLevel}</Text>
                                    </View>
                                )}
                            </View>

                            <View style={styles.joinButton}>
                                <Text style={styles.joinButtonText}>
                                    {playerCount === 0 ? 'Start Playing' : 'Join Queue'}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    );
                })}

                {courts.length === 0 && (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyStateText}>
                            No courts available. Pull to refresh.
                        </Text>
                    </View>
                )}
            </ScrollView>
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
        paddingTop: 10,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
    headerSubtitle: {
        fontSize: 16,
        color: '#9CA3AF',
        marginTop: 4,
    },
    skillFilter: {
        paddingHorizontal: 20,
        marginBottom: 16,
    },
    filterLabel: {
        fontSize: 14,
        color: '#9CA3AF',
        marginBottom: 8,
    },
    skillChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#374151',
        marginRight: 8,
        backgroundColor: '#1F2937',
    },
    skillChipText: {
        color: '#9CA3AF',
        fontSize: 14,
        fontWeight: '500',
    },
    skillChipTextSelected: {
        color: '#FFFFFF',
    },
    courtsList: {
        flex: 1,
        paddingHorizontal: 20,
    },
    courtCard: {
        backgroundColor: '#1F2937',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#374151',
    },
    courtHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    courtName: {
        fontSize: 18,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusAvailable: {
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
    },
    statusInGame: {
        backgroundColor: 'rgba(251, 191, 36, 0.2)',
    },
    statusText: {
        fontSize: 12,
        fontWeight: '500',
        color: '#10B981',
    },
    courtInfo: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    infoItem: {
        alignItems: 'center',
    },
    infoLabel: {
        fontSize: 12,
        color: '#6B7280',
        marginBottom: 2,
    },
    infoValue: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    joinButton: {
        backgroundColor: '#10B981',
        borderRadius: 12,
        padding: 14,
        alignItems: 'center',
    },
    joinButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    emptyState: {
        padding: 40,
        alignItems: 'center',
    },
    emptyStateText: {
        color: '#6B7280',
        fontSize: 16,
    },
});
