#!/bin/bash

# LLMObs Stripe Setup Script
# Run this after `stripe login`

echo "🚀 Setting up Stripe products and prices for LLMObs..."
echo ""

# Check if logged in
stripe config --list > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "❌ Please run 'stripe login' first"
    exit 1
fi

echo "✅ Stripe CLI authenticated"
echo ""

# Create Products
echo "📦 Creating products..."

# Developer Plan
DEV_PRODUCT=$(stripe products create \
    --name="Developer" \
    --description="For individual developers and small projects. 100K requests/month, 30-day retention." \
    --metadata[tier]="developer" \
    2>/dev/null | grep '"id":' | head -1 | cut -d'"' -f4)
echo "   Created Developer product: $DEV_PRODUCT"

# Team Plan
TEAM_PRODUCT=$(stripe products create \
    --name="Team" \
    --description="For growing teams shipping to production. 1M requests/month, 90-day retention." \
    --metadata[tier]="team" \
    2>/dev/null | grep '"id":' | head -1 | cut -d'"' -f4)
echo "   Created Team product: $TEAM_PRODUCT"

# Business Plan
BIZ_PRODUCT=$(stripe products create \
    --name="Business" \
    --description="For scaling businesses. 10M requests/month, 180-day retention." \
    --metadata[tier]="business" \
    2>/dev/null | grep '"id":' | head -1 | cut -d'"' -f4)
echo "   Created Business product: $BIZ_PRODUCT"

# Enterprise Plan
ENT_PRODUCT=$(stripe products create \
    --name="Enterprise" \
    --description="For organizations with advanced needs. Unlimited requests, 1-year retention, SSO, dedicated support." \
    --metadata[tier]="enterprise" \
    2>/dev/null | grep '"id":' | head -1 | cut -d'"' -f4)
echo "   Created Enterprise product: $ENT_PRODUCT"

echo ""
echo "💰 Creating prices..."

# Developer Prices
DEV_MONTHLY=$(stripe prices create \
    --product="$DEV_PRODUCT" \
    --unit-amount=2000 \
    --currency=usd \
    --recurring[interval]=month \
    --nickname="Developer Monthly" \
    2>/dev/null | grep '"id":' | head -1 | cut -d'"' -f4)
echo "   Developer Monthly: $DEV_MONTHLY ($20/mo)"

DEV_ANNUAL=$(stripe prices create \
    --product="$DEV_PRODUCT" \
    --unit-amount=19200 \
    --currency=usd \
    --recurring[interval]=year \
    --nickname="Developer Annual" \
    2>/dev/null | grep '"id":' | head -1 | cut -d'"' -f4)
echo "   Developer Annual: $DEV_ANNUAL ($192/yr - 20% off)"

# Team Prices
TEAM_MONTHLY=$(stripe prices create \
    --product="$TEAM_PRODUCT" \
    --unit-amount=10000 \
    --currency=usd \
    --recurring[interval]=month \
    --nickname="Team Monthly" \
    2>/dev/null | grep '"id":' | head -1 | cut -d'"' -f4)
echo "   Team Monthly: $TEAM_MONTHLY ($100/mo)"

TEAM_ANNUAL=$(stripe prices create \
    --product="$TEAM_PRODUCT" \
    --unit-amount=96000 \
    --currency=usd \
    --recurring[interval]=year \
    --nickname="Team Annual" \
    2>/dev/null | grep '"id":' | head -1 | cut -d'"' -f4)
echo "   Team Annual: $TEAM_ANNUAL ($960/yr - 20% off)"

# Business Prices
BIZ_MONTHLY=$(stripe prices create \
    --product="$BIZ_PRODUCT" \
    --unit-amount=50000 \
    --currency=usd \
    --recurring[interval]=month \
    --nickname="Business Monthly" \
    2>/dev/null | grep '"id":' | head -1 | cut -d'"' -f4)
echo "   Business Monthly: $BIZ_MONTHLY ($500/mo)"

BIZ_ANNUAL=$(stripe prices create \
    --product="$BIZ_PRODUCT" \
    --unit-amount=480000 \
    --currency=usd \
    --recurring[interval]=year \
    --nickname="Business Annual" \
    2>/dev/null | grep '"id":' | head -1 | cut -d'"' -f4)
echo "   Business Annual: $BIZ_ANNUAL ($4,800/yr - 20% off)"

# Enterprise (custom pricing, but create a placeholder)
ENT_MONTHLY=$(stripe prices create \
    --product="$ENT_PRODUCT" \
    --unit-amount=200000 \
    --currency=usd \
    --recurring[interval]=month \
    --nickname="Enterprise Monthly" \
    2>/dev/null | grep '"id":' | head -1 | cut -d'"' -f4)
echo "   Enterprise Monthly: $ENT_MONTHLY ($2,000/mo starting)"

echo ""
echo "🔑 Creating webhook endpoint..."

# Create webhook endpoint (for local testing)
# In production, you'd use your actual domain
WEBHOOK=$(stripe webhook_endpoints create \
    --url="https://your-domain.com/api/billing/webhook" \
    --enabled-events="checkout.session.completed,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed" \
    2>/dev/null | grep '"id":' | head -1 | cut -d'"' -f4)
echo "   Webhook endpoint: $WEBHOOK"

echo ""
echo "================================================"
echo "✅ Stripe setup complete!"
echo "================================================"
echo ""
echo "📋 Add these to your .env file:"
echo ""
echo "# Stripe Configuration"
echo "STRIPE_SECRET_KEY=sk_test_...  # Get from https://dashboard.stripe.com/test/apikeys"
echo "STRIPE_PUBLISHABLE_KEY=pk_test_...  # Get from https://dashboard.stripe.com/test/apikeys"
echo "STRIPE_WEBHOOK_SECRET=whsec_...  # Get from webhook endpoint in dashboard"
echo ""
echo "# Price IDs"
echo "STRIPE_PRICE_DEV_MONTHLY=$DEV_MONTHLY"
echo "STRIPE_PRICE_DEV_ANNUAL=$DEV_ANNUAL"
echo "STRIPE_PRICE_TEAM_MONTHLY=$TEAM_MONTHLY"
echo "STRIPE_PRICE_TEAM_ANNUAL=$TEAM_ANNUAL"
echo "STRIPE_PRICE_BIZ_MONTHLY=$BIZ_MONTHLY"
echo "STRIPE_PRICE_BIZ_ANNUAL=$BIZ_ANNUAL"
echo "STRIPE_PRICE_ENT_MONTHLY=$ENT_MONTHLY"
echo ""
echo "🧪 For local webhook testing, run:"
echo "   stripe listen --forward-to localhost:8012/api/billing/webhook"
echo ""

