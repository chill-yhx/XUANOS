# XUANOS Frontend

## Setup

```powershell
npm install
npm run dev
```

Use the same hostname for frontend and backend during local Cookie Session
testing. For example, open `http://localhost:5173` with:

```dotenv
VITE_API_BASE_URL=http://localhost:8000
VITE_ENABLE_DEVELOPMENT_MOCK=false
```

The frontend restores identity through `GET /api/auth/me` and sends requests
with `credentials: include`. It never stores a Session token in
`localStorage`, `sessionStorage`, URLs, or persistent React state.

The invite-only login supports:

- mainland China `+86` SMS verification;
- password login after the user has set a password;
- SMS password reset;
- password setup/change and logout in “我的系统”.

There is no public registration or region selector.

## Verify

```powershell
npm run test
npm run build
npm run lint
```
