/**
 * ==========================================================================
 * Billing Integration Hooks
 * ==========================================================================
 *
 * Abstract billing integration that works with:
 * - Stripe
 * - Paddle
 * - LemonSqueezy
 * - Custom billing systems
 *
 * Provides hooks for subscription management, usage tracking, and payments.
 */

/// <reference path="./third-party-shims.d.ts" />

// ==========================================================================
// TYPES
// ==========================================================================

export type BillingProvider = 'stripe' | 'paddle' | 'lemonsqueezy' | 'custom';

export type PlanTier = 'free' | 'pro' | 'enterprise' | 'custom';

export interface BillingPlan {
    id: string;
    name: string;
    tier: PlanTier;
    price: number;
    currency: string;
    interval: 'month' | 'year';
    features: string[];
    limits: {
        sites: number;
        pages: number;
        storage: number; // in GB
        bandwidth: number; // in GB
        teamMembers: number;
        customDomains: number;
    };
}

export interface Subscription {
    id: string;
    teamId: string;
    planId: string;
    status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'paused';
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
    trialEnd?: Date;
}

export interface UsageRecord {
    metric: string;
    value: number;
    limit: number;
    percentage: number;
}

export interface PaymentMethod {
    id: string;
    type: 'card' | 'bank_account' | 'paypal';
    last4?: string;
    brand?: string;
    expiryMonth?: number;
    expiryYear?: number;
    isDefault: boolean;
}

export interface Invoice {
    id: string;
    amount: number;
    currency: string;
    status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
    paidAt?: Date;
    dueDate: Date;
    pdfUrl?: string;
}

// ==========================================================================
// BILLING ADAPTER INTERFACE
// ==========================================================================

export interface BillingAdapter {
    /** Get available plans */
    getPlans(): Promise<BillingPlan[]>;

    /** Get current subscription for a team */
    getSubscription(teamId: string): Promise<Subscription | null>;

    /** Create checkout session for subscription */
    createCheckoutSession(
        teamId: string,
        planId: string,
        options?: { successUrl?: string; cancelUrl?: string }
    ): Promise<{ url: string }>;

    /** Create customer portal session */
    createPortalSession(teamId: string): Promise<{ url: string }>;

    /** Cancel subscription */
    cancelSubscription(subscriptionId: string, atPeriodEnd?: boolean): Promise<void>;

    /** Resume canceled subscription */
    resumeSubscription(subscriptionId: string): Promise<void>;

    /** Update subscription plan */
    updateSubscription(subscriptionId: string, planId: string): Promise<Subscription>;

    /** Get usage for a team */
    getUsage(teamId: string): Promise<UsageRecord[]>;

    /** Record usage event */
    recordUsage(teamId: string, metric: string, value: number): Promise<void>;

    /** Get payment methods */
    getPaymentMethods(teamId: string): Promise<PaymentMethod[]>;

    /** Get invoices */
    getInvoices(teamId: string, limit?: number): Promise<Invoice[]>;
}

// ==========================================================================
// STRIPE ADAPTER
// ==========================================================================

export interface StripeConfig {
    secretKey: string;
    publishableKey: string;
    webhookSecret: string;
    priceIds: Record<string, string>;
}

interface StripePrice {
    id: string;
    product: string | { id: string; name: string; metadata: Record<string, string> };
    unit_amount: number | null;
    currency: string;
    recurring?: { interval?: 'month' | 'year' | string };
}

interface StripePaymentMethodItem {
    id: string;
    card?: {
        last4?: string;
        brand?: string;
        exp_month?: number;
        exp_year?: number;
    };
}

interface StripeInvoice {
    id: string;
    amount_due?: number;
    currency?: string;
    status?: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
    status_transitions?: { paid_at?: number | null };
    due_date?: number | null;
    invoice_pdf?: string;
}

interface StripeSubscription {
    id: string;
    customer: string;
    items: {
        data: Array<{
            id: string;
            price: { id: string };
        }>;
    };
    status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'paused';
    current_period_start: number;
    current_period_end: number;
    cancel_at_period_end: boolean;
}

interface StripeSession {
    id: string;
    url?: string | null;
}

interface StripeCustomer {
    id: string;
    invoice_settings?: {
        default_payment_method?: string | null;
    };
}

interface StripeList<T> {
    data: T[];
}

interface StripePricesResponse {
    data: StripePrice[];
}

interface StripePaymentMethodsResponse {
    data: StripePaymentMethodItem[];
}

interface StripeInvoicesResponse {
    data: StripeInvoice[];
}

