# F1 Predictor

A full-stack Formula 1 prediction game where users predict race results, compete on leaderboards, and track driver statistics throughout the season.

**[Live Demo](https://f1-project-fawn.vercel.app)**

---

## Features

### Race Predictions
- Predict top 3 finishers for Qualifying and Race sessions
- Full support for Sprint weekends (Sprint Qualifying + Sprint Race)
- Predictions automatically lock when the race weekend begins
- Visual driver picker with real driver photos

### Automatic Scoring
- Hourly scheduler fetches official results from Hyprace API
- Points awarded for exact position matches and top-3 accuracy
- Scoring: +8 pts exact race position, +5 pts exact qualifying, +3/+2 pts for correct top-3

### Leaderboards
- Season-long standings aggregating all race predictions
- Per-race leaderboards to see who predicted best each weekend
- Real-time updates after races are scored

### Driver Statistics
- 2025 season driver stats: average finish, qualifying, sprint positions
- Championship standings with points totals
- Pre-cached data for instant loading

### Teammate Head-to-Head
- Compare teammates across every team
- Race and qualifying H2H win counts
- DNF tracking and points comparison
- Color-coded team cards

### Authentication
- User registration and login
- JWT-based session management
- Protected prediction routes

---

## Tech Stack

### Frontend
- **React 19** with React Router
- **Vite** for fast builds and HMR
- **Bootstrap 5** + custom CSS
- **LocalStorage** caching for offline support

### Backend
- **Node.js** with Express 5
- **MongoDB** with Mongoose ODM
- **JWT** authentication
- **node-cron** for scheduled scoring
- **Winston** structured logging

### External APIs
- **Hyprace API** (via RapidAPI) for F1 calendar and results

### Deployment
- **Frontend**: Vercel
- **Backend**: Render
- **Database**: MongoDB Atlas

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│  React Frontend │────▶│  Express API    │────▶│  MongoDB Atlas  │
│  (Vercel)       │     │  (Render)       │     │                 │
│                 │     │                 │     │                 │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │  Hyprace API    │
                        │  (Race Results) │
                        └─────────────────┘
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create new account |
| POST | `/api/auth/login` | User login, returns JWT |
| POST | `/api/predictions/upsert` | Save/update predictions |
| GET | `/api/predictions/:gpId` | Get user's prediction |
| GET | `/api/leaderboard/season/:year` | Season standings |
| GET | `/api/leaderboard/gp/:gpId` | Single race standings |
| GET | `/api/stats/drivers` | Driver statistics |
| GET | `/api/stats/h2h` | Teammate H2H data |
| GET | `/api/health` | Health check |

---

## Local Development

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- Hyprace API key (RapidAPI)

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/Chris-Col/F1-Project.git
   cd F1-Project
   ```

2. **Install dependencies**
   ```bash
   # Backend
   cd backend
   npm install

   # Frontend
   cd ../frontend
   npm install
   ```

3. **Configure environment variables**

   Create `backend/.env`:
   ```env
   MONGO_URI=your_mongodb_connection_string
   JWT_SECRET=your_jwt_secret
   RAPIDAPI_KEY=your_hyprace_api_key
   PORT=5000
   ```

4. **Start development servers**
   ```bash
   # Terminal 1 - Backend
   cd backend
   npm run dev

   # Terminal 2 - Frontend
   cd frontend
   npm run dev
   ```

5. **Open the app**

   Navigate to `http://localhost:5173`

---

## Project Structure

```
F1-Project/
├── backend/
│   ├── controllers/      # Route handlers
│   ├── middleware/       # Auth & logging
│   ├── models/           # Mongoose schemas
│   ├── routes/           # API routes
│   ├── services/         # Scoring & calendar sync
│   ├── data/             # Cached statistics
│   └── server.js         # Express app
│
├── frontend/
│   ├── public/imgs/      # Driver photos
│   └── src/
│       ├── components/   # Reusable UI
│       ├── pages/        # Route pages
│       ├── utils/        # API client & helpers
│       └── App.jsx       # Router setup
│
└── README.md
```

---

## Key Implementation Details

### Prediction Locking
Predictions are locked server-side when FP1 begins. The API validates `weekendStart` timestamp and returns `403 Forbidden` if users attempt to submit after the deadline.

### Automatic Scoring
A cron job runs hourly checking for completed race weekends. After a 4-hour buffer (to ensure official results), it fetches results from Hyprace API and scores all user predictions using MongoDB bulk operations.

### Caching Strategy
Driver statistics and H2H data are pre-fetched and stored as JSON to avoid hitting API rate limits. The frontend receives instant responses without external API calls.

---

## Screenshots

| Home | Driver Stats | H2H Comparison |
|------|--------------|----------------|
| Landing page with prediction CTA | Season statistics grid | Teammate battle cards |

| Predictions | Leaderboard |
|-------------|-------------|
| Visual driver picker | Season rankings |

---

## Future Enhancements
- Push notifications for race reminders
- Historical season data and analytics
- Social features (friends, private leagues)
- Mobile app with React Native

---

## License

MIT

---

Built by [Chris Coleman](https://github.com/Chris-Col)
