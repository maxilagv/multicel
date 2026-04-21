# Argensystem Cloud

![Status](https://img.shields.io/badge/Status-Proprietary_Software-red)
![Stack](https://img.shields.io/badge/Stack-Node.js_|_React_|_MySQL-blue)
![Mode](https://img.shields.io/badge/Mode-Cloud_Only-success)

## Legal notice
This repository contains proprietary source code. Public visibility (if any) is for portfolio/demo purposes only. Unauthorized copying, distribution, or commercial use is prohibited.

## Current architecture
This repository is now aligned to a cloud-only model:
- Backend API: Node.js/Express (deploy target: Hostinger).
- Frontend web: React (deploy target: Vercel).
- Database: MySQL (single source of truth).

Removed from runtime:
- Electron desktop runtime.
- Local SQLite backup/restore flows.
- Local IP/LAN connection model.
- Per-installation license activation.
- Local-to-cloud sync bridge queue.

## Backend quickstart
1. Configure `backend/server/.env` with MySQL credentials.
2. Run migrations:
`npm --prefix backend/server run migrate`
3. Start API:
`npm --prefix backend/server run dev`

## Core docs
- `docs/cloud/ARCHITECTURE.md`
- `docs/cloud/CONTRACT.md`
- `docs/cloud/SCHEMA.md`
- `docs/strategy/CLOUD_CUTOVER_MAP.md`

## Contact
Author: Maximo Lavagetto
