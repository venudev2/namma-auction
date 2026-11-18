# Namma Auction 🏏

> **High-intensity real-time multiplayer T20 cricket auction simulator.**  
> *Created by **MALUR and MALVALLI MALLI (OG creators)**.*

---

## 🌟 Highlights

- **💛❤️ Karnataka Spirit**: Branded with the vibrant red & yellow Karnataka cricket theme.
- **⚡ 100% Guest Mode**: Jump straight into the auction room with friends in seconds — no Google OAuth login required.
- **👑 3-Tier Player Pool**:
  - **Tier 1 (Marquee Superstars)**: ₹2.00 Cr base price (Virat Kohli, Jasprit Bumrah, Hardik Pandya, Rohit Sharma, etc.)
  - **Tier 2 (Established Stars)**: ₹1.00–1.50 Cr base price (Vaibhav Sooryavanshi, Devdutt Padikkal, Will Jacks, Jacob Bethell, Matt Henry, etc.)
  - **Tier 3 (Emerging & Uncapped Talents)**: ₹30L–50L base price (All rated 30+).
- **🔀 Secret Upcoming Player Queue**:
  - Completely randomized order via Fisher-Yates shuffle.
  - Follows strict Tier 1 ➔ Tier 2 ➔ Tier 3 flow.
  - Next players remain secret until the current lot finishes bidding.
- **🔨 Wooden Gavel Audio**: Authentic Web Audio synthesized double-strike hammer sound effect on "SOLD!".
- **🛡️ Authentic HD Team Logos**: Background-removed transparent franchise crests with zero-breakage SVG fallbacks.
- **⏱️ Real-time Synchronization**: Sub-second multiplayer bidding with automated host disconnect auto-pause and optimistic concurrency control.

---

## 🚀 Quick Start (Local Development)

```bash
# 1. Install dependencies
npm install

# 2. Configure Firebase in .env
# Ensure your Firebase Realtime Database credentials and VITE_ENABLED_SERVERS=server-1 are present

# 3. Start development server
npm run dev
```

Visit `http://localhost:5173` to test.

---

## 🌐 Deploy to Vercel

1. Push your repository to GitHub:
   ```bash
   git add .
   git commit -m "feat: Namma Auction release"
   git push origin main
   ```
2. Open **[Vercel](https://vercel.com)** and import your repository.
3. In **Environment Variables**, paste the keys from `.env`:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_DATABASE_URL`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_FIREBASE_MEASUREMENT_ID`
   - `VITE_ENABLED_SERVERS=server-1`
4. Click **Deploy**. Vercel uses `vercel.json` for client-side routing.

---

## ⚖️ Disclaimer

Namma Auction is an independent, non-commercial fan-made simulation created strictly for entertainment purposes. It is not affiliated with or endorsed by the BCCI or IPL. All team crests and trademarks remain the property of their respective owners.
