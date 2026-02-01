/**
 * Main App Entry Point
 * 
 * Root component with navigation setup
 */

import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar, View, Text, ActivityIndicator, StyleSheet } from 'react-native';

// Screens
import HomeScreen from './screens/HomeScreen';
import QueueViewScreen from './screens/QueueViewScreen';
import OnCourtScreen from './screens/OnCourtScreen';
import AdminDashboardScreen from './screens/AdminDashboardScreen';

// Services
import { onAuthStateChanged } from './services/firebase';
import {
    registerForPushNotifications,
    savePushToken,
    addNotificationResponseListener
} from './services/notifications';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Home stack with queue flow
function HomeStack() {
    return (
        <Stack.Navigator
            screenOptions={{
                headerStyle: { backgroundColor: '#111827' },
                headerTintColor: '#FFFFFF',
                headerTitleStyle: { fontWeight: '600' },
            }}
        >
            <Stack.Screen
                name="HomeMain"
                component={HomeScreen}
                options={{ headerShown: false }}
            />
            <Stack.Screen
                name="JoinQueue"
                component={QueueViewScreen}
                options={{ title: 'Queue' }}
            />
            <Stack.Screen
                name="QueueView"
                component={QueueViewScreen}
                options={{ title: 'Your Position' }}
            />
            <Stack.Screen
                name="OnCourt"
                component={OnCourtScreen}
                options={{ title: 'Game On!', headerBackVisible: false }}
            />
        </Stack.Navigator>
    );
}

// Tab icon component
function TabIcon({ name, focused }) {
    const icons = {
        Courts: focused ? '🏓' : '🏐',
        Analytics: focused ? '📊' : '📈',
        Profile: focused ? '👤' : '👥',
    };

    return (
        <Text style={{ fontSize: 24 }}>{icons[name] || '•'}</Text>
    );
}

// Main authenticated app
function MainApp({ isAdmin }) {
    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                tabBarIcon: ({ focused }) => (
                    <TabIcon name={route.name} focused={focused} />
                ),
                tabBarActiveTintColor: '#10B981',
                tabBarInactiveTintColor: '#6B7280',
                tabBarStyle: {
                    backgroundColor: '#1F2937',
                    borderTopColor: '#374151',
                    paddingTop: 8,
                },
                headerShown: false,
            })}
        >
            <Tab.Screen
                name="Courts"
                component={HomeStack}
            />
            {isAdmin && (
                <Tab.Screen
                    name="Analytics"
                    component={AdminDashboardScreen}
                />
            )}
        </Tab.Navigator>
    );
}

// Loading screen
function LoadingScreen() {
    return (
        <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#10B981" />
            <Text style={styles.loadingText}>Loading...</Text>
        </View>
    );
}

// Auth screen placeholder
function AuthScreen() {
    return (
        <View style={styles.authContainer}>
            <Text style={styles.authTitle}>🏓 St Pete Pickleball</Text>
            <Text style={styles.authSubtitle}>Sign in to continue</Text>
            {/* Phone auth would go here */}
        </View>
    );
}

// Root App
export default function App() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(async (authUser) => {
            setUser(authUser);
            setLoading(false);

            if (authUser) {
                // Register for push notifications
                const token = await registerForPushNotifications();
                if (token) {
                    await savePushToken(token);
                }

                // Check admin status (would come from Firestore)
                // setIsAdmin(authUser.email?.includes('admin'));
                setIsAdmin(true); // For demo purposes
            }
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        // Handle notification taps
        const unsubscribe = addNotificationResponseListener((response) => {
            const data = response.notification.request.content.data;

            // Navigate based on notification type
            if (data.queueId) {
                // Navigate to queue view
                console.log('Navigate to queue:', data.queueId);
            }
        });

        return () => unsubscribe();
    }, []);

    if (loading) {
        return <LoadingScreen />;
    }

    return (
        <NavigationContainer>
            <StatusBar barStyle="light-content" backgroundColor="#111827" />
            {user ? <MainApp isAdmin={isAdmin} /> : <AuthScreen />}
        </NavigationContainer>
    );
}

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        backgroundColor: '#111827',
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        color: '#9CA3AF',
        marginTop: 16,
        fontSize: 16,
    },
    authContainer: {
        flex: 1,
        backgroundColor: '#111827',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    authTitle: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
    authSubtitle: {
        fontSize: 16,
        color: '#9CA3AF',
        marginTop: 8,
    },
});
