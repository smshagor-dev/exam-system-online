# ExamFlow Pro 🎓

A **production-ready** online exam management system built with Next.js 16, Socket.IO, Prisma (MongoDB), and TypeScript.

---

## ✨ Features

### 🔐 Role-Based Access Control
| Role | Capabilities |
|---|---|
| Super Admin | Full system control — departments, subjects, users, exams, results |
| Department Admin | Manage own department's data |
| Teacher | Create questions, build exams, monitor live sessions, review answers |
| Student | Join live exams, submit answers, view published results |

### 📡 Real-Time (Socket.IO)
- Server-authoritative timer (clients cannot manipulate time)
- Auto-save answers every 5 seconds
- Auto-submit when timer reaches zero
- Teacher live dashboard: online status, submission status, suspicious activity
- Socket reconnect support — students rejoin seamlessly
- Instant result notification via socket

### 📝 Exam & Question System
- Question Bank with MCQ, True/False, Short Answer, Written Answer, Mixed types
- Per-assignment question scoping (subject / language / group / academic year)
- Marks override per-exam-question
- Image attachment support on questions

### 📊 Result Engine
- **AUTO**: MCQ/T-F and short answers checked automatically
- **TEACHER_REVIEW**: Short/written answers shown to teacher for manual grading
- **AI_ASSISTED_OPTIONAL**: AI suggests marks; teacher must confirm (disabled by default)
- Automatic grade calculation (A+, A, B+, B, C, D, F)
- Pass/fail based on configurable passing marks
- Auto-publish option

### 🛡️ Security
- JWT authentication (NextAuth v5)
- All routes protected server-side — never trust client role
- Student cannot access wrong department/subject/group exams
- Answers locked after submission
- Duplicate attempt prevention
- Tab switch detection and logging
- Zod validation on all inputs
- bcrypt password hashing

### Academic Architecture (Phase 2)
- Degree levels, academic programs, department-language mappings, and academic sessions
- Program years, program-semester mappings, and curriculum records
- Reusable `AcademicOffering` scope with backward-compatible legacy fallbacks

---

## 🚀 Quick Setup

### Prerequisites
- Node.js 20+
- MongoDB Atlas or a local MongoDB server
- npm or yarn

### 1. Clone & Install

```bash
git clone <your-repo>
cd examflow-pro
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
DATABASE_URL="mongodb+srv://username:password@cluster0.example.mongodb.net/examflow_pro?retryWrites=true&w=majority&appName=Cluster0"
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"
NEXTAUTH_URL="http://localhost:3000"
AI_EVALUATION_ENABLED="false"
```

### 3. Set Up Database

```bash
# Generate Prisma client
npx prisma generate

# Push Prisma schema (creates all collections)
npx prisma db push

# Seed with demo data
npx ts-node --project tsconfig.seed.json prisma/seed.ts

# Phase 2 dry-run backfill
npm run phase2:backfill:dry

# Phase 2 integrity verification
npm run phase2:verify
```

### 4. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 🔑 Demo Credentials (after seed)

| Role | Email | Password |
|---|---|---|
| Super Admin | admin@examflow.pro | Admin@123 |
| Dept Admin (CSE) | cse.admin@examflow.pro | Admin@123 |
| Teacher 1 | teacher.john@examflow.pro | Teacher@123 |
| Teacher 2 | teacher.sarah@examflow.pro | Teacher@123 |
| Student 1 | alice@student.examflow.pro | Student@123 |
| Student 2 | bob@student.examflow.pro | Student@123 |
| Student 3 | charlie@student.examflow.pro | Student@123 |

---

## 📁 Project Structure

```
examflow-pro/
├── prisma/
│   ├── schema.prisma        # Complete database schema
│   └── seed.ts              # Demo data seeder
├── server.js                # Custom Node.js server (Next.js + Socket.IO)
├── src/
│   ├── app/
│   │   ├── (auth)/          # Login / Register pages
│   │   ├── admin/           # Admin dashboard & CRUD pages
│   │   ├── teacher/         # Teacher dashboard, questions, exams
│   │   ├── student/         # Student dashboard, exam attempt, results
│   │   └── api/             # All API routes
│   │       ├── auth/        # NextAuth endpoints + register
│   │       ├── admin/       # Admin CRUD APIs
│   │       ├── exams/       # Exam CRUD + [id]
│   │       ├── questions/   # Question bank APIs
│   │       ├── results/     # Result APIs
│   │       └── socket/      # Socket JWT token endpoint
│   ├── components/
│   │   └── admin/           # Shared admin UI components
│   ├── lib/
│   │   ├── auth.ts          # NextAuth configuration
│   │   ├── prisma.ts        # Prisma client singleton
│   │   ├── socket.ts        # Socket.IO client
│   │   ├── permissions.ts   # Server-side permission checks
│   │   ├── validators.ts    # Zod schemas
│   │   └── result-engine.ts # Auto result calculation
│   ├── server/
│   │   └── socket-server.ts # Socket.IO server (all events)
│   ├── services/
│   │   └── ai-evaluation.service.ts  # AI placeholder (disabled)
│   └── types/
│       └── socket.ts        # TypeScript event types
```

