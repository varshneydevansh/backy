export interface BackyNewsletterCampaignInput {subject:string;text:string;formId?:string|null}
export interface BackyNewsletterCampaign extends BackyNewsletterCampaignInput {
 id:string;siteId:string;state:'draft'|'scheduled'|'queued'|'processing'|'completed'|'cancelled';version:number;scheduledAt:string|null;createdAt:string;updatedAt:string;recipientCount:number;actorId:string|null;
}
export interface BackyNewsletterCampaignDelivery {
 id:string;siteId:string;campaignId:string;contactId:string|null;email:string;
 state:'pending'|'processing'|'accepted'|'delivered'|'failed'|'uncertain'|'suppressed'|'cancelled'|'bounced'|'complained';providerMessageId:string|null;errorCode:string|null;createdAt:string;updatedAt:string;
}
export interface BackyNewsletterCampaignReadiness {
 configured:boolean;provider:'smtp'|'unavailable';blockers:string[];dailyLimit:number;maxRecipients:number;processing:'authenticated-invoker-required';automaticFeedback:'signed-bridge-required';smtpAcceptanceIsDelivery:false;uncertainAutoRetry:false;
}
export interface BackyNewsletterCampaignListData {
 schemaVersion:'backy.newsletter-campaigns.v1';campaigns:BackyNewsletterCampaign[];pagination:{total:number;limit:number;offset:number;hasMore:boolean};readiness:BackyNewsletterCampaignReadiness;
}
export interface BackyNewsletterCampaignData {
 schemaVersion:'backy.newsletter-campaign.v1';campaign:BackyNewsletterCampaign;deliveries?:BackyNewsletterCampaignDelivery[];counts?:Partial<Record<BackyNewsletterCampaignDelivery['state'],number>>;readiness?:BackyNewsletterCampaignReadiness;processing?:'authenticated-invoker-required';inFlightAttemptsMayComplete?:boolean;feedbackSource?:'operator-evidence';
}
export interface BackyNewsletterProcessingData {schemaVersion:'backy.newsletter-processing.v1';attempted:boolean;deliveryId?:string;state?:'accepted'|'failed'|'uncertain';completionWarning?:'NEWSLETTER_DURABLE_OUTCOME_PENDING'}
