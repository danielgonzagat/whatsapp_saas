'use client';

import {
  ActivatedScreen,
  resolveConnectedPhone,
  resolveProfileName,
  resolveStatusLabel,
} from './WhatsAppExperience.connection-panes';
import { OperationalPanel, WizardPanel } from './WhatsAppExperience.panels';
import {
  type WhatsAppExperienceControllerProps,
  useWhatsAppExperienceController,
} from './WhatsAppExperience.controller';

export type WhatsAppExperienceProps = WhatsAppExperienceControllerProps;

const META_OAUTH_HOSTS = new Set([
  'facebook.com',
  'www.facebook.com',
  'business.facebook.com',
  'instagram.com',
  'www.instagram.com',
  'api.instagram.com',
]);

function isTrustedMetaUrl(value: string): boolean {
  try {
    const target = new URL(value);
    return target.protocol === 'https:' && META_OAUTH_HOSTS.has(target.hostname);
  } catch {
    return false;
  }
}

function navigateMetaUrl(url: string) {
  const link = document.createElement('a');
  link.href = url;
  link.rel = 'noopener noreferrer';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** Whats app experience. */
export default function WhatsAppExperience(props: WhatsAppExperienceProps) {
  const {
    fid,
    step,
    draft,
    error,
    busyKey,
    uploadingCount,
    effectiveConnection,
    selectableProducts,
    selectedIds,
    selectedProductsList,
    fileInputRef,
    showWizard,
    activated,
    summaryData,
    summaryProducts,
    channelData,
    liveFeed,
    setStep,
    toggleSelectAllProducts,
    toggleProduct,
    saveProductsStep,
    updateArsenalItem,
    removeArsenalItem,
    handleMediaUpload,
    goToConfigStep,
    updateConfig,
    toggleFollowUp,
    activateAi,
    connectMeta,
    reconfigure,
    workspaceId,
    operator,
    metaAuthUrl,
    isMetaProvider,
    metaConnecting,
    setMetaConnecting,
  } = useWhatsAppExperienceController(props);

  if (!workspaceId) {return null;}
  if (activated) {return <ActivatedScreen />;}

  if (showWizard) {
    return (
      <WizardPanel
        fid={fid}
        step={step}
        draft={draft}
        error={error}
        busyKey={busyKey}
        uploadingCount={uploadingCount}
        effectiveConnection={effectiveConnection}
        selectableProducts={selectableProducts}
        selectedIds={selectedIds}
        selectedProductsList={selectedProductsList}
        fileInputRef={fileInputRef}
        onSetStep={setStep}
        onToggleSelectAll={toggleSelectAllProducts}
        onToggleProduct={toggleProduct}
        onSaveProducts={() => void saveProductsStep()}
        onUpdateArsenalItem={updateArsenalItem}
        onRemoveArsenalItem={removeArsenalItem}
        onMediaUpload={handleMediaUpload}
        onGoToConfigStep={() => void goToConfigStep()}
        onUpdateConfig={updateConfig}
        onToggleFollowUp={toggleFollowUp}
        onActivateAi={() => void activateAi()}
        metaAuthUrl={metaAuthUrl}
        isMetaProvider={isMetaProvider}
        metaConnecting={metaConnecting}
        onConnectMeta={(url) => {
          void (async () => {
            const targetUrl = url || (await connectMeta());
            if (!targetUrl || !isTrustedMetaUrl(targetUrl)) {
              setMetaConnecting(false);
              return;
            }
            setMetaConnecting(true);
            try {
              navigateMetaUrl(targetUrl);
            } catch {
              setMetaConnecting(false);
            }
          })();
        }}
      />
    );
  }

  const profileName = resolveProfileName(effectiveConnection.pushName, operator);
  const connectedPhone = resolveConnectedPhone(
    effectiveConnection.phoneNumber,
    effectiveConnection.phoneNumberId,
  );
  const statusLabel = resolveStatusLabel(effectiveConnection.status, effectiveConnection.connected);

  return (
    <OperationalPanel
      statusLabel={statusLabel}
      profileName={profileName}
      connectedPhone={connectedPhone}
      channelData={channelData}
      summaryProducts={summaryProducts}
      liveFeed={liveFeed}
      summaryData={summaryData}
      draft={draft}
      workspaceId={workspaceId}
      effectiveConnection={effectiveConnection}
      onReconfigure={reconfigure}
    />
  );
}