export async function createStripeAdapter(config: StripeConfig): Promise<BillingAdapter> {
    // Dynamically import Stripe
    const Stripe = await import('stripe')
        .then((m) => m.default)
        .catch(() => {
            throw new Error(
                'stripe package is not installed. Install "stripe" to enable billing integration.'
            );
        });
    const stripe = new Stripe(config.secretKey, { apiVersion: '2023-10-16' });

    return {
        async getPlans(): Promise<BillingPlan[]> {
            const prices = await stripe.prices.list({
                active: true,
                expand: ['data.product'],
            }) as StripePricesResponse;

            return prices.data.map((price: StripePrice) => {
                const product =
                    typeof price.product === 'string'
                        ? {
                              id: price.product,
                              name: price.product,
                              metadata: {},
                          }
                        : price.product;

                const rawFeatures = product.metadata?.features || '[]';
                const rawSites = product.metadata?.sites || '1';
                const rawPages = product.metadata?.pages || '10';
                const rawStorage = product.metadata?.storage || '1';
                const rawBandwidth = product.metadata?.bandwidth || '10';
                const rawTeamMembers = product.metadata?.teamMembers || '1';
                const rawCustomDomains = product.metadata?.customDomains || '0';

                let parsedFeatures: string[] = [];
                try {
                    parsedFeatures = JSON.parse(rawFeatures);
                } catch {
                    parsedFeatures = [];
                }

                return {
                    id: price.id,
                    name: product.name,
                    tier: (product.metadata.tier as PlanTier) || 'pro',
                    price: (price.unit_amount || 0) / 100,
                    currency: price.currency.toUpperCase(),
                    interval: price.recurring?.interval === 'year' ? 'year' : 'month',
                    features: parsedFeatures,
                    limits: {
                        sites: parseInt(rawSites, 10),
                        pages: parseInt(rawPages, 10),
                        storage: parseInt(rawStorage, 10),
                        bandwidth: parseInt(rawBandwidth, 10),
                        teamMembers: parseInt(rawTeamMembers, 10),
                        customDomains: parseInt(rawCustomDomains, 10),
                    },
                };
            });
        },

        async getSubscription(teamId: string): Promise<Subscription | null> {
            const subscriptions = await stripe.subscriptions.list({
                customer: teamId,
                status: 'all',
                limit: 1,
            }) as StripeList<StripeSubscription>;

            const sub = subscriptions.data[0];
            if (!sub) return null;

            return {
                id: sub.id,
                teamId,
                planId: sub.items.data[0]?.price.id || '',
                status: sub.status as Subscription['status'],
                currentPeriodStart: new Date(sub.current_period_start * 1000),
                currentPeriodEnd: new Date(sub.current_period_end * 1000),
                cancelAtPeriodEnd: sub.cancel_at_period_end,
                trialEnd: undefined,
            };
        },

        async createCheckoutSession(teamId: string, planId: string, options?: { successUrl?: string; cancelUrl?: string }) {
            const session = await stripe.checkout.sessions.create({
                customer: teamId,
                mode: 'subscription',
                line_items: [{ price: planId, quantity: 1 }],
                return_url: options?.successUrl || `${process.env.APP_URL}/billing`,
                success_url: options?.successUrl || `${process.env.APP_URL}/billing/success`,
                cancel_url: options?.cancelUrl || `${process.env.APP_URL}/billing`,
            }) as StripeSession;

            return { url: session.url || '' };
        },

        async createPortalSession(teamId: string) {
            const session = await stripe.billingPortal.sessions.create({
                customer: teamId,
                return_url: `${process.env.APP_URL}/billing`,
            }) as StripeSession;

            return { url: session.url || '' };
        },

        async cancelSubscription(subscriptionId: string, atPeriodEnd = true) {
            if (atPeriodEnd) {
                await stripe.subscriptions.update(subscriptionId, {
                    cancel_at_period_end: true,
                });
            } else {
                await stripe.subscriptions.cancel(subscriptionId);
            }
        },

        async resumeSubscription(subscriptionId: string) {
            await stripe.subscriptions.update(subscriptionId, {
                cancel_at_period_end: false,
            });
        },

        async updateSubscription(subscriptionId: string, planId: string) {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId) as StripeSubscription;
            const updated = await stripe.subscriptions.update(subscriptionId, {
                items: [
                    {
                        id: subscription.items.data[0].id,
                        price: planId,
                    },
                ],
                proration_behavior: 'always_invoice',
            }) as StripeSubscription;

            return {
                id: updated.id,
                teamId: updated.customer,
                planId,
                status: updated.status as Subscription['status'],
                currentPeriodStart: new Date(updated.current_period_start * 1000),
                currentPeriodEnd: new Date(updated.current_period_end * 1000),
                cancelAtPeriodEnd: updated.cancel_at_period_end,
            };
        },

        async getUsage(teamId: string): Promise<UsageRecord[]> {
            // This would typically come from your own database
            // tracking usage against the plan limits
            return [
                { metric: 'sites', value: 2, limit: 5, percentage: 40 },
                { metric: 'pages', value: 15, limit: 50, percentage: 30 },
                { metric: 'storage', value: 1.5, limit: 10, percentage: 15 },
                { metric: 'bandwidth', value: 25, limit: 100, percentage: 25 },
            ];
        },

        async recordUsage(_teamId: string, _metric: string, _value: number): Promise<void> {
            void _teamId;
            void _metric;
            void _value;
            return;
        },

        async getPaymentMethods(teamId: string): Promise<PaymentMethod[]> {
            const methods = await stripe.paymentMethods.list({
                customer: teamId,
                type: 'card',
            }) as StripePaymentMethodsResponse;

            const customer = await stripe.customers.retrieve(teamId) as StripeCustomer;
            const defaultMethodId =
                customer.invoice_settings?.default_payment_method &&
                typeof customer.invoice_settings.default_payment_method === 'string'
                    ? customer.invoice_settings.default_payment_method
                    : null;

            return methods.data.map((pm: StripePaymentMethodItem) => ({
                id: pm.id,
                type: 'card',
                last4: pm.card?.last4,
                brand: pm.card?.brand,
                expiryMonth: pm.card?.exp_month,
                expiryYear: pm.card?.exp_year,
                isDefault: pm.id === (defaultMethodId || ''),
            }));
        },

        async getInvoices(teamId: string, limit = 10): Promise<Invoice[]> {
            const invoices = await stripe.invoices.list({
                customer: teamId,
                limit,
            }) as StripeInvoicesResponse;

            return invoices.data.map((inv: StripeInvoice) => ({
                id: inv.id,
                amount: (inv.amount_due || 0) / 100,
                currency: (inv.currency || 'usd').toUpperCase(),
                status: (inv.status || 'draft') as Invoice['status'],
                paidAt: inv.status_transitions?.paid_at
                    ? new Date(inv.status_transitions.paid_at * 1000)
                    : undefined,
                dueDate: inv.due_date ? new Date(inv.due_date * 1000) : new Date(),
                pdfUrl: inv.invoice_pdf || undefined,
            }));
        },
    };
}

