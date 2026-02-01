/**
 * On Court Screen
 * 
 * Active game view with score entry and game end flow
 */

import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    SafeAreaView,
    StatusBar,
    Alert
} from 'react-native';
import { getGame, endGame } from '../services/firebase';

export default function OnCourtScreen({ route, navigation }) {
    const { gameId, court } = route.params;
    const [game, setGame] = useState(null);
    const [team1Score, setTeam1Score] = useState(0);
    const [team2Score, setTeam2Score] = useState(0);
    const [gameEnded, setGameEnded] = useState(false);

    useEffect(() => {
        loadGame();
    }, [gameId]);

    async function loadGame() {
        try {
            const gameData = await getGame(gameId);
            setGame(gameData);
        } catch (error) {
            console.error('Error loading game:', error);
        }
    }

    function incrementScore(team) {
        if (gameEnded) return;

        if (team === 1) {
            setTeam1Score(prev => Math.min(prev + 1, 15));
        } else {
            setTeam2Score(prev => Math.min(prev + 1, 15));
        }
    }

    function decrementScore(team) {
        if (gameEnded) return;

        if (team === 1) {
            setTeam1Score(prev => Math.max(prev - 1, 0));
        } else {
            setTeam2Score(prev => Math.max(prev - 1, 0));
        }
    }

    async function handleEndGame() {
        if (team1Score === team2Score) {
            Alert.alert('Invalid Score', 'Game cannot end in a tie');
            return;
        }

        const winner = team1Score > team2Score ? 'Team 1' : 'Team 2';

        Alert.alert(
            'End Game?',
            `Final score: ${team1Score} - ${team2Score}\n${winner} wins!`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Confirm',
                    onPress: async () => {
                        try {
                            setGameEnded(true);
                            const result = await endGame(gameId, {
                                team1Score,
                                team2Score
                            });

                            // Show rotation result
                            const rotationType = result.rotation.rotationType;
                            const message = rotationType === 'FULL'
                                ? 'All 4 players rotating off. Next 4 from queue!'
                                : `${winner} stays on! Losing team rotates.`;

                            Alert.alert('Game Complete!', message, [
                                { text: 'OK', onPress: () => navigation.navigate('Home') }
                            ]);
                        } catch (error) {
                            setGameEnded(false);
                            Alert.alert('Error', error.message);
                        }
                    }
                }
            ]
        );
    }

    const elapsedMinutes = game?.startedAt
        ? Math.floor((Date.now() / 1000 - game.startedAt.seconds) / 60)
        : 0;

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" />

            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.courtName}>{court?.name || 'Court'}</Text>
                <View style={styles.timerBadge}>
                    <Text style={styles.timerText}>⏱️ {elapsedMinutes} min</Text>
                </View>
            </View>

            {/* Scoreboard */}
            <View style={styles.scoreboard}>
                {/* Team 1 */}
                <View style={styles.teamSection}>
                    <Text style={styles.teamLabel}>Team 1</Text>
                    <View style={styles.scoreContainer}>
                        <TouchableOpacity
                            style={styles.scoreButton}
                            onPress={() => decrementScore(1)}
                        >
                            <Text style={styles.scoreButtonText}>−</Text>
                        </TouchableOpacity>

                        <Text style={styles.score}>{team1Score}</Text>

                        <TouchableOpacity
                            style={styles.scoreButton}
                            onPress={() => incrementScore(1)}
                        >
                            <Text style={styles.scoreButtonText}>+</Text>
                        </TouchableOpacity>
                    </View>

                    {game?.teams?.team1 && (
                        <View style={styles.players}>
                            {game.teams.team1.map((playerId, i) => (
                                <Text key={playerId} style={styles.playerName}>
                                    Player {i + 1}
                                </Text>
                            ))}
                        </View>
                    )}
                </View>

                {/* VS */}
                <View style={styles.vsContainer}>
                    <Text style={styles.vsText}>VS</Text>
                </View>

                {/* Team 2 */}
                <View style={styles.teamSection}>
                    <Text style={styles.teamLabel}>Team 2</Text>
                    <View style={styles.scoreContainer}>
                        <TouchableOpacity
                            style={styles.scoreButton}
                            onPress={() => decrementScore(2)}
                        >
                            <Text style={styles.scoreButtonText}>−</Text>
                        </TouchableOpacity>

                        <Text style={styles.score}>{team2Score}</Text>

                        <TouchableOpacity
                            style={styles.scoreButton}
                            onPress={() => incrementScore(2)}
                        >
                            <Text style={styles.scoreButtonText}>+</Text>
                        </TouchableOpacity>
                    </View>

                    {game?.teams?.team2 && (
                        <View style={styles.players}>
                            {game.teams.team2.map((playerId, i) => (
                                <Text key={playerId} style={styles.playerName}>
                                    Player {i + 3}
                                </Text>
                            ))}
                        </View>
                    )}
                </View>
            </View>

            {/* Game Info */}
            <View style={styles.gameInfo}>
                <Text style={styles.gameInfoText}>
                    Tap + or − to adjust score
                </Text>
                <Text style={styles.gameInfoSubtext}>
                    Standard game to 11, win by 2
                </Text>
            </View>

            {/* End Game Button */}
            <TouchableOpacity
                style={[styles.endGameButton, gameEnded && styles.endGameButtonDisabled]}
                onPress={handleEndGame}
                disabled={gameEnded}
            >
                <Text style={styles.endGameButtonText}>
                    {gameEnded ? 'Ending Game...' : 'End Game'}
                </Text>
            </TouchableOpacity>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#111827',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
    },
    courtName: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
    timerBadge: {
        backgroundColor: '#374151',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
    },
    timerText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '500',
    },
    scoreboard: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    teamSection: {
        flex: 1,
        alignItems: 'center',
    },
    teamLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: '#9CA3AF',
        marginBottom: 16,
    },
    scoreContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    scoreButton: {
        width: 50,
        height: 50,
        backgroundColor: '#374151',
        borderRadius: 25,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scoreButtonText: {
        fontSize: 28,
        color: '#FFFFFF',
        fontWeight: 'bold',
    },
    score: {
        fontSize: 72,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginHorizontal: 20,
        minWidth: 80,
        textAlign: 'center',
    },
    players: {
        marginTop: 20,
    },
    playerName: {
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
        marginVertical: 2,
    },
    vsContainer: {
        paddingHorizontal: 10,
    },
    vsText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#4B5563',
    },
    gameInfo: {
        alignItems: 'center',
        padding: 20,
    },
    gameInfoText: {
        fontSize: 14,
        color: '#9CA3AF',
    },
    gameInfoSubtext: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 4,
    },
    endGameButton: {
        margin: 20,
        padding: 18,
        backgroundColor: '#10B981',
        borderRadius: 16,
        alignItems: 'center',
    },
    endGameButtonDisabled: {
        backgroundColor: '#374151',
    },
    endGameButtonText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
});
