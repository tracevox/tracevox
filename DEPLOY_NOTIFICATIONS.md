# Deployment Guide - Login & Signup Notifications

## Changes Made
1. ✅ Added login notifications to `app/api/auth.py`
2. ✅ Updated notification service to use Resend instead of SendGrid
3. ✅ Added USER_LOGIN notification type with email templates
4. ✅ Updated deployment configuration

## Pre-Deployment: Create Secret in Google Cloud

**IMPORTANT:** Create the Resend API key secret in Google Cloud Secret Manager:

```bash
# Set your project
gcloud config set project tracevox-prod

# Create the secret
echo -n "re_9oT1obWJ_33qCXxQntPRPjhP3LQAktQ5i" | gcloud secrets create resend-api-key \
  --project=tracevox-prod \
  --data-file=-

# Or if secret already exists, add a new version:
echo -n "re_9oT1obWJ_33qCXxQntPRPjhP3LQAktQ5i" | gcloud secrets versions add resend-api-key \
  --project=tracevox-prod \
  --data-file=-
```

## Deploy Backend to Google Cloud

```bash
# Make sure you're in the production project
gcloud config set project tracevox-prod

# Deploy using Cloud Build
gcloud builds submit --config cloudbuild.yaml \
  --project=tracevox-prod \
  --region=us-central1
```

## Deploy Frontend to Vercel

```bash
cd frontend
vercel --prod
```

Or if you have Vercel CLI configured with auto-deploy, just push to your main branch.

## Verify Deployment

After deployment:
1. Test signup: Create a new user account
2. Test login: Log in with an existing user
3. Check your email at `hello@neuralrocks.com` for notifications

## Environment Variables Set in Cloud Run

The following are automatically set during deployment:
- `RESEND_API_KEY` (from Secret Manager)
- `FROM_EMAIL=hello@neuralrocks.com`
- `FROM_NAME=Tracevox`
- `ADMIN_NOTIFICATION_EMAIL=hello@neuralrocks.com`

## Troubleshooting

If notifications don't work:
1. Check Cloud Run logs: `gcloud logging read "resource.type=cloud_run_revision" --limit 50`
2. Verify secret exists: `gcloud secrets list --project=tracevox-prod`
3. Check Resend dashboard for email delivery status
