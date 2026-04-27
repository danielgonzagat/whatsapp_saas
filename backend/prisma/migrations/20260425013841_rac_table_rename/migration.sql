-- Forward-Only @@map RAC rename
-- Renames every legacy unprefixed table to its RAC_<ModelName>
-- equivalent. Uses IF EXISTS to tolerate drift between schema and
-- historical migrations. Prisma client model names are unchanged;
-- only the underlying table names are.

ALTER TABLE IF EXISTS "Workspace" RENAME TO "RAC_Workspace";
ALTER TABLE IF EXISTS "FlowTemplate" RENAME TO "RAC_FlowTemplate";
ALTER TABLE IF EXISTS "Agent" RENAME TO "RAC_Agent";
ALTER TABLE IF EXISTS "CookieConsent" RENAME TO "RAC_CookieConsent";
ALTER TABLE IF EXISTS "Contact" RENAME TO "RAC_Contact";
ALTER TABLE IF EXISTS "ContactInsight" RENAME TO "RAC_ContactInsight";
ALTER TABLE IF EXISTS "SystemInsight" RENAME TO "RAC_SystemInsight";
ALTER TABLE IF EXISTS "Tag" RENAME TO "RAC_Tag";
ALTER TABLE IF EXISTS "Variable" RENAME TO "RAC_Variable";
ALTER TABLE IF EXISTS "Flow" RENAME TO "RAC_Flow";
ALTER TABLE IF EXISTS "FlowVersion" RENAME TO "RAC_FlowVersion";
ALTER TABLE IF EXISTS "FlowExecution" RENAME TO "RAC_FlowExecution";
ALTER TABLE IF EXISTS "Campaign" RENAME TO "RAC_Campaign";
ALTER TABLE IF EXISTS "Conversation" RENAME TO "RAC_Conversation";
ALTER TABLE IF EXISTS "Message" RENAME TO "RAC_Message";
ALTER TABLE IF EXISTS "ScrapingJob" RENAME TO "RAC_ScrapingJob";
ALTER TABLE IF EXISTS "ScrapedLead" RENAME TO "RAC_ScrapedLead";
ALTER TABLE IF EXISTS "KnowledgeBase" RENAME TO "RAC_KnowledgeBase";
ALTER TABLE IF EXISTS "KnowledgeSource" RENAME TO "RAC_KnowledgeSource";
ALTER TABLE IF EXISTS "Vector" RENAME TO "RAC_Vector";
ALTER TABLE IF EXISTS "Integration" RENAME TO "RAC_Integration";
ALTER TABLE IF EXISTS "MonitoredGroup" RENAME TO "RAC_MonitoredGroup";
ALTER TABLE IF EXISTS "GroupMember" RENAME TO "RAC_GroupMember";
ALTER TABLE IF EXISTS "BannedKeyword" RENAME TO "RAC_BannedKeyword";
ALTER TABLE IF EXISTS "Subscription" RENAME TO "RAC_Subscription";
ALTER TABLE IF EXISTS "Invoice" RENAME TO "RAC_Invoice";
ALTER TABLE IF EXISTS "ExternalPaymentLink" RENAME TO "RAC_ExternalPaymentLink";
ALTER TABLE IF EXISTS "GroupLauncher" RENAME TO "RAC_GroupLauncher";
ALTER TABLE IF EXISTS "LaunchGroup" RENAME TO "RAC_LaunchGroup";
ALTER TABLE IF EXISTS "MediaJob" RENAME TO "RAC_MediaJob";
ALTER TABLE IF EXISTS "Pipeline" RENAME TO "RAC_Pipeline";
ALTER TABLE IF EXISTS "Stage" RENAME TO "RAC_Stage";
ALTER TABLE IF EXISTS "Deal" RENAME TO "RAC_Deal";
ALTER TABLE IF EXISTS "VoiceProfile" RENAME TO "RAC_VoiceProfile";
ALTER TABLE IF EXISTS "VoiceJob" RENAME TO "RAC_VoiceJob";
ALTER TABLE IF EXISTS "RefreshToken" RENAME TO "RAC_RefreshToken";
ALTER TABLE IF EXISTS "DeviceToken" RENAME TO "RAC_DeviceToken";
ALTER TABLE IF EXISTS "PasswordResetToken" RENAME TO "RAC_PasswordResetToken";
ALTER TABLE IF EXISTS "MagicLinkToken" RENAME TO "RAC_MagicLinkToken";
ALTER TABLE IF EXISTS "SocialAccount" RENAME TO "RAC_SocialAccount";
ALTER TABLE IF EXISTS "DataDeletionRequest" RENAME TO "RAC_DataDeletionRequest";
ALTER TABLE IF EXISTS "RiscEvent" RENAME TO "RAC_RiscEvent";
ALTER TABLE IF EXISTS "Invitation" RENAME TO "RAC_Invitation";
ALTER TABLE IF EXISTS "Queue" RENAME TO "RAC_Queue";
ALTER TABLE IF EXISTS "AuditLog" RENAME TO "RAC_AuditLog";
ALTER TABLE IF EXISTS "AutopilotEvent" RENAME TO "RAC_AutopilotEvent";
ALTER TABLE IF EXISTS "AutonomyRun" RENAME TO "RAC_AutonomyRun";
ALTER TABLE IF EXISTS "AutonomyExecution" RENAME TO "RAC_AutonomyExecution";
ALTER TABLE IF EXISTS "AgentWorkItem" RENAME TO "RAC_AgentWorkItem";
ALTER TABLE IF EXISTS "ApprovalRequest" RENAME TO "RAC_ApprovalRequest";
ALTER TABLE IF EXISTS "InputCollectionSession"
    RENAME TO "RAC_InputCollectionSession";
