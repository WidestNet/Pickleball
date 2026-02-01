# St Pete Pickleball Queue App

A smart virtual paddle rack system for St Pete Athletic.

## 🏓 Features

- **Virtual Queue**: FIFO paddle rack digitized
- **Smart Rotation**: 8+ waiting = all 4 off, <8 = losers only
- **Wait Time Prediction**: ML-powered "hostess" feature
- **Push + SMS Notifications**: Know when you're up
- **Admin Analytics**: Game stats and insights

## 📁 Project Structure

```
stpete-pickleball/
├── apps/mobile/          # React Native Expo app
│   ├── App.js           # Main entry point
│   └── src/
│       ├── screens/     # UI screens
│       └── services/    # API & Firebase
├── firebase/            # Firebase backend
│   ├── functions/src/   # Cloud Functions
│   │   ├── queue/       # Queue management
│   │   ├── games/       # Game tracking
│   │   ├── notifications/ # Push + SMS
│   │   ├── ml/          # Wait time prediction
│   │   └── webhooks/    # PodPlay-compatible API
│   ├── firestore.rules
│   └── firebase.json
└── docs/api/            # API documentation
```

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- Firebase CLI
- Expo CLI (for mobile)

### Backend Setup

```bash
cd firebase/functions
npm install

# Set up Twilio for SMS (optional)
firebase functions:config:set twilio.sid="YOUR_SID" twilio.token="YOUR_TOKEN"

# Deploy
firebase deploy
```

### Mobile App Setup

```bash
cd apps/mobile
npm install
npx expo start
```

## 🔑 Key Business Logic

### Rotation Rules

```javascript
if (queueLength >= 8) {
  // All 4 players rotate off
  return 'FULL_ROTATION';
} else {
  // Only losing team rotates off
  // Winners stay (up to 3 consecutive games)
  return 'PARTIAL_ROTATION';
}
```

### Wait Time Prediction

- Uses weighted average of recent game durations
- Factors in: time of day, day of week, court
- Confidence level: low (<10 games), medium (<100), high (100+)

## 🔗 PodPlay Integration

API designed for PodPlay compatibility:

- Webhook events for all queue/game actions
- HMAC-signed payloads
- REST endpoints matching PodPlay patterns

## 📊 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/queues/{id}/join` | Join queue |
| DELETE | `/queues/{id}/leave` | Leave queue |
| POST | `/games` | Start game |
| PATCH | `/games/{id}/end` | End with score |
| GET | `/predictions/wait-time` | Get wait estimate |

## 📄 License

Proprietary - St Pete Athletic
