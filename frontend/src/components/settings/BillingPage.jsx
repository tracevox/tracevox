import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  CreditCard, Check, Zap, Building2, Crown, Star, 
  ArrowRight, ExternalLink, Download, AlertCircle,
  Loader2, Receipt, Calendar, TrendingUp
} from 'lucide-react';
import * as api from '../../lib/api';

const PLAN_ICONS = {
  free: Zap,
  developer: Star,
  team: Building2,
  business: Crown,
  enterprise: Crown,
};

const PLAN_COLORS = {
  free: 'from-gray-500 to-gray-600',
  developer: 'from-blue-500 to-blue-600',
  team: 'from-purple-500 to-purple-600',
  business: 'from-amber-500 to-amber-600',
  enterprise: 'from-rose-500 to-rose-600',
};

export function BillingPage() {
  const [plans, setPlans] = useState([]);
  const [currentBilling, setCurrentBilling] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [upcomingInvoice, setUpcomingInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [billingPeriod, setBillingPeriod] = useState('monthly');
  const [error, setError] = useState(null);

  useEffect(() => {
    loadBillingData();
  }, []);

  async function loadBillingData() {
    setLoading(true);
    try {
      const [plansRes, currentRes, invoicesRes, upcomingRes] = await Promise.all([
        api.apiRequest('/api/billing/plans'),
        api.apiRequest('/api/billing/current'),
        api.apiRequest('/api/billing/invoices'),
        api.apiRequest('/api/billing/upcoming-invoice'),
      ]);
      
      setPlans(plansRes.plans || []);
      setCurrentBilling(currentRes);
      setInvoices(invoicesRes.invoices || []);
      setUpcomingInvoice(upcomingRes.upcoming);
    } catch (err) {
      setError(err.message || 'Failed to load billing data');
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckout(planId) {
    setCheckoutLoading(planId);
    try {
      const res = await api.apiPost('/api/billing/checkout', {
        tier: planId,
        billing_period: billingPeriod,
      });
      
      if (res.checkout_url) {
        window.location.href = res.checkout_url;
      }
    } catch (err) {
      setError(err.message || 'Failed to start checkout');
      setCheckoutLoading(null);
    }
  }

  async function handleManageBilling() {
    try {
      const res = await api.apiPost('/api/billing/portal');
      if (res.portal_url) {
        window.open(res.portal_url, '_blank');
      }
    } catch (err) {
      setError(err.message || 'Failed to open billing portal');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  const currentPlanId = currentBilling?.plan?.id || 'free';

  return (
    <div className="space-y-8">
      {/* Current Plan Summary */}
      {currentBilling && (
        <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white mb-2">Current Plan</h2>
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium bg-gradient-to-r ${PLAN_COLORS[currentPlanId]} text-white`}>
                  {React.createElement(PLAN_ICONS[currentPlanId] || Zap, { className: 'w-4 h-4' })}
                  {currentBilling.plan?.name}
                </span>
                {currentBilling.status === 'trial' && (
                  <span className="text-yellow-400 text-sm">
                    Trial ends in {currentBilling.trial?.days_remaining} days
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={handleManageBilling}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <CreditCard className="w-4 h-4" />
              Manage Billing
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>

          {/* Usage */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-gray-900/50 rounded-lg p-4">
              <p className="text-gray-400 text-sm">Requests Used</p>
              <p className="text-2xl font-bold text-white">
                {currentBilling.usage?.requests?.toLocaleString() || 0}
              </p>
              <p className="text-gray-500 text-sm">
                of {currentBilling.usage?.requests_limit?.toLocaleString() || '∞'}
              </p>
              <div className="mt-2 bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-purple-500 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(100, currentBilling.usage?.usage_percent || 0)}%` }}
                />
              </div>
            </div>
            
            <div className="bg-gray-900/50 rounded-lg p-4">
              <p className="text-gray-400 text-sm">Current Spend</p>
              <p className="text-2xl font-bold text-white">
                ${currentBilling.usage?.cost_usd?.toFixed(2) || '0.00'}
              </p>
              <p className="text-gray-500 text-sm">this period</p>
            </div>
            
            <div className="bg-gray-900/50 rounded-lg p-4">
              <p className="text-gray-400 text-sm">Tokens Used</p>
              <p className="text-2xl font-bold text-white">
                {(currentBilling.usage?.tokens || 0).toLocaleString()}
              </p>
            </div>
            
            <div className="bg-gray-900/50 rounded-lg p-4">
              <p className="text-gray-400 text-sm">Billing Period</p>
              <p className="text-lg font-semibold text-white">
                {currentBilling.billing_period?.start 
                  ? new Date(currentBilling.billing_period.start).toLocaleDateString()
                  : 'N/A'
                }
              </p>
              <p className="text-gray-500 text-sm">
                to {currentBilling.billing_period?.end 
                  ? new Date(currentBilling.billing_period.end).toLocaleDateString()
                  : 'N/A'
                }
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Pricing Plans */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Plans & Pricing</h2>
          <div className="flex items-center gap-2 bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setBillingPeriod('monthly')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                billingPeriod === 'monthly' 
                  ? 'bg-purple-600 text-white' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod('annual')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                billingPeriod === 'annual' 
                  ? 'bg-purple-600 text-white' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Annual <span className="text-green-400 text-xs">Save 20%</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {plans.map((plan) => {
            const Icon = PLAN_ICONS[plan.id] || Zap;
            const isCurrentPlan = plan.id === currentPlanId;
            const price = billingPeriod === 'annual' 
              ? plan.price_annual_per_month 
              : plan.price_monthly;
            
            return (
              <motion.div
                key={plan.id}
                whileHover={plan.under_development ? undefined : { scale: 1.02 }}
                className={`relative rounded-xl p-6 border transition-colors ${
                  plan.under_development
                    ? 'bg-gray-800/30 border-gray-600 opacity-90'
                    : plan.popular
                      ? 'bg-purple-900/30 border-purple-500'
                      : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                } ${isCurrentPlan ? 'ring-2 ring-purple-500' : ''}`}
              >
                {plan.under_development && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gray-600 text-gray-200 text-xs font-medium rounded-full">
                    Under development
                  </div>
                )}
                {plan.popular && !plan.under_development && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-purple-600 text-white text-xs font-semibold rounded-full">
                    Most Popular
                  </div>
                )}
                
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${PLAN_COLORS[plan.id]} flex items-center justify-center mb-4`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                
                <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
                <p className="text-gray-400 text-sm mt-1 min-h-[40px]">{plan.description}</p>
                
                <div className="mt-4">
                  {price !== null ? (
                    <>
                      <span className="text-3xl font-bold text-white">${price}</span>
                      <span className="text-gray-400">/mo</span>
                    </>
                  ) : (
                    <span className="text-xl font-semibold text-white">Contact Sales</span>
                  )}
                </div>
                
                <ul className="mt-4 space-y-2">
                  {plan.features.slice(0, 5).map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                      <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                
                <button
                  onClick={() => !plan.under_development && !isCurrentPlan && plan.price_monthly !== null && handleCheckout(plan.id)}
                  disabled={plan.under_development || isCurrentPlan || checkoutLoading === plan.id}
                  className={`mt-6 w-full py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                    plan.under_development || isCurrentPlan
                      ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                      : plan.price_monthly === null
                      ? 'bg-gray-700 hover:bg-gray-600 text-white'
                      : 'bg-purple-600 hover:bg-purple-700 text-white'
                  }`}
                >
                  {checkoutLoading === plan.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : plan.under_development ? (
                    'Coming soon'
                  ) : isCurrentPlan ? (
                    'Current Plan'
                  ) : plan.price_monthly === null ? (
                    'Contact Sales'
                  ) : (
                    <>
                      Upgrade <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Upcoming Invoice */}
      {upcomingInvoice && (
        <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-purple-400" />
            Upcoming Invoice
          </h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold text-white">
                ${(upcomingInvoice.amount_due || 0).toFixed(2)}
              </p>
              <p className="text-gray-400 text-sm mt-1">
                Due on {new Date(upcomingInvoice.period_end).toLocaleDateString()}
              </p>
            </div>
            <div className="text-right">
              {upcomingInvoice.lines?.map((line, i) => (
                <p key={i} className="text-gray-400 text-sm">
                  {line.description}: ${(line.amount || 0).toFixed(2)}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Invoice History */}
      {invoices.length > 0 && (
        <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-purple-400" />
            Invoice History
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-gray-400 text-sm border-b border-gray-700">
                  <th className="text-left py-3 px-4">Invoice</th>
                  <th className="text-left py-3 px-4">Date</th>
                  <th className="text-left py-3 px-4">Amount</th>
                  <th className="text-left py-3 px-4">Status</th>
                  <th className="text-right py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="py-3 px-4 text-white font-mono text-sm">{invoice.number}</td>
                    <td className="py-3 px-4 text-gray-300">
                      {new Date(invoice.created).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-white">${invoice.amount.toFixed(2)}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                        invoice.status === 'paid' 
                          ? 'bg-green-500/20 text-green-400' 
                          : invoice.status === 'open'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {invoice.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {invoice.pdf_url && (
                        <a 
                          href={invoice.pdf_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-purple-400 hover:text-purple-300 inline-flex items-center gap-1"
                        >
                          <Download className="w-4 h-4" />
                          PDF
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-red-400">{error}</span>
        </div>
      )}
    </div>
  );
}

export default BillingPage;

