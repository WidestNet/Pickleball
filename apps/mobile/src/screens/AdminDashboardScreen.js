/**
 * Admin Analytics Screen
 * 
 * Dashboard for facility managers to view usage stats
 */

import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    SafeAreaView,
    StatusBar,
    RefreshControl,
    Dimensions
} from 'react-native';
import { auth } from '../services/firebase';

const API_BASE = 'https://us-central1-stpete-pickleball.cloudfunctions.net/api';

export default function AdminDashboardScreen() {
    const [stats, setStats] = useState(null);
    const [refreshing, setRefreshing] = useState(false);

    const facilityId = 'st-pete-athletic';

    useEffect(() => {
        loadStats();
    }, []);

    async function loadStats() {
        try {
            const token = await auth.currentUser?.getIdToken();
            const response = await fetch(
                `${API_BASE}/admin/analytics/${facilityId}?days=30`,
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );
            const data = await response.json();
            setStats(data);
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    async function handleRefresh() {
        setRefreshing(true);
        await loadStats();
        setRefreshing(false);
    }

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" />

            <ScrollView
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
                }
            >
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Analytics</Text>
                    <Text style={styles.headerSubtitle}>Last 30 days</Text>
                </View>

                {/* Summary Stats */}
                <View style={styles.statsGrid}>
                    <View style={styles.statCard}>
                        <Text style={styles.statValue}>{stats?.games || 0}</Text>
                        <Text style={styles.statLabel}>Total Games</Text>
                    </View>

                    <View style={styles.statCard}>
                        <Text style={styles.statValue}>{stats?.stats?.avgDuration || 0}</Text>
                        <Text style={styles.statLabel}>Avg Game (min)</Text>
                    </View>

                    <View style={styles.statCard}>
                        <Text style={styles.statValue}>
                            {stats?.games ? Math.round(stats.games / 30) : 0}
                        </Text>
                        <Text style={styles.statLabel}>Games/Day</Text>
                    </View>

                    <View style={styles.statCard}>
                        <Text style={styles.statValue}>
                            {stats?.stats?.totalGames || 0}
                        </Text>
                        <Text style={styles.statLabel}>Data Points</Text>
                    </View>
                </View>

                {/* By Day of Week */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Avg Duration by Day</Text>
                    <View style={styles.barChart}>
                        {[0, 1, 2, 3, 4, 5, 6].map(day => {
                            const value = stats?.stats?.byDay?.[day] || 0;
                            const maxValue = Math.max(
                                ...Object.values(stats?.stats?.byDay || { 0: 15 }),
                                15
                            );
                            const height = value ? (value / maxValue) * 100 : 0;

                            return (
                                <View key={day} style={styles.barContainer}>
                                    <Text style={styles.barValue}>{value}</Text>
                                    <View
                                        style={[
                                            styles.bar,
                                            { height: `${Math.max(height, 5)}%` }
                                        ]}
                                    />
                                    <Text style={styles.barLabel}>{dayNames[day]}</Text>
                                </View>
                            );
                        })}
                    </View>
                </View>

                {/* By Hour */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Avg Duration by Hour</Text>
                    <View style={styles.hourGrid}>
                        {[8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map(hour => {
                            const value = stats?.stats?.byHour?.[hour] || 0;
                            const intensity = value
                                ? Math.min(value / 20, 1)
                                : 0;

                            return (
                                <View
                                    key={hour}
                                    style={[
                                        styles.hourCell,
                                        {
                                            backgroundColor: intensity
                                                ? `rgba(16, 185, 129, ${0.2 + intensity * 0.6})`
                                                : '#1F2937'
                                        }
                                    ]}
                                >
                                    <Text style={styles.hourLabel}>
                                        {hour > 12 ? `${hour - 12}p` : `${hour}a`}
                                    </Text>
                                    <Text style={styles.hourValue}>{value || '-'}</Text>
                                </View>
                            );
                        })}
                    </View>
                </View>

                {/* Recent Games */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Recent Games</Text>
                    {stats?.recentGames?.slice(0, 10).map((game, index) => (
                        <View key={game.gameId || index} style={styles.gameRow}>
                            <View>
                                <Text style={styles.gameScore}>
                                    {game.score?.team1 || 0} - {game.score?.team2 || 0}
                                </Text>
                                <Text style={styles.gameMeta}>
                                    {Math.round(game.duration / 60)} min
                                </Text>
                            </View>
                            <Text style={styles.gameWinner}>
                                {game.winner === 'team1' ? 'Team 1' : 'Team 2'} won
                            </Text>
                        </View>
                    ))}

                    {(!stats?.recentGames || stats.recentGames.length === 0) && (
                        <Text style={styles.noData}>No games recorded yet</Text>
                    )}
                </View>

                {/* ML Model Info */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Prediction Model</Text>
                    <View style={styles.mlCard}>
                        <Text style={styles.mlLabel}>Status</Text>
                        <Text style={[
                            styles.mlValue,
                            (stats?.stats?.totalGames || 0) >= 100
                                ? styles.mlActive
                                : styles.mlTraining
                        ]}>
                            {(stats?.stats?.totalGames || 0) >= 100
                                ? '✅ Active'
                                : '🔄 Training'}
                        </Text>
                        <Text style={styles.mlDescription}>
                            {(stats?.stats?.totalGames || 0) >= 100
                                ? 'High confidence predictions available'
                                : `Need ${100 - (stats?.stats?.totalGames || 0)} more games for high accuracy`}
                        </Text>
                    </View>
                </View>
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
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
    headerSubtitle: {
        fontSize: 14,
        color: '#9CA3AF',
        marginTop: 4,
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 12,
    },
    statCard: {
        width: '50%',
        padding: 8,
    },
    statCardInner: {
        backgroundColor: '#1F2937',
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
    },
    statValue: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#10B981',
        backgroundColor: '#1F2937',
        borderRadius: 12,
        padding: 16,
        textAlign: 'center',
        overflow: 'hidden',
    },
    statLabel: {
        fontSize: 12,
        color: '#9CA3AF',
        marginTop: 4,
        textAlign: 'center',
    },
    section: {
        padding: 20,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#FFFFFF',
        marginBottom: 16,
    },
    barChart: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        height: 150,
        alignItems: 'flex-end',
    },
    barContainer: {
        flex: 1,
        alignItems: 'center',
        height: '100%',
        justifyContent: 'flex-end',
    },
    barValue: {
        fontSize: 10,
        color: '#9CA3AF',
        marginBottom: 4,
    },
    bar: {
        width: '60%',
        backgroundColor: '#10B981',
        borderRadius: 4,
        minHeight: 4,
    },
    barLabel: {
        fontSize: 10,
        color: '#6B7280',
        marginTop: 4,
    },
    hourGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    hourCell: {
        width: `${100 / 7}%`,
        padding: 8,
        alignItems: 'center',
        borderRadius: 8,
        marginBottom: 4,
    },
    hourLabel: {
        fontSize: 10,
        color: '#9CA3AF',
    },
    hourValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#FFFFFF',
        marginTop: 2,
    },
    gameRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#1F2937',
        padding: 12,
        borderRadius: 12,
        marginBottom: 8,
    },
    gameScore: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    gameMeta: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 2,
    },
    gameWinner: {
        fontSize: 12,
        color: '#10B981',
    },
    noData: {
        textAlign: 'center',
        color: '#6B7280',
        padding: 20,
    },
    mlCard: {
        backgroundColor: '#1F2937',
        borderRadius: 16,
        padding: 16,
    },
    mlLabel: {
        fontSize: 12,
        color: '#9CA3AF',
    },
    mlValue: {
        fontSize: 18,
        fontWeight: '600',
        marginTop: 4,
    },
    mlActive: {
        color: '#10B981',
    },
    mlTraining: {
        color: '#FBBF24',
    },
    mlDescription: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 8,
    },
});
