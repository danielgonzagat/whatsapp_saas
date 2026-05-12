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

export { QRCodePane } from './WhatsAppExperience.qr-pane';

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
    qrCode,
    scanProgress,
    uploadingCount,
    effectiveConnection,
    isWahaProvider,
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
    refreshQrCode,
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
        qrCode={qrCode}
        scanProgress={scanProgress}
        uploadingCount={uploadingCount}
        effectiveConnection={effectiveConnection}
        isWahaProvider={isWahaProvider}
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
        onRefreshQrCode={() => void refreshQrCode()}
        metaAuthUrl={metaAuthUrl}
        isMetaProvider={isMetaProvider}
        metaConnecting={metaConnecting}
        onConnectMeta={(url) => {
          if (!isTrustedMetaUrl(url)) {
            setMetaConnecting(false);
            return;
          }
          setMetaConnecting(true);
          try {
            navigateMetaUrl(url);
          } catch {
            setMetaConnecting(false);
          }
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