ALTER TABLE IF EXISTS "AccountProofSnapshot"
    RENAME TO "RAC_AccountProofSnapshot";
ALTER TABLE IF EXISTS "ConversationProofSnapshot"
    RENAME TO "RAC_ConversationProofSnapshot";
ALTER TABLE IF EXISTS "WebhookSubscription" RENAME TO "RAC_WebhookSubscription";
ALTER TABLE IF EXISTS "WebhookEvent" RENAME TO "RAC_WebhookEvent";
ALTER TABLE IF EXISTS "ApiKey" RENAME TO "RAC_ApiKey";
ALTER TABLE IF EXISTS "Persona" RENAME TO "RAC_Persona";
ALTER TABLE IF EXISTS "KloelMessage" RENAME TO "RAC_KloelMessage";
ALTER TABLE IF EXISTS "KloelMemory" RENAME TO "RAC_KloelMemory";
ALTER TABLE IF EXISTS "Product" RENAME TO "RAC_Product";
ALTER TABLE IF EXISTS "KloelLead" RENAME TO "RAC_KloelLead";
ALTER TABLE IF EXISTS "KloelConversation" RENAME TO "RAC_KloelConversation";
ALTER TABLE IF EXISTS "ChatThread" RENAME TO "RAC_ChatThread";
ALTER TABLE IF EXISTS "ChatMessage" RENAME TO "RAC_ChatMessage";
ALTER TABLE IF EXISTS "KloelSale" RENAME TO "RAC_KloelSale";
ALTER TABLE IF EXISTS "KloelWallet" RENAME TO "RAC_KloelWallet";
ALTER TABLE IF EXISTS "KloelWalletTransaction"
    RENAME TO "RAC_KloelWalletTransaction";
ALTER TABLE IF EXISTS "KloelWalletLedger" RENAME TO "RAC_KloelWalletLedger";
ALTER TABLE IF EXISTS "Document" RENAME TO "RAC_Document";
ALTER TABLE IF EXISTS "FollowUp" RENAME TO "RAC_FollowUp";
ALTER TABLE IF EXISTS "ProductPlan" RENAME TO "RAC_ProductPlan";
ALTER TABLE IF EXISTS "ProductCheckout" RENAME TO "RAC_ProductCheckout";
ALTER TABLE IF EXISTS "ProductCoupon" RENAME TO "RAC_ProductCoupon";
ALTER TABLE IF EXISTS "ProductReview" RENAME TO "RAC_ProductReview";
ALTER TABLE IF EXISTS "ProductCommission" RENAME TO "RAC_ProductCommission";
ALTER TABLE IF EXISTS "ProductUrl" RENAME TO "RAC_ProductUrl";
-- not in migration history
ALTER TABLE IF EXISTS "ProductCampaign"
    RENAME TO "RAC_ProductCampaign";
