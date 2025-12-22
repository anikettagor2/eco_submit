# ECO SUBMIT - AI-Powered Digital Project Submission Platform

## Overview
Eco Submit is a high-performance web application designed for students and professors to handle digital project submissions. It features role-based access, PDF uploads, AI-powered summaries and viva questions (Gemini), and automated workflows.

## Tech Stack
- **Frontend**: React (Vite) + TypeScript + Tailwind CSS + shadcn/ui
- **Backend Servies**: Firebase Auth, Firestore, Storage, Cloud Functions
- **AI**: Google Gemini API

## Prerequisites
- Node.js (v18+)
- Firebase CLI (`npm install -g firebase-tools`)
- Gemini API Key

## Setup Instructions

1. **Install Dependencies**:
   ```bash
   cd eco-submit
   npm install
   ```

2. **Environment Variables**:
   Update `.env` with your Firebase config and Gemini API Key.
   ```env
   VITE_FIREBASE_API_KEY=...
   GEMINI_API_KEY=...
   ```

3. **Run Locally**:
   ```bash
   npm run dev
   ```

4. **Deploy Cloud Functions**:
   ```bash
   firebase login
   firebase init functions (Select existing project)
   cd functions
   npm install
   npm run deploy
   ```
   *Note*: Ensure your Firebase project is on the Blaze plan for Cloud Functions and external API calls.

## Project Structure
- `src/pages`: Route components (Login, Student Dashboard, etc.)
- `src/components/ui`: Reusable shadcn/ui components.
- `src/contexts`: Global state (AuthContext).
- `functions/src`: Backend logic (Gemini, PDF handling).
- `firestore.rules`: Security rules for database.
- `storage.rules`: Security rules for storage.

## Features
- **Role Selection**: New users choose Student or Professor role.
- **Secure Uploads**: PDFs stored in Firebase Storage.
- **AI Processing**: Automatic summary and viva question generation.
- **Responsive UI**: Built with Tailwind and shadcn/ui.

## Performance
- Lazy loading enabled for routes.
- Tailwind CSS for minimal bundle size.
- Pre-connection to Firebase.

## Troubleshooting
- If build fails on `postcss` or `tailwind`, ensure `tailwindcss` v3 is installed (`npm install -D tailwindcss@3`).
- If Cloud Functions fail, check Firebase logs and billing status.
