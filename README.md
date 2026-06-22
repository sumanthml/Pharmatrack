# PharmaTrack: Intelligent Pharmacy Inventory Management System 💊🚀

[![Live Demo](https://img.shields.io/badge/Live%20Demo-pharmatrack--sage.vercel.app-0ea5e9?style=for-the-badge&logo=vercel)](https://pharmatrack-sage.vercel.app/)
[![License](https://img.shields.io/badge/License-MIT-emerald?style=for-the-badge)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-v18+-green?style=for-the-badge&logo=node.js)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18.x-blue?style=for-the-badge&logo=react)](https://react.dev/)
[![Database](https://img.shields.io/badge/Database-PostgreSQL-4169e1?style=for-the-badge&logo=postgresql)](https://www.postgresql.org/)

PharmaTrack is an intelligent, multi-tenant pharmacy inventory assistant designed to eliminate drug waste, automate stock notifications, and streamline supplier communication using mathematical forecasting and generative AI. Built with a modern **dark-mode glassmorphic interface**, it is optimized for pharmacists, compliance inspectors, and inventory managers.

---

## 📸 Application Interface Gallery

Below are the screenshots showing different sections of the application in action:

<table align="center" width="100%">
  <tr>
    <td width="50%" align="center">
      <strong>📊 Main Dashboard & Inventory KPIs</strong><br/>
      <img src="docs/screenshots/media__1782137698801.png" alt="Dashboard View" width="100%" />
      <p><i>Real-time statistics, warning levels, expiration timelines, and transaction counters.</i></p>
    </td>
    <td width="50%" align="center">
      <strong>🧠 Predictive Analytics & Expiry Forecasts</strong><br/>
      <img src="docs/screenshots/media__1782137765607.png" alt="Analytics View" width="100%" />
      <p><i>Calculates sales velocity, projects expiry timelines, and recommends safety restocks.</i></p>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <strong>🛒 Dynamic POS Checkout Cashier</strong><br/>
      <img src="docs/screenshots/media__1782140065973.png" alt="POS Checkout View" width="100%" />
      <p><i>Search active stock batches, compile basket, adjust quantity, and block expired checkouts.</i></p>
    </td>
    <td width="50%" align="center">
      <strong>🤖 Conversational AI Assistant (PharmaBot)</strong><br/>
      <img src="docs/screenshots/media__1782143479937.png" alt="AI Chatbot View" width="100%" />
      <p><i>Ask questions about stock risks, replenishment sizes, and generate insights.</i></p>
    </td>
  </tr>
</table>

---

## 🌟 Core Features

### 1. Multi-Tenant Scoping & Security 🔒
* **Complete Isolation**: Companies register with a unique **Company Name** and **Email Address**. 
* **Data Scoping**: Every database transaction (medicines, sales, suppliers) is secured at the query level (`WHERE user_id = $1`) matching the authenticated Firebase User ID.
* **WebSocket Isolation**: Sockets automatically join company-specific rooms (`socket.emit('join_room', userId)`), ensuring real-time stock alerts are broadcast strictly to that tenant.

### 2. Interactive Point-of-Sale (POS) Checkout 🛒
* **Dynamic Catalog**: Search and browse active, in-stock medicine batches.
* **Basket Cashier**: Adjust quantities using tactile controls. Displays checkout totals dynamically.
* **Automated Safety Guard**: Prevents selling expired drugs or checking out quantities exceeding current shelf counts.
* **Daily KPIs**: Instantly calculates *Today's Revenue ($)*, *Transactions*, and *Top-Selling Medicines*.

### 3. Predictive Expiry & Restock Engine 🧠
* **Mathematical Forecasting**: Computes average daily unit sales (Sales Velocity) to predict depletion timelines.
* **Wastage Projections**: Identifies slow-selling batches and warns of potential financial losses ($) before expiry.
* **Safety Restocks**: Suggests purchase sizes using sales velocity and safety thresholds rather than arbitrary numbers.
* **Interactive Promotion Markdown**: Prompts operators to apply percentage markdown discounts to clear high-risk stock before expiration.

### 4. Real-time Email & WhatsApp Alerts 🚨
* **Visual Timelines**: Progress bars indicating elapsed medicine shelf-life (emerald green for fresh, warning orange, and red for expired/near-expiry).
* **Multi-Channel Dispatch**:
  * **Visual Email Reports**: Compiles warning reports into clean, visual HTML documents sent to the pharmacy's email via Brevo HTTP API.
  * **Free WhatsApp Alerts**: Compiles active alerts (low stock, expired, near-expiry) into structured markdown messages and opens WhatsApp Click-to-Chat pre-filled with the pharmacy contact phone.
  * **WhatsApp Supplier PO**: Generates purchase orders and launches chats directly with supplier phone lines.

### 5. Conversational AI Assistant (PharmaBot) 🤖
* Powered by the **Gemini & Groq APIs** (`llama-3.3-70b-versatile` / `llama-3.1-8b-instant`).
* Reads real-time scoped inventory tables, sales counts, and supplier listings to answer auditing questions (e.g. *"What needs reordering?"*, *"Analyze Amoxicillin risk"*).

---

## 📐 Technology Architecture

```mermaid
graph TD
    User([Pharmacist / Operator]) -->|Interacts| UI[Vite + React Client]
    UI -->|Firebase Token Auth| FB[Firebase Auth]
    UI -->|Socket.IO WS Connection| BE[Express Backend]
    UI -->|REST API Requests| BE
    BE -->|SQL Queries| DB[(Supabase PostgreSQL)]
    BE -->|Calculates Analytics| ML[Predictive Analytics Engine]
    BE -->|Contextual Prompting| AI[Groq llama3 API]
    BE -->|Broadcasts Stock Alerts| UI
```

---

## 🛠️ Installation & Setup

### Prerequisites
* **Node.js** (v18+)
* **Supabase** (PostgreSQL Database)
* **Firebase Project** (Client Credentials)
* **Groq API Key** (For chatbot)
* **Brevo API Key** (For transactional emails)

### 1. Database Setup
Execute the [schema.sql](file:///Users/applemac/Desktop/Pharmtrack/server/schema.sql) file in your Supabase SQL Editor. This initializes tables:
* `users` — Company credentials, license, alert settings.
* `medicines` — Medicine batches, price, quantity, expiry, and supplier details.
* `sales` — Transaction history and revenues.
* `suppliers` — Authorized manufacturer directories.

### 2. Backend Server Config
1. Navigate to `/server` directory:
   ```bash
   cd server
   npm install
   ```
2. Create a `.env` file in the `/server` folder:
   ```env
   PORT=5000
   DATABASE_URL=your_supabase_postgresql_connection_string
   GEMINI_API_KEY=your_gemini_api_key
   GROQ_API_KEY=your_groq_api_key
   GOOGLE_APPLICATION_CREDENTIALS=../serviceAccountKey.json
   BREVO_API_KEY=your_brevo_api_key
   ```
3. Start the API server:
   ```bash
   npm start
   ```

### 3. Frontend Client Config
1. Navigate to `/client` directory:
   ```bash
   cd client
   npm install
   ```
2. Set up your Firebase configuration in [client/src/firebase.js](file:///Users/applemac/Desktop/Pharmtrack/client/src/firebase.js).
3. Start the client:
   ```bash
   npm run dev
   ```
4. Access the dashboard at **[http://localhost:5173](http://localhost:5173)**.

---

## 📜 License
Distributed under the MIT License. See `LICENSE` for more information.
