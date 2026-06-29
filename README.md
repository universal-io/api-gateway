This is the Bomb Squad web surface for Vercel deployment.

## Scope

- product / landing pages
- auth entrypoint for registration and login
- future pricing and billing surface
- future AI gateway and admin entrypoint

The native macOS app still owns the in-app review flow. This `web/` app owns
the user-facing account and commercial surface.

## Getting Started

1. Copy `.env.example` to `.env.local`.
2. Fill in the public Supabase variables.
3. Run the development server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_BOMB_SQUAD_API_BASE_URL`

Server-only placeholders are already reserved for the later gateway and Stripe work:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

## Current Routes

- `/` product top
- `/auth` email OTP sign-in and sign-up
- `/pricing` pricing draft

## Next Steps

- add Google OAuth and Apple ID
- add `/api/ai/review`
- add Stripe checkout and portal
- add lightweight admin pages

## Deploy

Deploy this directory to Vercel as a separate project root.
