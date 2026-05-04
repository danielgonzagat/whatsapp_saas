import type { PulseManifestFlowSpec, PulseFlowResult } from '../../../types';
import type { FlowRuntimeContext } from './types-and-config';
import {
  isTruthyEnv,
  getReplayPhone,
  getConfiguredWithdrawalAmount,
  buildReplayProfilePayload,
  round2,
  compactSummary,
  isProvisioningGap,
  replayEnabled,
} from './mode-helpers';
import {
  ensureAuth,
  fetchJsonWithAuth,
  buildMissingEvidenceResult,
  buildFailureResult,
  buildPassedResult,
} from './http-helpers';

export async function runWalletWithdrawalFlow(
  spec: PulseManifestFlowSpec,
  context: FlowRuntimeContext,
): Promise<PulseFlowResult> {
  try {
    const auth = await ensureAuth(context);
    const amount = getConfiguredWithdrawalAmount(context.manifest);
    const replayMode = !isTruthyEnv(process.env.PULSE_ALLOW_REAL_WITHDRAWAL);
    const replayMarker = `pulse-wallet-${Date.now().toString(36)}`;
    const replayPhone = getReplayPhone(context.manifest);

    if (replayMode) {
      const profileRes = await fetchJsonWithAuth(
        'PUT',
        '/kyc/profile',
        auth.token,
        buildReplayProfilePayload(context.manifest, auth, replayPhone, replayMarker),
      );

      if (!profileRes.ok) {
        return buildFailureResult(
          spec,
          `wallet-withdrawal replay could not update KYC profile: ${compactSummary(profileRes.body) || `HTTP ${profileRes.status}`}.`,
          { httpStatus: profileRes.status },
          { smokeExecuted: false, replayExecuted: true },
        );
      }

      const fiscalRes = await fetchJsonWithAuth('PUT', '/kyc/fiscal', auth.token, {
        type: 'PF',
        cpf: '12345678909',
        fullName: 'Pulse Replay Wallet',
        cep: '01310930',
        city: 'Sao Paulo',
        state: 'SP',
        street: 'Avenida Paulista',
        number: '1000',
        neighborhood: 'Bela Vista',
      });

      if (!fiscalRes.ok) {
        return buildFailureResult(
          spec,
          `wallet-withdrawal replay could not update KYC fiscal data: ${compactSummary(fiscalRes.body) || `HTTP ${fiscalRes.status}`}.`,
          { httpStatus: fiscalRes.status },
          { smokeExecuted: false, replayExecuted: true },
        );
      }

      const bankRes = await fetchJsonWithAuth('PUT', '/kyc/bank', auth.token, {
        bankName: 'PULSE Replay Bank',
        bankCode: '260',
        agency: '0001',
        account: String(Date.now()).slice(-6),
        accountType: 'CHECKING',
        pixKey: `${replayMarker}@pulse.kloel`,
        pixKeyType: 'EMAIL',
        holderName: 'Pulse Replay Wallet',
        holderDocument: '12345678909',
        isDefault: true,
      });

      if (!bankRes.ok) {
        return buildFailureResult(
          spec,
          `wallet-withdrawal replay could not provision banking data: ${compactSummary(bankRes.body) || `HTTP ${bankRes.status}`}.`,
          { httpStatus: bankRes.status },
          { smokeExecuted: false, replayExecuted: true },
        );
      }

      const autoCheckRes = await fetchJsonWithAuth('POST', '/kyc/auto-check', auth.token, {});
      const statusRes = await fetchJsonWithAuth('GET', '/kyc/status', auth.token);
      const completionRes = await fetchJsonWithAuth('GET', '/kyc/completion', auth.token);
      const completion = Number(completionRes.body?.percentage);
      const kycStatus = String(statusRes.body?.kycStatus || '');
      const approved = autoCheckRes.body?.approved === true || kycStatus === 'approved';

      if (!approved) {
        return buildFailureResult(
          spec,
          `wallet-withdrawal replay could not approve KYC automatically. Current status: ${kycStatus || 'unknown'} (${Number.isFinite(completion) ? completion : 'n/a'}%).`,
          {
            kycStatus: kycStatus || 'unknown',
            kycCompletion: Number.isFinite(completion) ? completion : -1,
          },
          { smokeExecuted: false, replayExecuted: true },
        );
      }
    }

    const balanceRes = await fetchJsonWithAuth(
      'GET',
      `/kloel/wallet/${auth.workspaceId}/balance`,
      auth.token,
    );

    if (!balanceRes.ok) {
      return buildMissingEvidenceResult(
        spec,
        `wallet-withdrawal could not read balance: ${compactSummary(balanceRes.body) || `HTTP ${balanceRes.status}`}.`,
        { httpStatus: balanceRes.status },
      );
    }

    let availableBefore = Number(balanceRes.body?.available);
    let seededReplayCredit = false;
    let replayCreditTransactionId = '';

    if (replayMode && (!Number.isFinite(availableBefore) || availableBefore < amount)) {
      const saleAmount = round2(Math.max(amount + 5, amount * 1.5));
      const processSaleRes = await fetchJsonWithAuth(
        'POST',
        `/kloel/wallet/${auth.workspaceId}/process-sale`,
        auth.token,
        {
          amount: saleAmount,
          saleId: replayMarker,
          description: `PULSE replay credit ${replayMarker}`,
        },
      );

      if (!processSaleRes.ok || !processSaleRes.body?.transactionId) {
        return buildFailureResult(
          spec,
          `wallet-withdrawal replay could not seed wallet balance: ${compactSummary(processSaleRes.body) || `HTTP ${processSaleRes.status}`}.`,
          { httpStatus: processSaleRes.status, requestedAmount: amount },
          { smokeExecuted: false, replayExecuted: true },
        );
      }

      replayCreditTransactionId = String(processSaleRes.body.transactionId);
      const confirmRes = await fetchJsonWithAuth(
        'POST',
        `/kloel/wallet/${auth.workspaceId}/confirm/${replayCreditTransactionId}`,
        auth.token,
        {},
      );

      if (!confirmRes.ok || confirmRes.body?.status !== 'confirmed') {
        return buildFailureResult(
          spec,
          `wallet-withdrawal replay could not confirm seeded wallet credit: ${compactSummary(confirmRes.body) || `HTTP ${confirmRes.status}`}.`,
          { httpStatus: confirmRes.status, transactionId: replayCreditTransactionId },
          { smokeExecuted: false, replayExecuted: true },
        );
      }

      seededReplayCredit = true;
      const replayBalanceRes = await fetchJsonWithAuth(
        'GET',
        `/kloel/wallet/${auth.workspaceId}/balance`,
        auth.token,
      );
      if (!replayBalanceRes.ok) {
        return buildFailureResult(
          spec,
          `wallet-withdrawal replay seeded balance but could not read it back: ${compactSummary(replayBalanceRes.body) || `HTTP ${replayBalanceRes.status}`}.`,
          { httpStatus: replayBalanceRes.status, transactionId: replayCreditTransactionId },
          { smokeExecuted: false, replayExecuted: true },
        );
      }
      availableBefore = Number(replayBalanceRes.body?.available);
    }

    if (!Number.isFinite(availableBefore) || availableBefore < amount) {
      return buildMissingEvidenceResult(
        spec,
        `wallet-withdrawal requires available balance >= ${amount}. Current available balance: ${Number.isFinite(availableBefore) ? availableBefore : 'unavailable'}.`,
        {
          availableBefore: Number.isFinite(availableBefore) ? availableBefore : -1,
          requestedAmount: amount,
        },
        { smokeExecuted: false, replayExecuted: replayMode || replayEnabled(spec) },
      );
    }

    const accountsRes = await fetchJsonWithAuth(
      'GET',
      `/kloel/wallet/${auth.workspaceId}/bank-accounts`,
      auth.token,
    );
    if (!accountsRes.ok) {
      return buildMissingEvidenceResult(
        spec,
        `wallet-withdrawal could not read bank accounts: ${compactSummary(accountsRes.body) || `HTTP ${accountsRes.status}`}.`,
        { httpStatus: accountsRes.status },
      );
    }

    const bankAccounts = Array.isArray(accountsRes.body?.accounts)
      ? (accountsRes.body.accounts as Array<Record<string, unknown>>)
      : [];
    let createdBankAccount = false;

    if (bankAccounts.length === 0) {
      const addAccountRes = await fetchJsonWithAuth(
        'POST',
        `/kloel/wallet/${auth.workspaceId}/bank-accounts`,
        auth.token,
        {
          bankName: 'PULSE Test Bank',
          pixKey: process.env.PULSE_TEST_PIX_KEY || `pulse+wallet-${Date.now()}@kloel.local`,
          bankCode: '260',
          agency: '0001',
          account: String(Date.now()).slice(-6),
          accountType: 'checking',
          isDefault: true,
        },
      );

      if (!addAccountRes.ok || addAccountRes.body?.success === false) {
        const summary = compactSummary(addAccountRes.body) || `HTTP ${addAccountRes.status}`;
        return isProvisioningGap(summary)
          ? buildMissingEvidenceResult(
              spec,
              `wallet-withdrawal could not provision a bank account: ${summary}.`,
              { httpStatus: addAccountRes.status },
              { smokeExecuted: false, replayExecuted: replayMode || replayEnabled(spec) },
            )
          : buildFailureResult(
              spec,
              `wallet-withdrawal failed while provisioning a bank account: ${summary}.`,
              { httpStatus: addAccountRes.status },
              { smokeExecuted: false, replayExecuted: replayMode || replayEnabled(spec) },
            );
      }

      createdBankAccount = true;
    }

    const beforeTransactionsRes = await fetchJsonWithAuth(
      'GET',
      `/kloel/wallet/${auth.workspaceId}/transactions?page=1&type=withdrawal`,
      auth.token,
    );
    const beforeTransactions = Array.isArray(beforeTransactionsRes.body?.transactions)
      ? (beforeTransactionsRes.body.transactions as Array<Record<string, unknown>>)
      : [];

    const withdrawRes = await fetchJsonWithAuth(
      'POST',
      `/kloel/wallet/${auth.workspaceId}/withdraw`,
      auth.token,
      { amount },
    );

    if (!withdrawRes.ok || withdrawRes.body?.success === false) {
      const summary = compactSummary(withdrawRes.body) || `HTTP ${withdrawRes.status}`;
      return isProvisioningGap(summary)
        ? buildMissingEvidenceResult(
            spec,
            `wallet-withdrawal could not execute in the current workspace: ${summary}.`,
            {
              httpStatus: withdrawRes.status,
              requestedAmount: amount,
            },
            { smokeExecuted: false, replayExecuted: replayMode || replayEnabled(spec) },
          )
        : buildFailureResult(
            spec,
            `wallet-withdrawal request failed: ${summary}.`,
            {
              httpStatus: withdrawRes.status,
              requestedAmount: amount,
            },
            { smokeExecuted: false, replayExecuted: replayMode || replayEnabled(spec) },
          );
    }

    const transactionId = String(withdrawRes.body?.transactionId || '').trim();
    const afterBalanceRes = await fetchJsonWithAuth(
      'GET',
      `/kloel/wallet/${auth.workspaceId}/balance`,
      auth.token,
    );
    const afterTransactionsRes = await fetchJsonWithAuth(
      'GET',
      `/kloel/wallet/${auth.workspaceId}/transactions?page=1&type=withdrawal`,
      auth.token,
    );

    if (!afterBalanceRes.ok || !afterTransactionsRes.ok) {
      return buildFailureResult(
        spec,
        `wallet-withdrawal executed but the readback oracle failed: balance HTTP ${afterBalanceRes.status}, transactions HTTP ${afterTransactionsRes.status}.`,
        {
          transactionId: transactionId || 'unknown',
          balanceStatus: afterBalanceRes.status,
          transactionsStatus: afterTransactionsRes.status,
        },
        { smokeExecuted: false, replayExecuted: replayMode || replayEnabled(spec) },
      );
    }

    const availableAfter = Number(afterBalanceRes.body?.available);
    const availableDelta = round2(availableAfter - availableBefore);
    const afterTransactions = Array.isArray(afterTransactionsRes.body?.transactions)
      ? (afterTransactionsRes.body.transactions as Array<Record<string, unknown>>)
      : [];
    const matchedTransaction = afterTransactions.find(
      (item) => String(item.id || '') === transactionId,
    );
    const duplicateCount = afterTransactions.filter(
      (item) => String(item.id || '') === transactionId,
    ).length;
    const deltaMatches =
      Number.isFinite(availableAfter) && Math.abs(availableDelta + amount) <= 0.02;

    if (!transactionId || !matchedTransaction || duplicateCount !== 1 || !deltaMatches) {
      return buildFailureResult(
        spec,
        'wallet-withdrawal did not converge in the ledger oracle after the mutation.',
        {
          transactionFound: Boolean(matchedTransaction),
          duplicateCount,
          availableBefore: round2(availableBefore),
          availableAfter: Number.isFinite(availableAfter) ? round2(availableAfter) : -1,
          availableDelta,
          requestedAmount: amount,
          transactionId: transactionId || 'missing',
          transactionsBefore: beforeTransactions.length,
          transactionsAfter: afterTransactions.length,
          bankAccountCreated: createdBankAccount,
          seededReplayCredit,
          replayCreditTransactionId: replayCreditTransactionId || 'none',
        },
        { smokeExecuted: false, replayExecuted: replayMode || replayEnabled(spec) },
      );
    }

    return buildPassedResult(
      spec,
      replayMode
        ? `wallet-withdrawal replay passed with transaction ${transactionId} and ledger delta ${availableDelta}. Real withdrawal smoke remains opt-in.`
        : `wallet-withdrawal passed with transaction ${transactionId} and ledger delta ${availableDelta}.`,
      {
        transactionId,
        requestedAmount: amount,
        availableBefore: round2(availableBefore),
        availableAfter: round2(availableAfter),
        availableDelta,
        transactionsBefore: beforeTransactions.length,
        transactionsAfter: afterTransactions.length,
        bankAccountCreated: createdBankAccount,
        seededReplayCredit,
        replayCreditTransactionId: replayCreditTransactionId || 'none',
        smokePending: replayMode && spec.smokeRequired,
      },
      { smokeExecuted: !replayMode, replayExecuted: replayMode || replayEnabled(spec) },
    );
  } catch (error) {
    return buildMissingEvidenceResult(
      spec,
      `wallet-withdrawal could not authenticate or reach runtime prerequisites: ${(error as Error).message}.`,
      undefined,
      { smokeExecuted: false, replayExecuted: replayEnabled(spec) },
    );
  }
}
