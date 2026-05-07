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
  } = useWhatsAppExperienceController(props);

  if (!workspaceId) return null;
  if (activated) return <ActivatedScreen />;

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