ALTER TABLE IF EXISTS "ProductAIConfig" RENAME TO "RAC_ProductAIConfig";
ALTER TABLE IF EXISTS "MemberArea" RENAME TO "RAC_MemberArea";
-- not in migration history
ALTER TABLE IF EXISTS "MemberEnrollment"
    RENAME TO "RAC_MemberEnrollment";
ALTER TABLE IF EXISTS "MemberModule" RENAME TO "RAC_MemberModule";
ALTER TABLE IF EXISTS "MemberLesson" RENAME TO "RAC_MemberLesson";
ALTER TABLE IF EXISTS "AffiliateProduct" RENAME TO "RAC_AffiliateProduct";
ALTER TABLE IF EXISTS "AffiliateRequest" RENAME TO "RAC_AffiliateRequest";
ALTER TABLE IF EXISTS "AffiliateLink" RENAME TO "RAC_AffiliateLink";
ALTER TABLE IF EXISTS "KloelSite" RENAME TO "RAC_KloelSite";
ALTER TABLE IF EXISTS "KloelDesign" RENAME TO "RAC_KloelDesign";
ALTER TABLE IF EXISTS "CustomerSubscription"
    RENAME TO "RAC_CustomerSubscription";
-- not in migration history
ALTER TABLE IF EXISTS "AdRule" RENAME TO "RAC_AdRule";
ALTER TABLE IF EXISTS "PhysicalOrder" RENAME TO "RAC_PhysicalOrder";
ALTER TABLE IF EXISTS "Payment" RENAME TO "RAC_Payment";
ALTER TABLE IF EXISTS "CollaboratorInvite" RENAME TO "RAC_CollaboratorInvite";
ALTER TABLE IF EXISTS "AffiliatePartner" RENAME TO "RAC_AffiliatePartner";
ALTER TABLE IF EXISTS "PartnerMessage" RENAME TO "RAC_PartnerMessage";
ALTER TABLE IF EXISTS "BankAccount" RENAME TO "RAC_BankAccount";
ALTER TABLE IF EXISTS "WalletAnticipation" RENAME TO "RAC_WalletAnticipation";
ALTER TABLE IF EXISTS "CheckoutProductPlan" RENAME TO "RAC_CheckoutProductPlan";
ALTER TABLE IF EXISTS "CheckoutPlanLink" RENAME TO "RAC_CheckoutPlanLink";
ALTER TABLE IF EXISTS "CheckoutConfig" RENAME TO "RAC_CheckoutConfig";
ALTER TABLE IF EXISTS "OrderBump" RENAME TO "RAC_OrderBump";
ALTER TABLE IF EXISTS "Upsell" RENAME TO "RAC_Upsell";
ALTER TABLE IF EXISTS "CheckoutCoupon" RENAME TO "RAC_CheckoutCoupon";
ALTER TABLE IF EXISTS "CheckoutPixel" RENAME TO "RAC_CheckoutPixel";
ALTER TABLE IF EXISTS "CheckoutOrder" RENAME TO "RAC_CheckoutOrder";
ALTER TABLE IF EXISTS "CheckoutSocialLead" RENAME TO "RAC_CheckoutSocialLead";
ALTER TABLE IF EXISTS "CheckoutPayment" RENAME TO "RAC_CheckoutPayment";
ALTER TABLE IF EXISTS "UpsellOrder" RENAME TO "RAC_UpsellOrder";
ALTER TABLE IF EXISTS "KycDocument" RENAME TO "RAC_KycDocument";
ALTER TABLE IF EXISTS "FiscalData" RENAME TO "RAC_FiscalData";
ALTER TABLE IF EXISTS "OrderAlert" RENAME TO "RAC_OrderAlert";
-- not in migration history
ALTER TABLE IF EXISTS "AdSpend" RENAME TO "RAC_AdSpend";
-- not in migration history
ALTER TABLE IF EXISTS "Webinar" RENAME TO "RAC_Webinar";
ALTER TABLE IF EXISTS "MetaConnection" RENAME TO "RAC_MetaConnection";
