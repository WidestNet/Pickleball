/**
 * St Pete Athletic - Pickleball Queue
 * 
 * Premium paddle & social club queue management
 * Brand: Modern, premium, warm hospitality
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Alert,
  Image,
  ImageBackground,
  SectionList,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

// Firebase
import { signInAnon, onAuthChange, getCurrentUser } from '../firebase';

// Queue Service
import {
  initializeFacility,
  subscribeToQueues,
  joinQueue,
  leaveQueue,
  subscribeToUserQueue,
  subscribeToQueue,
  updateQueueColors,
  getFacility,
} from '../queueService';

// Push Notifications
import {
  registerForPushNotifications,
  scheduleLocalNotification,
  addNotificationReceivedListener,
  addNotificationResponseListener,
  savePushToken,
} from '../notificationService';

// Haptic Feedback
import * as Haptics from 'expo-haptics';

// ========================================
// BRAND COLORS - St Pete Athletic
// ========================================
const COLORS = {
  // Primary - Cream and Forest Green
  background: '#EDE4D3',        // Cream background
  headerBg: '#EDE4D3',          // Cream header
  cardBg: '#FFFFFF',            // White cards on cream
  cardBorder: '#D4C5B0',        // Subtle cream border
  patternBg: '#1B4332',         // Deep forest green for pattern sections

  // Accent - Deep green and warm tones
  primary: '#1B4332',           // Forest green
  primaryDark: '#0F2419',       // Darker green
  accent: '#C9A962',            // Gold accent (from logo)

  // Status colors
  success: '#2D6A4F',           // Medium green for available
  warning: '#D4A574',           // Warm tan for approaching
  danger: '#8B4513',            // Saddle brown for full

  // Text
  textPrimary: '#1B4332',       // Dark green text on cream
  textSecondary: '#52796F',     // Medium green
  textMuted: '#84A98C',         // Light green
  textOnDark: '#EDE4D3',        // Cream text on green

  // Skill levels - Distinct colors for easy identification
  beginner: '#22C55E',          // Bright green 🟢
  intermediate: '#3B82F6',      // Bright blue 🔵
  advanced: '#A855F7',          // Purple 🟣
};

// ========================================
// MOCK DATA
// ========================================
const FACILITY = {
  id: 'st-pete-athletic',
  name: 'St Pete Athletic',
  tagline: 'Paddle & Social',
  courtCount: 14,
};

const SKILL_LEVELS = [
  {
    id: 'beginner',
    label: 'Beginner Open Play',
    description: '2.0 - 2.5',
    color: COLORS.beginner,
    courts: '1-4',
    queueLength: 6,
    activeCourts: 3,
    totalCourts: 4,
  },
  {
    id: 'intermediate',
    label: 'Intermediate Open Play',
    description: '3.0 - 3.5',
    color: COLORS.intermediate,
    courts: '5-10',
    queueLength: 12,
    activeCourts: 5,
    totalCourts: 6,
  },
  {
    id: 'advanced',
    label: 'Advanced Open Play',
    description: '4.0+',
    color: COLORS.advanced,
    courts: '11-14',
    queueLength: 4,
    activeCourts: 4,
    totalCourts: 4,
  },
];

// Mock players for queue
const MOCK_PLAYERS = [
  'Mike', 'Sarah', 'Tom', 'Lisa', 'Dave', 'Amy', 'Chris', 'Emma',
  'Jake', 'Olivia', 'Ryan', 'Mia', 'Alex', 'Sophia', 'James', 'Ava',
];

function generateQueue(count) {
  return MOCK_PLAYERS.slice(0, count).map((name, i) => ({
    id: `player-${i}`,
    name,
    position: i + 1,
  }));
}

// ========================================
// MAIN APP
// ========================================
export default function App() {
  // Auth state
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // App state
  const [screen, setScreen] = useState('home');
  const [selectedLevel, setSelectedLevel] = useState(null);
  const [userQueue, setUserQueue] = useState({
    inQueue: false,
    level: null,
    position: null,
    queueId: null,
  });
  const [queuePlayers, setQueuePlayers] = useState([]);
  const [skillLevels, setSkillLevels] = useState(SKILL_LEVELS);
  const [facility, setFacility] = useState({ courts: [], courtCount: 14 }); // Synced from admin
  const [lastNotifiedPosition, setLastNotifiedPosition] = useState(null);

  // Join Queue Modal state
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [pendingLevel, setPendingLevel] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [playerPhone, setPlayerPhone] = useState('');

  // "You're Up!" Full-screen Modal state
  const [showYourTurnModal, setShowYourTurnModal] = useState(false);

  // Admin state
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [logoTapCount, setLogoTapCount] = useState(0);
  const [lastTapTime, setLastTapTime] = useState(0);

  // Handle logo tap for admin access (tap 5 times within 3 seconds)
  const handleLogoTap = () => {
    const now = Date.now();
    if (now - lastTapTime > 3000) {
      // Reset if more than 3 seconds since last tap
      setLogoTapCount(1);
    } else {
      setLogoTapCount(prev => prev + 1);
    }
    setLastTapTime(now);

    if (logoTapCount >= 4) {
      // 5th tap - toggle admin mode
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsAdminMode(!isAdminMode);
      setLogoTapCount(0);
      if (!isAdminMode) {
        Alert.alert('🔐 Admin Mode', 'Admin features enabled');
        setScreen('admin');
      } else {
        Alert.alert('Admin Mode', 'Returning to player mode');
        setScreen('home');
      }
    } else if (logoTapCount >= 2) {
      // Give subtle haptic feedback after 3rd tap
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  // Initialize auth and push notifications on app start
  useEffect(() => {
    const unsubscribe = onAuthChange(async (authUser) => {
      if (authUser) {
        console.log('User authenticated:', authUser.uid);
        setUser(authUser);

        // Initialize facility data if needed
        await initializeFacility();

        // Update queue colors to new distinct scheme (one-time migration)
        try {
          await updateQueueColors();
        } catch (e) {
          console.log('Queue colors already up to date or error:', e.message);
        }

        // Get facility data for court count
        const facilityData = await getFacility();
        if (facilityData) {
          console.log('Facility loaded:', facilityData.name, facilityData.courtCount, 'courts');
        }

        // Register for push notifications
        const pushToken = await registerForPushNotifications(authUser.uid);
        if (pushToken) {
          console.log('Push notifications registered');
        }
      } else {
        // No user - sign in anonymously
        try {
          const newUser = await signInAnon();
          setUser(newUser);
        } catch (error) {
          console.error('Auth error:', error);
          Alert.alert('Connection Error', 'Could not connect to server. Please try again.');
        }
      }
      setIsLoading(false);
    });

    // Set up notification listeners
    const notificationListener = addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
    });

    const responseListener = addNotificationResponseListener(response => {
      console.log('Notification tapped:', response);
      // Navigate to queue screen when notification tapped
      if (userQueue.inQueue) {
        setScreen('queue');
      }
    });

    return () => {
      unsubscribe();
      notificationListener.remove();
      responseListener.remove();
    };
  }, []);

  // Subscribe to queues when user is authenticated
  useEffect(() => {
    if (!user) return;

    const unsubscribe = subscribeToQueues((queues) => {
      // Add computed queueLength from players array
      const enrichedQueues = queues.map(q => ({
        ...q,
        queueLength: q.players?.length || 0,
      }));
      setSkillLevels(enrichedQueues);

      // Check if user is in any queue
      let userFoundInQueue = false;
      for (const queue of queues) {
        const players = queue.players || [];
        const userPlayer = players.find(p => p.uid === user.uid);
        if (userPlayer) {
          userFoundInQueue = true;
          const newPosition = userPlayer.position;

          // Trigger notification if position improved to <= 2
          if (newPosition <= 2 && lastNotifiedPosition !== newPosition) {
            const message = newPosition === 1
              ? "🏓 IT'S YOUR TURN! Head to your assigned court now!"
              : "⚡ You're #2 - Get ready, you're almost up!";

            scheduleLocalNotification(
              newPosition === 1 ? "You're Up!" : "Almost Your Turn",
              message,
              1
            );
            setLastNotifiedPosition(newPosition);

            // Show full-screen modal when it's your turn
            if (newPosition === 1) {
              setShowYourTurnModal(true);
            }
          }

          setUserQueue({
            inQueue: true,
            level: queue,
            position: newPosition,
            queueId: queue.id,
          });
          setQueuePlayers(players);
          break;
        }
      }

      // Clear queue state if user not found in any queue
      if (!userFoundInQueue && userQueue.inQueue) {
        setUserQueue({ inQueue: false, level: null, position: null, queueId: null });
        setQueuePlayers([]);
        setLastNotifiedPosition(null);
      }
    });

    return () => unsubscribe();
  }, [user]);

  // Subscribe to facility data for real-time court count
  useEffect(() => {
    if (!user) return;

    const setupFacilitySubscription = async () => {
      try {
        const { doc, onSnapshot } = await import('firebase/firestore');
        const facilityRef = doc(db, 'facilities', 'st-pete-athletic');

        return onSnapshot(facilityRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            const courts = data.courts || [];
            const activeCourts = courts.filter(c => c.active !== false);
            setFacility({
              ...data,
              courts: courts,
              courtCount: activeCourts.length,
            });
            console.log('Facility updated:', activeCourts.length, 'active courts');
          }
        });
      } catch (error) {
        console.log('Facility subscription error:', error);
      }
    };

    let unsubscribe = null;
    setupFacilitySubscription().then(unsub => { unsubscribe = unsub; });

    return () => { if (unsubscribe) unsubscribe(); };
  }, [user]);

  // Open join queue modal
  function openJoinModal(level) {
    if (!user) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPendingLevel(level);
    setPlayerName(user.displayName || '');
    setPlayerPhone('');
    setShowJoinModal(true);
  }

  // Actually join the queue after name entry
  async function confirmJoinQueue() {
    if (!user || !pendingLevel) return;

    const trimmedName = playerName.trim();
    if (!trimmedName) {
      Alert.alert('Name Required', 'Please enter your name to join the queue.');
      return;
    }

    try {
      // Close modal first for snappy feel
      setShowJoinModal(false);

      const userWithName = {
        ...user,
        displayName: trimmedName,
        phone: playerPhone.trim() || null,
      };

      const result = await joinQueue(pendingLevel.id, userWithName);
      console.log('Joined queue:', result);

      setUserQueue({
        inQueue: true,
        level: pendingLevel,
        position: result.position,
        queueId: pendingLevel.id,
      });

      // Success haptic
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setScreen('queue');
    } catch (error) {
      console.error('Join queue error:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', error.message || 'Could not join queue. Please try again.');
    }
  }

  // Cancel join modal
  function cancelJoinModal() {
    setShowJoinModal(false);
    setPendingLevel(null);
    setPlayerName('');
    setPlayerPhone('');
  }

  // Handle leave queue
  function handleLeaveQueue() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      'Leave Queue?',
      'You will lose your spot in line.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveQueue(userQueue.queueId, user.uid);
              setUserQueue({ inQueue: false, level: null, position: null, queueId: null });
              setQueuePlayers([]);
              setLastNotifiedPosition(null);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              setScreen('home');
            } catch (error) {
              console.error('Leave queue error:', error);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Error', 'Could not leave queue. Please try again.');
            }
          }
        }
      ]
    );
  }

  // Pull to refresh
  async function onRefresh() {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }

  // ========================================
  // JOIN QUEUE MODAL
  // ========================================
  function JoinQueueModal() {
    if (!showJoinModal || !pendingLevel) return null;

    return (
      <Modal
        visible={showJoinModal}
        transparent={true}
        animationType="slide"
        onRequestClose={cancelJoinModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => Keyboard.dismiss()}
          />
          <View style={styles.joinModalContainer}>
            <View style={[styles.joinModalHeader, { backgroundColor: pendingLevel.color }]}>
              <Text style={styles.joinModalTitle}>Join {pendingLevel.label}</Text>
              <Text style={styles.joinModalSubtitle}>Courts {pendingLevel.courts} • DUPR {pendingLevel.description}</Text>
            </View>

            <View style={styles.joinModalBody}>
              <TextInput
                style={styles.textInput}
                placeholder="Your Name *"
                placeholderTextColor={COLORS.textMuted}
                value={playerName}
                onChangeText={setPlayerName}
                autoCapitalize="words"
                autoFocus={true}
                returnKeyType="next"
              />

              <TextInput
                style={[styles.textInput, { marginTop: 12 }]}
                placeholder="Phone (optional - for SMS alerts)"
                placeholderTextColor={COLORS.textMuted}
                value={playerPhone}
                onChangeText={setPlayerPhone}
                keyboardType="phone-pad"
                returnKeyType="done"
              />

              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={cancelJoinModal}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalJoinBtn, { backgroundColor: pendingLevel.color }]}
                  onPress={confirmJoinQueue}
                >
                  <Text style={styles.modalJoinText}>Join Queue →</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  }

  // ========================================
  // "YOU'RE UP!" FULL-SCREEN MODAL
  // ========================================
  function YourTurnModal() {
    const scaleAnim = useRef(new Animated.Value(0.8)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const rollAnim = useRef(new Animated.Value(-150)).current; // Start off-screen left
    const rotateAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      if (showYourTurnModal) {
        // Entrance animation
        Animated.parallel([
          Animated.spring(scaleAnim, {
            toValue: 1,
            tension: 50,
            friction: 7,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start();

        // Pulse animation
        Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1.1,
              duration: 500,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 500,
              useNativeDriver: true,
            }),
          ])
        ).start();

        // Rolling pickleball animation
        Animated.loop(
          Animated.parallel([
            // Roll across
            Animated.sequence([
              Animated.timing(rollAnim, {
                toValue: 150,
                duration: 3000,
                useNativeDriver: true,
              }),
              Animated.timing(rollAnim, {
                toValue: -150,
                duration: 0,
                useNativeDriver: true,
              }),
            ]),
            // Rotate while rolling
            Animated.sequence([
              Animated.timing(rotateAnim, {
                toValue: 4,
                duration: 3000,
                useNativeDriver: true,
              }),
              Animated.timing(rotateAnim, {
                toValue: 0,
                duration: 0,
                useNativeDriver: true,
              }),
            ]),
          ])
        ).start();

        // Vibration pattern
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }, [showYourTurnModal]);

    if (!showYourTurnModal) return null;

    const courtRange = userQueue.level?.courts || '1-4';
    const firstCourt = parseInt(courtRange.split('-')[0]) || 1;

    const handleImHere = () => {
      setShowYourTurnModal(false);
      handleLeaveQueue();
    };

    const handleNeedTime = () => {
      setShowYourTurnModal(false);
      Alert.alert('No Problem!', 'Take your time. You\'re still #1 in line.');
    };

    return (
      <Modal
        visible={showYourTurnModal}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.yourTurnOverlay}>
          <Animated.View
            style={[
              styles.yourTurnContainer,
              {
                transform: [{ scale: scaleAnim }],
                opacity: opacityAnim,
              }
            ]}
          >
            <Image
              source={require('../assets/spa-logo.png')}
              style={styles.yourTurnLogoLarge}
              resizeMode="contain"
            />

            <Text style={styles.yourTurnTitleLarge}>🎉 IT'S YOUR TURN!</Text>

            <Animated.View style={[styles.courtBadgeLarge, { transform: [{ scale: pulseAnim }] }]}>
              <Text style={styles.courtBadgeLabel}>GO TO</Text>
              <Text style={styles.courtBadgeNumber}>COURT {firstCourt}</Text>
            </Animated.View>

            <Text style={styles.yourTurnLevelText}>{userQueue.level?.label}</Text>

            <View style={styles.yourTurnButtons}>
              <TouchableOpacity style={styles.imHereBtnLarge} onPress={handleImHere}>
                <Text style={styles.imHereBtnLargeText}>✓ I'M HERE</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.needTimeBtnLarge} onPress={handleNeedTime}>
                <Text style={styles.needTimeBtnLargeText}>Need More Time</Text>
              </TouchableOpacity>
            </View>

            {/* Rolling Pickleball Animation */}
            <Animated.View
              style={[
                styles.rollingPickleball,
                {
                  transform: [
                    { translateX: rollAnim },
                    {
                      rotate: rotateAnim.interpolate({
                        inputRange: [0, 4],
                        outputRange: ['0deg', '1440deg'],
                      })
                    },
                  ],
                }
              ]}
            >
              <View style={styles.pickleballInner}>
                <View style={styles.pickleballHole} />
                <View style={[styles.pickleballHole, { top: 6, left: 12 }]} />
                <View style={[styles.pickleballHole, { top: 16, left: 4 }]} />
                <View style={[styles.pickleballHole, { top: 16, left: 18 }]} />
                <View style={[styles.pickleballHole, { top: 6, left: 4 }]} />
              </View>
            </Animated.View>
          </Animated.View>
        </View>
      </Modal>
    );
  }

  // ========================================
  // HOME SCREEN
  // ========================================
  function HomeScreen() {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

        {/* Global In-Queue Banner (Floating) */}
        {userQueue.inQueue && (
          <View style={styles.floatingBannerContainer}>
            <TouchableOpacity
              style={styles.inQueueBanner}
              onPress={() => setScreen('queue')}
            >
              <View>
                <Text style={styles.inQueueText}>
                  You're #{userQueue.position} in {userQueue.level?.label}
                </Text>
                <Text style={styles.inQueueSubtext}>Tap to view your spot</Text>
              </View>
              <Text style={styles.inQueueArrow}>→</Text>
            </TouchableOpacity>
          </View>
        )}

        <ImageBackground
          source={require('../assets/pattern-bg.png')}
          style={styles.patternSection}
          imageStyle={styles.patternImage}
        >
          <SectionList
            sections={[{ title: 'Open Play Queues', data: skillLevels }]}
            keyExtractor={(item) => item.id}
            stickySectionHeadersEnabled={true}
            contentContainerStyle={{ paddingBottom: 100 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={COLORS.primary}
                colors={[COLORS.primary]}
              />
            }

            // Header: Logo & Facility Info (Scrolls away)
            ListHeaderComponent={
              <View style={styles.header}>
                <TouchableOpacity onPress={handleLogoTap} activeOpacity={0.8}>
                  <Image
                    source={require('../assets/logo-spoonbill.png')}
                    style={styles.logoImage}
                    resizeMode="contain"
                  />
                </TouchableOpacity>
                <View style={styles.taglineContainer}>
                  <View style={styles.taglineLine} />
                  <Text style={styles.tagline}>PADDLE & SOCIAL</Text>
                  <View style={styles.taglineLine} />
                </View>
                {/* Admin access: tap logo 5 times within 3 seconds */}
              </View>
            }

            // Sticky Section Header
            renderSectionHeader={({ section: { title } }) => (
              <View style={styles.stickyHeader}>
                <Text style={styles.sectionTitle}>{title}</Text>
                <Text style={styles.sectionSubtitle}>{facility.courtCount} Courts Available</Text>
              </View>
            )}

            // Items: Simplified Cards
            renderItem={({ item: level }) => {
              const waitMinutes = level.queueLength > 0
                ? Math.ceil(level.queueLength / 4 * 15)
                : 0;
              const waitDisplay = waitMinutes > 0 ? `~${waitMinutes}m wait` : 'No Wait';

              return (
                <TouchableOpacity
                  style={styles.simpleCard}
                  onPress={() => setSelectedLevel(selectedLevel?.id === level.id ? null : level)}
                  activeOpacity={0.7}
                >
                  {/* Left: Info */}
                  <View style={styles.cardLeft}>
                    <Text style={styles.levelNameSimple}>{level.label}</Text>
                    <View style={styles.cardMetaRow}>
                      <Text style={styles.cardMetaText}>Courts {level.courts}</Text>
                      <Text style={styles.cardMetaDot}>•</Text>
                      <Text style={[
                        styles.cardMetaText,
                        waitMinutes === 0 && { color: COLORS.success, fontWeight: '600' },
                        waitMinutes > 30 && { color: COLORS.danger }
                      ]}>
                        {waitDisplay}
                      </Text>
                    </View>
                    {/* Badge below title */}
                    <View style={[styles.miniBadge, { backgroundColor: level.color, marginTop: 6 }]}>
                      <Text style={styles.miniBadgeText}>{level.description}</Text>
                    </View>
                  </View>

                  {/* Right: Action/Status */}
                  <View style={styles.cardRight}>
                    {userQueue.inQueue && userQueue.queueId === level.id ? (
                      <View style={[styles.inQueueBadge, { backgroundColor: level.color }]}>
                        <Text style={styles.inQueueBadgeText}>#{userQueue.position}</Text>
                      </View>
                    ) : !userQueue.inQueue ? (
                      <TouchableOpacity
                        style={[styles.joinButton, { backgroundColor: level.color }]}
                        onPress={() => openJoinModal(level)}
                      >
                        <Text style={styles.joinButtonText}>Join →</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </ImageBackground>
      </SafeAreaView>
    );
  }

  // ========================================
  // QUEUE SCREEN - Redesigned
  // ========================================
  function QueueScreen() {
    const estimatedWait = userQueue.position ? Math.max(0, (userQueue.position - 1) * 15) : 0;
    const isYourTurn = userQueue.position === 1;
    const isNextUp = userQueue.position <= 4;

    // Get court info from level
    const courtRange = userQueue.level?.courts || '1-4';
    const firstCourt = parseInt(courtRange.split('-')[0]) || 1;

    // Mock "now playing" - first 4 players or positions 0 to -3 (already on court)
    // In a real app, this would come from a separate "activePlayers" collection
    const nowPlaying = [
      { name: 'Mike S.', position: 'A' },
      { name: 'Sarah T.', position: 'B' },
      { name: 'Josh R.', position: 'C' },
      { name: 'Lisa M.', position: 'D' },
    ];

    // Format name as "First L."
    const formatName = (fullName) => {
      if (!fullName) return 'Player';
      const parts = fullName.trim().split(' ');
      if (parts.length === 1) return parts[0];
      const firstName = parts[0];
      const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
      return `${firstName} ${lastInitial}.`;
    };

    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

        {/* Header Bar */}
        <View style={styles.queueHeaderBar}>
          <TouchableOpacity onPress={() => setScreen('home')} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.queueHeaderTitle}>{userQueue.level?.label}</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView
          style={styles.queueScrollView}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
          }
        >
          {/* Your Turn Banner - Compact */}
          {isYourTurn && (
            <View style={styles.yourTurnBanner}>
              <View style={styles.yourTurnRow}>
                <Image
                  source={require('../assets/spa-logo.png')}
                  style={styles.yourTurnLogo}
                  resizeMode="contain"
                />
                <View style={styles.yourTurnContent}>
                  <Text style={styles.yourTurnTitle}>IT'S YOUR TURN!</Text>
                  <Text style={styles.yourTurnCourt}>Go to Court {firstCourt}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.imHereBtn}
                onPress={() => {
                  Alert.alert('Checked In!', 'Have a great game! 🏓', [
                    { text: 'OK', onPress: handleLeaveQueue }
                  ]);
                }}
              >
                <Text style={styles.imHereBtnText}>✓ I'M HERE</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Court & Time Info Card */}
          {!isYourTurn && (
            <View style={styles.courtTimeCard}>
              <View style={styles.courtInfo}>
                <Text style={styles.courtLabel}>COURTS</Text>
                <Text style={styles.courtValue}>{courtRange}</Text>
              </View>
              <View style={styles.dividerVertical} />
              <View style={styles.waitInfo}>
                <Text style={styles.waitLabel}>EST. WAIT</Text>
                <Text style={styles.waitValue}>{estimatedWait} <Text style={styles.waitUnit}>min</Text></Text>
              </View>
              <View style={styles.dividerVertical} />
              <View style={styles.positionInfo}>
                <Text style={styles.positionLabelSmall}>YOUR SPOT</Text>
                <Text style={styles.positionValueSmall}>#{userQueue.position}</Text>
              </View>
            </View>
          )}

          {/* Now Playing Section */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>🏓 Now Playing</Text>
              <Text style={styles.sectionSubtitle}>Court {firstCourt}</Text>
            </View>
            <View style={styles.nowPlayingGrid}>
              {nowPlaying.map((player, index) => (
                <View key={index} style={styles.nowPlayingItem}>
                  <View style={styles.playerAvatar}>
                    <Text style={styles.playerAvatarText}>{player.name.charAt(0)}</Text>
                  </View>
                  <Text style={styles.nowPlayingName}>{player.name}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Up Next Queue */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>⏳ Up Next</Text>
              <Text style={styles.sectionSubtitle}>{queuePlayers.length} waiting</Text>
            </View>

            {queuePlayers.length === 0 ? (
              <Text style={styles.emptyQueueText}>No one in queue yet</Text>
            ) : (
              <View style={styles.queueListClean}>
                {queuePlayers.map((player, index) => {
                  const isMe = player.uid === user?.uid;
                  const isNextGroup = player.position <= 4;

                  return (
                    <View
                      key={player.uid}
                      style={[
                        styles.queueItemClean,
                        isMe && styles.queueItemMe,
                        isNextGroup && styles.queueItemNext,
                      ]}
                    >
                      <Text style={[styles.queuePosClean, isMe && styles.queuePosMe]}>
                        {player.position}
                      </Text>
                      <Text style={[styles.queueNameClean, isMe && styles.queueNameMe]}>
                        {formatName(player.name)}
                        {isMe && ' (You)'}
                      </Text>
                      {isNextGroup && (
                        <View style={styles.nextBadge}>
                          <Text style={styles.nextBadgeText}>NEXT</Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* Leave Queue Button */}
          <TouchableOpacity style={styles.leaveQueueBtn} onPress={handleLeaveQueue}>
            <Text style={styles.leaveQueueBtnText}>Leave Queue</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ========================================
  // ADMIN SCREEN
  // ========================================
  function AdminScreen() {
    const [activeTab, setActiveTab] = useState('courts'); // 'courts' or 'analytics'
    const [courts, setCourts] = useState([]);
    const [isLoadingCourts, setIsLoadingCourts] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const FACILITY_ID = 'st-pete-athletic'; // Match player UI facility ID

    // Load courts from Firestore on mount
    useEffect(() => {
      loadCourtsFromFirestore();
    }, []);

    const loadCourtsFromFirestore = async () => {
      try {
        const { getFirestore, doc, getDoc } = await import('firebase/firestore');
        const { app } = await import('../firebase');
        const db = getFirestore(app);

        const facilityRef = doc(db, 'facilities', FACILITY_ID);
        const facilityDoc = await getDoc(facilityRef);

        if (facilityDoc.exists() && facilityDoc.data().courts) {
          setCourts(facilityDoc.data().courts);
        } else {
          // Initialize with default courts
          const defaultCourts = [
            { id: 1, name: 'Court 1', level: 'beginner', active: true },
            { id: 2, name: 'Court 2', level: 'beginner', active: true },
            { id: 3, name: 'Court 3', level: 'beginner', active: true },
            { id: 4, name: 'Court 4', level: 'beginner', active: true },
            { id: 5, name: 'Court 5', level: 'intermediate', active: true },
            { id: 6, name: 'Court 6', level: 'intermediate', active: true },
            { id: 7, name: 'Court 7', level: 'intermediate', active: true },
            { id: 8, name: 'Court 8', level: 'intermediate', active: true },
            { id: 9, name: 'Court 9', level: 'advanced', active: true },
            { id: 10, name: 'Court 10', level: 'advanced', active: true },
            { id: 11, name: 'Court 11', level: 'advanced', active: true },
            { id: 12, name: 'Court 12', level: 'advanced', active: true },
            { id: 13, name: 'Court 13', level: 'advanced', active: true },
            { id: 14, name: 'Court 14', level: 'advanced', active: true },
          ];
          setCourts(defaultCourts);
          saveCourtsToFirestore(defaultCourts);
        }
      } catch (error) {
        console.log('Error loading courts:', error);
        // Fallback to default
        setCourts([
          { id: 1, name: 'Court 1', level: 'beginner', active: true },
          { id: 2, name: 'Court 2', level: 'beginner', active: true },
          { id: 3, name: 'Court 3', level: 'intermediate', active: true },
          { id: 4, name: 'Court 4', level: 'advanced', active: true },
        ]);
      } finally {
        setIsLoadingCourts(false);
      }
    };

    const saveCourtsToFirestore = async (courtsToSave) => {
      try {
        setIsSaving(true);
        const { getFirestore, doc, setDoc } = await import('firebase/firestore');
        const { app } = await import('../firebase');
        const db = getFirestore(app);

        const facilityRef = doc(db, 'facilities', FACILITY_ID);
        await setDoc(facilityRef, {
          courts: courtsToSave,
          updatedAt: new Date().toISOString(),
        }, { merge: true });

        console.log('Courts saved to Firestore');
      } catch (error) {
        console.log('Error saving courts:', error);
        Alert.alert('Save Error', 'Could not save to cloud. Changes saved locally.');
      } finally {
        setIsSaving(false);
      }
    };

    const toggleCourt = (courtId) => {
      const updated = courts.map(c =>
        c.id === courtId ? { ...c, active: !c.active } : c
      );
      setCourts(updated);
      saveCourtsToFirestore(updated);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const addCourt = () => {
      const newId = courts.length > 0 ? Math.max(...courts.map(c => c.id)) + 1 : 1;
      const updated = [...courts, {
        id: newId,
        name: `Court ${newId}`,
        level: 'beginner',
        active: true
      }];
      setCourts(updated);
      saveCourtsToFirestore(updated);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };

    const removeCourt = (courtId) => {
      Alert.alert(
        'Remove Court',
        `Are you sure you want to remove Court ${courtId}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              const updated = courts.filter(c => c.id !== courtId);
              setCourts(updated);
              saveCourtsToFirestore(updated);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            }
          }
        ]
      );
    };

    const changeCourtLevel = (courtId) => {
      const court = courts.find(c => c.id === courtId);
      if (!court) return;

      const levels = [
        { key: 'beginner', label: '🟢 Beginner (DUPR 2.0-3.0)' },
        { key: 'intermediate', label: '🔵 Intermediate (DUPR 3.0-4.0)' },
        { key: 'advanced', label: '🟣 Advanced (DUPR 4.0+)' },
      ];

      Alert.alert(
        `Court ${courtId} - Change Level`,
        `Current: ${court.level.charAt(0).toUpperCase() + court.level.slice(1)}`,
        [
          ...levels.map(level => ({
            text: level.label,
            onPress: () => {
              const updated = courts.map(c =>
                c.id === courtId ? { ...c, level: level.key } : c
              );
              setCourts(updated);
              saveCourtsToFirestore(updated);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }
          })),
          { text: 'Cancel', style: 'cancel' }
        ]
      );
    };

    const getLevelColor = (level) => {
      switch (level) {
        case 'beginner': return COLORS.beginner;
        case 'intermediate': return COLORS.intermediate;
        case 'advanced': return COLORS.advanced;
        default: return COLORS.primary;
      }
    };

    // Bird's Eye View Court Component
    const CourtTile = ({ court }) => {
      const levelColor = getLevelColor(court.level);
      const isActive = court.active;
      const lastTapRef = React.useRef(0);
      const tapTimeoutRef = React.useRef(null);

      const handlePress = () => {
        const now = Date.now();
        const DOUBLE_TAP_DELAY = 300;

        if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
          // Double tap detected - cancel pending single tap and change level
          if (tapTimeoutRef.current) {
            clearTimeout(tapTimeoutRef.current);
            tapTimeoutRef.current = null;
          }
          changeCourtLevel(court.id);
        } else {
          // Possible single tap - wait to see if it becomes a double tap
          tapTimeoutRef.current = setTimeout(() => {
            toggleCourt(court.id);
          }, DOUBLE_TAP_DELAY);
        }
        lastTapRef.current = now;
      };

      return (
        <TouchableOpacity
          style={[
            styles.birdEyeCourt,
            !isActive && styles.birdEyeCourtInactive
          ]}
          onPress={handlePress}
          onLongPress={() => removeCourt(court.id)}
          delayLongPress={600}
        >
          {/* Court Surface */}
          <View style={[
            styles.courtSurface,
            { backgroundColor: isActive ? levelColor + '30' : '#e0e0e0' }
          ]}>
            {/* Left Kitchen */}
            <View style={[
              styles.kitchenZone,
              styles.kitchenLeft,
              { borderColor: isActive ? levelColor : '#bbb' }
            ]} />

            {/* Right Kitchen */}
            <View style={[
              styles.kitchenZone,
              styles.kitchenRight,
              { borderColor: isActive ? levelColor : '#bbb' }
            ]} />

            {/* Net */}
            <View style={[
              styles.courtNet,
              { backgroundColor: isActive ? levelColor : '#999' }
            ]} />

            {/* Center Line */}
            <View style={[
              styles.centerLine,
              { backgroundColor: isActive ? levelColor + '60' : '#ccc' }
            ]} />

            {/* Court Number Badge */}
            <View style={[
              styles.courtNumberBadge,
              { backgroundColor: isActive ? levelColor : '#999' }
            ]}>
              <Text style={styles.courtNumberText}>{court.id}</Text>
            </View>

            {/* Status Indicator */}
            <View style={[
              styles.courtStatusDot,
              { backgroundColor: isActive ? COLORS.success : COLORS.danger }
            ]} />

            {/* Level Label */}
            <Text style={[
              styles.courtLevelLabel,
              { color: isActive ? levelColor : '#999' }
            ]}>
              {court.level.charAt(0).toUpperCase()}
            </Text>
          </View>

          {/* Tap hints */}
          <Text style={styles.courtHoldHint}>2x tap = level</Text>
        </TouchableOpacity>
      );
    };

    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

        {/* Header */}
        <View style={styles.adminHeader}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              setScreen('home');
            }}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <View>
            <Text style={styles.adminTitle}>Admin Dashboard</Text>
            <Text style={styles.adminSubtitle}>St Pete Athletic</Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              setIsAdminMode(false);
              setScreen('home');
            }}
          >
            <Text style={styles.exitAdminText}>Exit</Text>
          </TouchableOpacity>
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'courts' && styles.tabActive]}
            onPress={() => setActiveTab('courts')}
          >
            <Text style={[styles.tabText, activeTab === 'courts' && styles.tabTextActive]}>
              Courts Setup
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'analytics' && styles.tabActive]}
            onPress={() => setActiveTab('analytics')}
          >
            <Text style={[styles.tabText, activeTab === 'analytics' && styles.tabTextActive]}>
              Analytics
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.adminContent}>
          {activeTab === 'courts' ? (
            <>
              {/* Skill Levels Summary */}
              <View style={styles.adminCard}>
                <Text style={styles.adminCardTitle}>Skill Levels</Text>
                <Text style={styles.adminCardSubtitle}>Tap = toggle · Double tap = change level · Hold = remove</Text>
                {SKILL_LEVELS.map(level => (
                  <View key={level.id} style={styles.levelRow}>
                    <View style={[styles.levelDot, { backgroundColor: level.color }]} />
                    <View style={styles.levelInfo}>
                      <Text style={styles.levelLabel}>{level.label}</Text>
                      <Text style={styles.levelDesc}>DUPR {level.description}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Courts Grid - Bird's Eye View */}
              <View style={styles.adminCard}>
                <View style={styles.courtHeaderRow}>
                  <View>
                    <Text style={styles.adminCardTitle}>
                      Court Status {isSaving && <Text style={styles.savingText}>• Saving...</Text>}
                    </Text>
                    <Text style={styles.adminCardSubtitle}>
                      {courts.filter(c => c.active).length} of {courts.length} courts active · Synced to ☁️
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.addCourtBtn}
                    onPress={addCourt}
                  >
                    <Text style={styles.addCourtBtnText}>+ Add Court</Text>
                  </TouchableOpacity>
                </View>

                {isLoadingCourts ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                    <Text style={styles.loadingText}>Loading courts...</Text>
                  </View>
                ) : (
                  <View style={styles.courtsGridBirdEye}>
                    {courts.map(court => (
                      <CourtTile key={court.id} court={court} />
                    ))}
                  </View>
                )}

                <View style={styles.courtLegend}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: COLORS.success }]} />
                    <Text style={styles.legendText}>Active</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: COLORS.danger }]} />
                    <Text style={styles.legendText}>Inactive</Text>
                  </View>
                </View>
              </View>

              {/* Quick Actions */}
              <View style={styles.adminCard}>
                <Text style={styles.adminCardTitle}>Quick Actions</Text>
                <TouchableOpacity style={styles.adminAction}>
                  <Text style={styles.adminActionText}>📢 Send Announcement</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.adminAction}>
                  <Text style={styles.adminActionText}>🔄 Reset All Queues</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.adminAction}>
                  <Text style={styles.adminActionText}>⚙️ Facility Settings</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              {/* Analytics Summary */}
              <View style={styles.adminCard}>
                <Text style={styles.adminCardTitle}>Today's Stats</Text>
                <View style={styles.statsRow}>
                  <View style={styles.statBox}>
                    <Text style={styles.statNumber}>127</Text>
                    <Text style={styles.statLabel}>Check-ins</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statNumber}>42</Text>
                    <Text style={styles.statLabel}>Games</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statNumber}>14m</Text>
                    <Text style={styles.statLabel}>Avg Wait</Text>
                  </View>
                </View>
              </View>

              {/* Peak Hours */}
              <View style={styles.adminCard}>
                <Text style={styles.adminCardTitle}>Peak Hours</Text>
                <View style={styles.peakHoursRow}>
                  {['9a', '10a', '11a', '12p', '1p', '2p', '3p', '4p', '5p'].map((hour, i) => (
                    <View key={hour} style={styles.peakHourBar}>
                      <View style={[
                        styles.peakBar,
                        { height: [30, 50, 80, 60, 40, 55, 75, 90, 70][i] }
                      ]} />
                      <Text style={styles.peakHourLabel}>{hour}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Avg Game Duration */}
              <View style={styles.adminCard}>
                <Text style={styles.adminCardTitle}>Avg Game Duration</Text>
                <View style={styles.statsRow}>
                  <View style={styles.statBox}>
                    <Text style={styles.statNumber}>12m</Text>
                    <Text style={styles.statLabel}>Beginner</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statNumber}>15m</Text>
                    <Text style={styles.statLabel}>Intermediate</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statNumber}>18m</Text>
                    <Text style={styles.statLabel}>Advanced</Text>
                  </View>
                </View>
              </View>
            </>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ========================================
  // LOADING SCREEN
  // ========================================
  function LoadingScreen() {
    return (
      <SafeAreaView style={[styles.container, styles.loadingContainer]}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
        <Image
          source={require('../assets/logo-spoonbill.png')}
          style={styles.loadingLogo}
          resizeMode="contain"
        />
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 24 }} />
        <Text style={styles.loadingText}>Connecting...</Text>
      </SafeAreaView>
    );
  }

  // Render
  if (isLoading) {
    return <LoadingScreen />;
  }

  // Main content with modals
  const mainContent = () => {
    if (screen === 'admin' && isAdminMode) {
      return <AdminScreen />;
    }
    if (screen === 'queue' && userQueue.inQueue) {
      return <QueueScreen />;
    }
    return <HomeScreen />;
  };

  return (
    <>
      {mainContent()}

      {/* Join Queue Modal - inline to prevent re-render issues */}
      {showJoinModal && pendingLevel && (
        <Modal
          visible={showJoinModal}
          transparent={true}
          animationType="slide"
          onRequestClose={cancelJoinModal}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalOverlay}
          >
            <TouchableOpacity
              style={styles.modalBackdrop}
              activeOpacity={1}
              onPress={() => Keyboard.dismiss()}
            />
            <View style={styles.joinModalContainer}>
              <View style={[styles.joinModalHeader, { backgroundColor: pendingLevel.color }]}>
                <Text style={styles.joinModalTitle}>Join {pendingLevel.label}</Text>
                <Text style={styles.joinModalSubtitle}>Courts {pendingLevel.courts} • DUPR {pendingLevel.description}</Text>
              </View>

              <View style={styles.joinModalBody}>
                <TextInput
                  style={styles.textInput}
                  placeholder="Your Name *"
                  placeholderTextColor={COLORS.textMuted}
                  value={playerName}
                  onChangeText={setPlayerName}
                  autoCapitalize="words"
                  autoFocus={true}
                  returnKeyType="next"
                />

                <TextInput
                  style={[styles.textInput, { marginTop: 12 }]}
                  placeholder="Phone (optional - for SMS alerts)"
                  placeholderTextColor={COLORS.textMuted}
                  value={playerPhone}
                  onChangeText={setPlayerPhone}
                  keyboardType="phone-pad"
                  returnKeyType="done"
                />

                <View style={styles.modalButtons}>
                  <TouchableOpacity style={styles.modalCancelBtn} onPress={cancelJoinModal}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalJoinBtn, { backgroundColor: pendingLevel.color }]}
                    onPress={confirmJoinQueue}
                  >
                    <Text style={styles.modalJoinText}>Join Queue →</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}

      <YourTurnModal />
    </>
  );
}

// ========================================
// STYLES
// ========================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // Loading Screen
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingLogo: {
    width: 120,
    height: 120,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: COLORS.textSecondary,
    letterSpacing: 2,
  },

  // Header
  header: {
    alignItems: 'center',
    paddingVertical: 32,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  logoText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    letterSpacing: 4,
    fontWeight: '300',
  },
  logoTextBold: {
    fontSize: 32,
    color: COLORS.textPrimary,
    letterSpacing: 8,
    fontWeight: '700',
    marginTop: 4,
  },
  taglineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  taglineLine: {
    width: 24,
    height: 1,
    backgroundColor: COLORS.primary,
  },
  tagline: {
    fontSize: 11,
    color: COLORS.primary,
    letterSpacing: 3,
    marginHorizontal: 12,
    fontWeight: '500',
  },
  logoImage: {
    width: 150,
    height: 120,
    marginBottom: 8,
  },

  // In Queue Banner
  inQueueBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
    borderColor: COLORS.success,
    borderWidth: 1,
    margin: 16,
    padding: 16,
    borderRadius: 12,
  },
  inQueueText: {
    color: COLORS.success,
    fontSize: 16,
    fontWeight: '600',
  },
  inQueueSubtext: {
    color: COLORS.success,
    fontSize: 12,
    opacity: 0.8,
    marginTop: 2,
  },
  inQueueArrow: {
    color: COLORS.success,
    fontSize: 20,
  },

  // Section Header
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: 4,
  },

  // Pattern Background Section
  patternSection: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  patternImage: {
    opacity: 0.15,
    resizeMode: 'repeat',
  },

  // Floating Banner
  floatingBannerContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: COLORS.background,
  },

  // Sticky Header
  stickyHeader: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  // Simple Level Cards
  simpleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.cardBg,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 16,
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardLeft: {
    flex: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  levelNameSimple: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardMetaText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  cardMetaDot: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginHorizontal: 6,
  },
  miniBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  miniBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
  },
  cardSubtext: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  cardRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 70,
  },
  waitText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  miniJoinButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  miniJoinText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textOnDark,
  },
  chevron: {
    fontSize: 24,
    color: COLORS.textMuted,
    opacity: 0.5,
    marginTop: -4,
  },

  // Queue Screen
  queueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  backButton: {
    marginRight: 20,
  },
  backButtonText: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '500',
  },
  queueTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  queueSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  // Position Card
  positionCard: {
    margin: 20,
    padding: 32,
    backgroundColor: COLORS.cardBg,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.cardBorder,
  },
  positionCardNextUp: {
    borderColor: COLORS.success,
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
  },
  positionCardApproaching: {
    borderColor: COLORS.warning,
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
  },
  positionLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    letterSpacing: 2,
    marginBottom: 8,
  },
  positionNumber: {
    fontSize: 80,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  nextUpBadge: {
    marginTop: 16,
    backgroundColor: COLORS.success,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  nextUpText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 18,
  },
  approachingText: {
    marginTop: 12,
    color: COLORS.warning,
    fontSize: 16,
    fontWeight: '500',
  },

  // Prediction Card
  predictionCard: {
    marginHorizontal: 20,
    padding: 24,
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  predictionTitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    letterSpacing: 2,
    marginBottom: 12,
  },
  predictionMain: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: 20,
  },
  predictionTime: {
    fontSize: 64,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  predictionUnit: {
    fontSize: 24,
    color: COLORS.primary,
    marginLeft: 8,
  },
  predictionDetails: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  predictionDetail: {
    alignItems: 'center',
  },
  detailValue: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  detailLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Queue List
  queueSection: {
    flex: 1,
    paddingHorizontal: 20,
  },
  queueListTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  queueList: {
    flex: 1,
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  queueItemMe: {
    backgroundColor: 'rgba(201, 169, 98, 0.15)',
    borderColor: COLORS.primary,
  },
  queuePosition: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.textMuted,
    width: 40,
  },
  queuePlayer: {
    fontSize: 16,
    color: COLORS.textPrimary,
    flex: 1,
  },
  nextUpTag: {
    backgroundColor: COLORS.success,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  nextUpTagText: {
    color: '#000',
    fontSize: 11,
    fontWeight: 'bold',
  },

  // Leave Button
  leaveButton: {
    margin: 20,
    padding: 18,
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  leaveButtonText: {
    color: COLORS.danger,
    fontSize: 16,
    fontWeight: '600',
  },

  // Single-tap Join Button
  joinButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 4,
  },
  joinButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },

  // In Queue Badge (shows position on home screen)
  inQueueBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 4,
  },
  inQueueBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },

  // Court Assignment Banner (when it's your turn!)
  courtBanner: {
    backgroundColor: COLORS.success,
    padding: 24,
    marginHorizontal: 20,
    marginTop: 10,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  courtBannerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 12,
  },
  courtNumberContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  courtNumberLabel: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
    letterSpacing: 2,
  },
  courtNumber: {
    fontSize: 42,
    fontWeight: '900',
    color: '#000',
    letterSpacing: 2,
  },
  checkInButton: {
    backgroundColor: '#000',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  checkInButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  courtBannerHint: {
    fontSize: 12,
    color: '#333',
    opacity: 0.8,
  },

  // NEW QUEUE SCREEN STYLES
  queueHeaderBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  backBtn: {
    width: 60,
  },
  backBtnText: {
    color: COLORS.primary,
    fontSize: 16,
  },
  queueHeaderTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  queueScrollView: {
    flex: 1,
  },

  // Your Turn Banner - Compact
  yourTurnBanner: {
    backgroundColor: COLORS.success,
    margin: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  yourTurnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  yourTurnLogo: {
    width: 50,
    height: 50,
    borderRadius: 8,
    marginRight: 12,
  },
  yourTurnContent: {
    flex: 1,
  },
  yourTurnTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  yourTurnCourt: {
    fontSize: 16,
    color: '#333',
    fontWeight: '600',
    marginTop: 2,
  },
  imHereBtn: {
    backgroundColor: '#000',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  imHereBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // Court & Time Info Card
  courtTimeCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.cardBg,
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  courtInfo: {
    alignItems: 'center',
    flex: 1,
  },
  courtLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 4,
  },
  courtValue: {
    fontSize: 20,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  dividerVertical: {
    width: 1,
    height: 36,
    backgroundColor: COLORS.cardBorder,
    marginHorizontal: 8,
  },
  waitInfo: {
    alignItems: 'center',
    flex: 1,
  },
  waitLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 4,
  },
  waitValue: {
    fontSize: 20,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  waitUnit: {
    fontSize: 14,
    fontWeight: '400',
    color: COLORS.textSecondary,
  },
  positionInfo: {
    alignItems: 'center',
    flex: 1,
  },
  positionLabelSmall: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 4,
  },
  positionValueSmall: {
    fontSize: 24,
    color: COLORS.primary,
    fontWeight: '800',
  },

  // Section Card
  sectionCard: {
    backgroundColor: COLORS.cardBg,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },

  // Now Playing Grid
  nowPlayingGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
  },
  nowPlayingItem: {
    alignItems: 'center',
    width: 70,
  },
  playerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  playerAvatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  nowPlayingName: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },

  // Clean Queue List
  emptyQueueText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    fontSize: 14,
    marginTop: 16,
    fontStyle: 'italic',
  },
  queueListClean: {
    marginTop: 12,
  },
  queueItemClean: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  queueItemNext: {
    backgroundColor: 'rgba(74, 222, 128, 0.08)',
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  queuePosClean: {
    width: 32,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  queuePosMe: {
    color: COLORS.primary,
  },
  queueNameClean: {
    flex: 1,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  queueNameMe: {
    fontWeight: '600',
    color: COLORS.primary,
  },
  nextBadge: {
    backgroundColor: COLORS.success,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  nextBadgeText: {
    color: '#000',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },

  // Leave Queue Button
  leaveQueueBtn: {
    margin: 16,
    padding: 16,
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  leaveQueueBtnText: {
    color: COLORS.danger,
    fontSize: 16,
    fontWeight: '600',
  },

  // Admin Badge on Home
  adminBadge: {
    marginTop: 12,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  adminBadgeText: {
    color: COLORS.textOnDark,
    fontSize: 12,
    fontWeight: '600',
  },

  // Admin Screen
  adminHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  adminTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  adminSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  exitAdminText: {
    color: COLORS.danger,
    fontSize: 14,
    fontWeight: '600',
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
  },
  tabText: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  tabTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  adminContent: {
    flex: 1,
    padding: 16,
  },
  adminCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  adminCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  adminCardSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 12,
    marginTop: -8,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  levelDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  levelInfo: {
    flex: 1,
  },
  levelLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  levelDesc: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  courtsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  courtTile: {
    width: '22%',
    aspectRatio: 1,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  courtTileInactive: {
    backgroundColor: '#ddd',
    opacity: 0.5,
  },
  courtTileNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  courtTileNumberInactive: {
    color: '#999',
  },
  courtTileStatus: {
    position: 'absolute',
    bottom: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  adminAction: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  adminActionText: {
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.primary,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  peakHoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 100,
    paddingTop: 8,
  },
  peakHourBar: {
    alignItems: 'center',
    flex: 1,
  },
  peakBar: {
    width: '60%',
    backgroundColor: COLORS.success,
    borderRadius: 4,
    minHeight: 4,
  },
  peakHourLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 4,
  },

  // Bird's Eye View Court Styles
  courtHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  addCourtBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addCourtBtnText: {
    color: COLORS.textOnDark,
    fontSize: 13,
    fontWeight: '600',
  },
  courtsGridBirdEye: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'flex-start',
  },
  birdEyeCourt: {
    width: '30%',
    aspectRatio: 0.7,
    marginBottom: 8,
  },
  birdEyeCourtInactive: {
    opacity: 0.5,
  },
  courtSurface: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ccc',
    position: 'relative',
    overflow: 'hidden',
  },
  kitchenZone: {
    position: 'absolute',
    left: '10%',
    right: '10%',
    height: '22%',
    borderWidth: 2,
    borderStyle: 'dashed',
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  kitchenLeft: {
    top: '5%',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  kitchenRight: {
    bottom: '5%',
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  courtNet: {
    position: 'absolute',
    top: '48%',
    left: '5%',
    right: '5%',
    height: 4,
    borderRadius: 2,
  },
  centerLine: {
    position: 'absolute',
    top: '30%',
    bottom: '30%',
    left: '50%',
    width: 2,
    marginLeft: -1,
  },
  courtNumberBadge: {
    position: 'absolute',
    top: '38%',
    left: '50%',
    marginLeft: -14,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  courtNumberText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  courtStatusDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#fff',
  },
  courtLevelLabel: {
    position: 'absolute',
    bottom: 4,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '700',
  },
  courtHoldHint: {
    fontSize: 9,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 2,
  },
  courtLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textMuted,
  },
  savingText: {
    fontSize: 12,
    color: COLORS.success,
    fontWeight: '500',
  },

  // ========================================
  // JOIN QUEUE MODAL STYLES
  // ========================================
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.75)', // Darker backdrop for better contrast
  },
  joinModalContainer: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  joinModalHeader: {
    padding: 20,
    alignItems: 'center',
  },
  joinModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.white,
  },
  joinModalSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 4,
  },
  joinModalBody: {
    padding: 24,
    paddingBottom: 40,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 8,
    marginTop: 16,
  },
  textInput: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  modalButtons: {
    flexDirection: 'row',
    marginTop: 28,
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  modalJoinBtn: {
    flex: 2,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalJoinText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },

  // ========================================
  // "YOU'RE UP!" MODAL STYLES
  // ========================================
  yourTurnOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  yourTurnContainer: {
    backgroundColor: COLORS.white,
    borderRadius: 32,
    padding: 40,
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
  },
  yourTurnLogoLarge: {
    width: 80,
    height: 80,
    marginBottom: 16,
  },
  yourTurnTitleLarge: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.primary,
    textAlign: 'center',
    marginBottom: 24,
  },
  courtBadgeLarge: {
    backgroundColor: COLORS.success,
    paddingHorizontal: 32,
    paddingVertical: 20,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  courtBadgeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
    letterSpacing: 2,
  },
  courtBadgeNumber: {
    fontSize: 36,
    fontWeight: '900',
    color: COLORS.white,
    marginTop: 4,
  },
  yourTurnLevelText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 32,
  },
  yourTurnButtons: {
    width: '100%',
    gap: 12,
  },
  imHereBtnLarge: {
    backgroundColor: COLORS.success,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  imHereBtnLargeText: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: 1,
  },
  needTimeBtnLarge: {
    backgroundColor: COLORS.background,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  needTimeBtnLargeText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  // Rolling Pickleball Animation Styles
  rollingPickleball: {
    width: 32,
    height: 32,
    marginTop: 20,
  },
  pickleballInner: {
    width: 32,
    height: 32,
    backgroundColor: '#FFE135', // Neon yellow pickleball color
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5CA2C',
    position: 'relative',
  },
  pickleballHole: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.15)',
    top: 10,
    left: 10,
  },
});

