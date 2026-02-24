declare module 'stripe' {
    interface StripeApiMode {
        readonly list: (args?: Record<string, unknown>) => Promise<{
            data: unknown[];
        }>;

        readonly retrieve: (id: string) => Promise<unknown>;
        readonly update: (id: string, payload: unknown) => Promise<unknown>;
    }

    interface StripeObject {
        id: string;
    }

    interface StripeList<T> {
        data: T[];
        has_more?: boolean;
        url?: string;
    }

    interface StripePrice {
        id: string;
        product: string | StripeProduct;
        unit_amount: number | null;
        currency: string;
        recurring?: {
            interval?: 'month' | 'year' | string;
        };
    }

    interface StripeProduct {
        id: string;
        name: string;
        metadata: Record<string, string>;
    }

    interface StripeSubscription {
        id: string;
        items: {
            data: Array<{ price: StripePrice; id: string }>;
        };
        status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'paused';
        customer: string;
        current_period_start: number;
        current_period_end: number;
        cancel_at_period_end: boolean;
        trial_end?: number | null;
    }

    interface StripeSession {
        id: string;
        url?: string | null;
    }

    interface StripeWebhookSessionCreate {
        customer: string;
        return_url: string;
        line_items: Array<{ price: string; quantity: number }>;
        mode: 'subscription';
        success_url: string;
        cancel_url: string;
    }

    interface StripeCheckoutSessionList {
        data: StripeSession[];
        has_more: boolean;
        url: string;
    }

    interface StripeInvoice {
        id: string;
        amount_due: number;
        currency: string;
        status: 'paid' | 'open' | 'draft' | 'void' | 'uncollectible';
        status_transitions?: { paid_at?: number | null };
        due_date: number | null;
        invoice_pdf?: string;
    }

    interface StripeInvoiceList {
        data: StripeInvoice[];
        has_more: boolean;
    }

    interface StripePaymentMethod {
        id: string;
        card?: {
            last4?: string;
            brand?: string;
            exp_month?: number;
            exp_year?: number;
        };
    }

    interface StripePaymentMethodList {
        data: StripePaymentMethod[];
    }

    interface StripeCustomer {
        invoice_settings?: {
            default_payment_method?: string;
        };
    }

    interface StripeCustomers {
        list: (args: {
            email?: string;
            limit?: number;
            status?: 'all';
        }) => Promise<{ data: StripeCustomer[] }>;
        retrieve: (id: string) => Promise<StripeCustomer>;
    }

    interface StripeInvoices {
        list: (args: { customer: string; limit?: number }) => Promise<StripeInvoiceList>;
    }

    interface StripePaymentMethods {
        list: (args: { customer: string; type: string }) => Promise<StripePaymentMethodList>;
    }

    interface StripeSubscriptions {
        list: (args: { customer: string; status: string; limit?: number }) => Promise<StripeList<StripeSubscription>>;
        retrieve: (id: string) => Promise<StripeSubscription>;
        cancel: (id: string) => Promise<StripeSubscription>;
        update: (id: string, payload: {
            items?: Array<{ id: string; price: string }>;
            cancel_at_period_end?: boolean;
            proration_behavior?: string;
        }) => Promise<StripeSubscription>;
    }

    interface StripePrices {
        list: (args: { active: boolean; expand: string[] }) => Promise<StripeList<StripePrice>>;
    }

    interface StripeBillingPortal {
        sessions: {
            create: (args: { customer: string; return_url: string }) => Promise<StripeSession>;
        };
    }

    interface StripeCheckout {
        sessions: {
            create: (args: StripeWebhookSessionCreate) => Promise<StripeSession>;
        };
    }

    interface StripeObjectClient {
        prices: StripePrices;
        subscriptions: StripeSubscriptions;
        customers: StripeCustomers;
        paymentMethods: StripePaymentMethods;
        invoices: StripeInvoices;
        checkout: StripeCheckout;
        billingPortal: StripeBillingPortal;
    }

    interface StripeConstructor {
        new (apiKey: string, config: { apiVersion: string }): StripeObjectClient;
    }

    export interface Stripe extends StripeObjectClient, StripeObject {}

    const Stripe: StripeConstructor;
    export default Stripe;
}
