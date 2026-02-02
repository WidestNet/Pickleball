/**
 * Mock Data for Development
 * 
 * Simulates facility with 14 courts, 3 skill levels, queues
 * Replace with real Firebase when ready
 */

// Configurable facility
export const FACILITY = {
    id: 'st-pete-athletic',
    name: 'St Pete Athletic',
    courtCount: 14,
    skillLevels: [
        { id: 'beginner', label: 'Beginner Open Play', color: '#60A5FA', description: '2.0 - 2.5' },
        { id: 'intermediate', label: 'Intermediate Open Play', color: '#10B981', description: '3.0 - 3.5' },
        { id: 'advanced', label: 'Advanced Open Play', color: '#F59E0B', description: '4.0+' },
    ],
};

// Generate 14 courts with varying status
export const COURTS = Array.from({ length: 14 }, (_, i) => {
    const courtNum = i + 1;
    const isInGame = Math.random() > 0.4; // 60% chance in game
    
    // Assign courts to skill levels
    let skillLevel;
    if (courtNum <= 4) skillLevel = 'beginner';
    else if (courtNum <= 10) skillLevel = 'intermediate';
    else skillLevel = 'advanced';
    
    return {
        id: `court-${courtNum}`,
        name: `Court ${courtNum}`,
        facilityId: FACILITY.id,
        skillLevel,
        status: isInGame ? 'in_game' : 'available',
        currentGameId: isInGame ? `game-${courtNum}-${Date.now()}` : null,
        queueId: `queue-${skillLevel}`, // Shared queue per skill level
    };
});

// Generate mock players
const PLAYER_NAMES = [
    'Mike', 'Sarah', 'Tom', 'Lisa', 'Dave', 'Amy', 'Chris', 'Emma',
    'Jake', 'Olivia', 'Ryan', 'Mia', 'Alex', 'Sophia', 'James', 'Ava',
    'Matt', 'Chloe', 'Dan', 'Lily', 'Ben', 'Grace', 'Nick', 'Zoe'
];

function generatePlayers(count) {
    const shuffled = [...PLAYER_NAMES].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count).map((name, index) => ({
        playerId: `player-${index}-${Date.now()}`,
        name,
        joinedAt: new Date(Date.now() - (count - index) * 180000).toISOString(), // Staggered join times
        position: index + 1,
    }));
}

// Generate queues per skill level
export const QUEUES = {
    'queue-beginner': {
        queueId: 'queue-beginner',
        skillLevel: 'beginner',
        players: generatePlayers(6),
        facilityId: FACILITY.id,
    },
    'queue-intermediate': {
        queueId: 'queue-intermediate',
        skillLevel: 'intermediate',
        players: generatePlayers(12), // Busiest queue
        facilityId: FACILITY.id,
    },
    'queue-advanced': {
        queueId: 'queue-advanced',
        skillLevel: 'advanced',
        players: generatePlayers(4),
        facilityId: FACILITY.id,
    },
};

// Current user (simulated)
export const CURRENT_USER = {
    id: 'user-current',
    name: 'You',
    phone: '+1234567890',
    isAdmin: true, // For demo purposes
};

// Mock wait time predictions
export function calculatePrediction(queueLength, position) {
    const avgGameDuration = 15; // minutes
    const gamesUntilUp = Math.ceil(position / 4);
    const estimatedWaitMinutes = gamesUntilUp * avgGameDuration;
    
    let confidence = 'high';
    if (queueLength < 10) confidence = 'low';
    else if (queueLength < 50) confidence = 'medium';
    
    return {
        estimatedWaitMinutes,
        gamesUntilUp,
        averageGameDuration: avgGameDuration,
        confidence,
    };
}

// Aggregate stats per skill level
export function getLevelStats(skillLevel) {
    const queue = QUEUES[`queue-${skillLevel}`];
    const courts = COURTS.filter(c => c.skillLevel === skillLevel);
    const inGameCourts = courts.filter(c => c.status === 'in_game');
    
    return {
        totalCourts: courts.length,
        activeCourts: inGameCourts.length,
        queueLength: queue?.players?.length || 0,
        estimatedWait: queue?.players?.length > 0
            ? `~${Math.ceil(queue.players.length / 4 * 15)} min`
            : 'Now',
    };
}