// ==========================================================================
// REACT HOOKS
// ==========================================================================

import { useState, useEffect, useCallback } from 'react';

interface UseBillingOptions {
    adapter: BillingAdapter;
    teamId: string;
}

export function useBilling({ adapter, teamId }: UseBillingOptions) {
    const [subscription, setSubscription] = useState<Subscription | null>(null);
    const [plans, setPlans] = useState<BillingPlan[]>([]);
    const [usage, setUsage] = useState<UsageRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        async function loadBillingData() {
            setIsLoading(true);
            setError(null);

            try {
                const [sub, allPlans, teamUsage] = await Promise.all([
                    adapter.getSubscription(teamId),
                    adapter.getPlans(),
                    adapter.getUsage(teamId),
                ]);

                setSubscription(sub);
                setPlans(allPlans);
                setUsage(teamUsage);
            } catch (err) {
                setError(err as Error);
            } finally {
                setIsLoading(false);
            }
        }

        loadBillingData();
    }, [adapter, teamId]);

    const openCheckout = useCallback(
        async (planId: string) => {
            const { url } = await adapter.createCheckoutSession(teamId, planId);
            window.location.href = url;
        },
        [adapter, teamId]
    );

    const openPortal = useCallback(async () => {
        const { url } = await adapter.createPortalSession(teamId);
        window.location.href = url;
    }, [adapter, teamId]);

    const cancelSubscription = useCallback(
        async (atPeriodEnd = true) => {
            if (!subscription) return;
            await adapter.cancelSubscription(subscription.id, atPeriodEnd);
            const updated = await adapter.getSubscription(teamId);
            setSubscription(updated);
        },
        [adapter, teamId, subscription]
    );

    const resumeSubscription = useCallback(async () => {
        if (!subscription) return;
        await adapter.resumeSubscription(subscription.id);
        const updated = await adapter.getSubscription(teamId);
        setSubscription(updated);
    }, [adapter, teamId, subscription]);

    const updatePlan = useCallback(
        async (planId: string) => {
            if (!subscription) return;
            const updated = await adapter.updateSubscription(subscription.id, planId);
            setSubscription(updated);
        },
        [adapter, subscription]
    );

    const currentPlan = plans.find((p) => p.id === subscription?.planId);

    return {
        subscription,
        plans,
        usage,
        currentPlan,
        isLoading,
        error,
        openCheckout,
        openPortal,
        cancelSubscription,
        resumeSubscription,
        updatePlan,
    };
}

export function usePaymentMethods({ adapter, teamId }: UseBillingOptions) {
    const [methods, setMethods] = useState<PaymentMethod[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function load() {
            setIsLoading(true);
            const data = await adapter.getPaymentMethods(teamId);
            setMethods(data);
            setIsLoading(false);
        }
        load();
    }, [adapter, teamId]);

    return { methods, isLoading };
}

export function useInvoices({ adapter, teamId }: UseBillingOptions) {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function load() {
            setIsLoading(true);
            const data = await adapter.getInvoices(teamId);
            setInvoices(data);
            setIsLoading(false);
        }
        load();
    }, [adapter, teamId]);

    return { invoices, isLoading };
}

export default { createStripeAdapter, useBilling, usePaymentMethods, useInvoices };