---

## 🔌 Socket.IO Event Reference

### Client → Server (Teacher)
| Event | Payload | Description |
|---|---|---|
| `teacher:start_exam` | `{ examId }` | Start exam, activate server timer |
| `teacher:pause_exam` | `{ examId }` | Pause timer |
| `teacher:end_exam` | `{ examId }` | End exam, auto-submit all |
| `teacher:publish_result` | `{ examId, attemptId }` | Publish a result |
| `teacher:review_answer` | `{ answerId, marks, feedback }` | Submit manual marks |

### Client → Server (Student)
| Event | Payload | Description |
|---|---|---|
| `student:join_exam` | `{ examId }` | Join exam room (validates eligibility) |
| `student:start_attempt` | `{ examId }` | Create attempt record |
| `student:save_answer` | `{ attemptId, questionId, ... }` | Save an answer |
| `student:submit_exam` | `{ attemptId }` | Manual submit |
| `student:tab_switch` | `{ attemptId }` | Report tab switch |

### Server → Client
| Event | Description |
|---|---|
| `exam:started` | Exam went live |
| `exam:timer_update` | Every second: `{ remaining, elapsed }` |
| `exam:student_joined` | Teacher notified of join |
| `exam:auto_submitted` | Student was auto-submitted |
| `exam:ended` | Exam ended |
| `result:published` | Student notified of published result |

---

## 🤖 Enabling AI Evaluation

1. Set `AI_EVALUATION_ENABLED=true` in `.env`
2. Add `OPENAI_API_KEY=sk-...` to `.env`
3. Open `src/services/ai-evaluation.service.ts`
4. Replace the placeholder block in `evaluateAnswer()` with:

```typescript
import OpenAI from 'openai'
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const completion = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [
    {
      role: 'system',
      content: `You are an exam evaluator. Given a question, expected answer, and student's answer, suggest marks out of ${opts.maxMarks} and short feedback. Respond in JSON: {"suggestedMarks": number, "feedback": string, "confidence": number}`
    },
    {
      role: 'user',
      content: `Question: ${opts.questionText}\nExpected: ${opts.expectedAnswer}\nStudent: ${opts.studentAnswer}`
    }
  ],
  response_format: { type: 'json_object' },
})
return JSON.parse(completion.choices[0].message.content!)
```

5. Install: `npm install openai`

> **Note:** AI only *suggests* marks. Results are never auto-published in AI_ASSISTED mode — teacher must confirm.

---

## 🏭 Production Deployment

```bash
# Build Next.js
npm run build

# Start production server
npm run start
```

### Recommended Stack
- **Database**: MongoDB Atlas or self-hosted MongoDB
- **App**: PM2 on a VPS, or Railway/Render
- **File Storage**: AWS S3 (for question image attachments)
- **SSL**: Nginx reverse proxy with Let's Encrypt

---

## 📜 Available Scripts

```bash
npm run dev          # Start dev server (Next.js + Socket.IO)
npm run build        # Build for production
npm run start        # Start production server
npm run typecheck    # Generate Next route types and run TypeScript checks
npm run lint         # Run ESLint
npm run qa           # Run typecheck, lint, and build
npm run db:generate  # Generate Prisma client
npm run db:validate  # Validate Prisma schema
npm run db:migrate   # Push Prisma schema to MongoDB
npm run db:seed      # Seed demo data
npm run db:studio    # Open Prisma Studio (DB GUI)
```

---

## 🧩 Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.10 (App Router) |
| Language | TypeScript |
| Database | MongoDB via Prisma ORM |
| Real-time | Socket.IO 4 |
| Auth | NextAuth v5 (JWT strategy) |
| Styling | Tailwind CSS |
| Validation | Zod |
| Passwords | bcryptjs |
| AI (optional) | OpenAI GPT-4o |

---

## 📄 License

MIT — free to use and modify.
