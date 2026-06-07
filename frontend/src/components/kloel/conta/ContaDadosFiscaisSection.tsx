'use client';
import { colors } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';
import { useEffect, useRef, useState } from 'react';
import { useFiscalMutations } from '@/hooks/useKyc';
import { kycApi } from '@/lib/api/kyc';
import { useToast } from '@/components/kloel/ToastProvider';
import Icons from './ContaIcons';
import { SORA, EMBER, D_RE } from './ContaConstants';
import { cleanPayload, getErrorMessage, fiscalToFormState } from './ContaHelpers';
import { Field, SaveActions, SectionCard, Spinner } from './ContaShared';
import type { KycFiscal } from './ContaTypes';
import {
  type BrasilApiCnpjResponse,
  type ViaCepResponse,
  mergeCepIntoForm,
  mergeCnpjIntoForm,
} from './ContaView.helpers';
function EnderecoFiscalFields({
  form,
  set,
  cepLoading,
  lookupCep,
}: {
  form: ReturnType<typeof useFiscalForm>['form'];
  set: (k: string, v: string) => void;
  cepLoading: boolean;
  lookupCep: (cep: string) => Promise<void>;
}) {
  return (
    <div style={{ borderTop: '1px solid var(--app-border-subtle)', marginTop: 24, paddingTop: 20 }}>
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--app-text-primary)',
          display: 'block',
          marginBottom: 14,
          fontFamily: SORA,
        }}
      >
        {kloelT(`Endereco fiscal`)}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
        <div style={{ display: 'flex', gap: 14 }}>
          <Field
            label="CEP"
            placeholder="00000-000"
            value={form.cep}
            onChange={(v) => {
              set('cep', v);
              const clean = v.replace(D_RE, '');
              if (clean.length === 8) {
                lookupCep(v);
              }
            }}
            onBlur={() => lookupCep(form.cep)}
            mono
            half
            suffix={cepLoading ? <Spinner size={14} /> : undefined}
          />
          <Field
            label={kloelT(`Rua`)}
            placeholder={kloelT(`Nome da rua`)}
            value={form.rua}
            onChange={(v) => set('rua', v)}
            half
          />
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          <Field
            label={kloelT(`Numero`)}
            placeholder="123"
            value={form.numero}
            onChange={(v) => set('numero', v)}
            mono
            half
          />
          <Field
            label={kloelT(`Complemento`)}
            placeholder={kloelT(`Apt, sala...`)}
            value={form.complemento}
            onChange={(v) => set('complemento', v)}
            half
            required={false}
          />
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          <Field
            label={kloelT(`Bairro`)}
            placeholder={kloelT(`Bairro`)}
            value={form.bairro}
            onChange={(v) => set('bairro', v)}
            half
          />
          <Field
            label={kloelT(`Cidade`)}
            placeholder={kloelT(`Cidade`)}
            value={form.cidade}
            onChange={(v) => set('cidade', v)}
            half
          />
        </div>
        <Field label="UF" placeholder="SP" value={form.uf} onChange={(v) => set('uf', v)} />
      </div>
    </div>
  );
}
type FiscalFormState = ReturnType<typeof fiscalToFormState>;
function useFiscalForm(fiscal: KycFiscal | null) {
  const [tipo, setTipo] = useState<'PF' | 'PJ'>('PF');
  const [form, setForm] = useState<FiscalFormState>({
    cpf: '',
    legalName: '',
    cnpj: '',
    razaoSocial: '',
    nomeFantasia: '',
    inscricaoEstadual: '',
    inscricaoMunicipal: '',
    responsavelCpf: '',
    responsavelNome: '',
    cep: '',
    rua: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',
  });
  useEffect(() => {
    if (fiscal) {
      queueMicrotask(() => setTipo(fiscal.type === 'PJ' || fiscal.cnpj ? 'PJ' : 'PF'));
      queueMicrotask(() => setForm(fiscalToFormState(fiscal)));
    }
  }, [fiscal]);
  const set = (k: string, v: string) => setForm((prev) => ({ ...prev, [k]: v }));
  return { tipo, setTipo, form, set, setForm };
}
export default function DadosFiscaisSection({
  fiscal,
  mutate,
}: {
  fiscal: KycFiscal | null;
  mutate: () => void;
}) {
  const { updateFiscal } = useFiscalMutations();
  const { showToast } = useToast();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  useEffect(
    () => () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    },
    [],
  );
  const { tipo, setTipo, form, set, setForm } = useFiscalForm(fiscal);
  const lookupCnpj = async (cnpj: string) => {
    const clean = cnpj.replace(D_RE, '');
    if (clean.length !== 14) {
      return;
    }
    setCnpjLoading(true);
    setError('');
    try {
      const data: BrasilApiCnpjResponse = await kycApi.lookupCnpj(clean);
      setForm((prev: FiscalFormState) => mergeCnpjIntoForm(prev, data));
    } catch (e) {
      const message = getErrorMessage(e) || 'Nao foi possivel consultar o CNPJ.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setCnpjLoading(false);
    }
  };
  const lookupCep = async (cep: string) => {
    const clean = cep.replace(D_RE, '');
    if (clean.length !== 8) {
      return;
    }
    setCepLoading(true);
    setError('');
    try {
      const data: ViaCepResponse = await kycApi.lookupCep(clean);
      if (data.erro) {
        const message = 'CEP nao encontrado ou invalido.';
        setError(message);
        showToast(message, 'error');
        return;
      }
      setForm((prev: FiscalFormState) => mergeCepIntoForm(prev, data));
    } catch (e) {
      const message = getErrorMessage(e) || 'Nao foi possivel consultar o CEP.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setCepLoading(false);
    }
  };
  const showValidationError = (message: string) => {
    setError(message);
    showToast(message, 'error');
    setSaveStatus('error');
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }
    saveTimer.current = setTimeout(() => setSaveStatus('idle'), 4000);
  };

  const validateFiscalForm = (): string | null => {
    if (tipo === 'PF') {
      if (form.cpf.replace(D_RE, '').length !== 11) {
        return 'Informe um CPF valido.';
      }
      if (!form.legalName.trim()) {
        return 'Informe o nome legal.';
      }
    } else {
      if (form.cnpj.replace(D_RE, '').length !== 14) {
        return 'Informe um CNPJ valido.';
      }
      if (!form.razaoSocial.trim()) {
        return 'Informe a razao social.';
      }
      if (!form.nomeFantasia.trim()) {
        return 'Informe o nome fantasia.';
      }
      if (form.responsavelCpf.replace(D_RE, '').length !== 11) {
        return 'Informe o CPF do responsavel.';
      }
      if (!form.responsavelNome.trim()) {
        return 'Informe o nome do responsavel.';
      }
    }

    if (form.cep.replace(D_RE, '').length !== 8) {
      return 'Informe um CEP valido.';
    }
    if (!form.rua.trim()) {
      return 'Informe a rua.';
    }
    if (!form.numero.trim()) {
      return 'Informe o numero.';
    }
    if (!form.bairro.trim()) {
      return 'Informe o bairro.';
    }
    if (!form.cidade.trim()) {
      return 'Informe a cidade.';
    }
    if (form.uf.trim().length !== 2) {
      return 'Informe a UF com 2 letras.';
    }
    return null;
  };

  const handleSave = async () => {
    setError('');
    setSaveStatus('idle');

    const validationError = validateFiscalForm();
    if (validationError) {
      showValidationError(validationError);
      return;
    }

    setSaving(true);
    try {
      const payload = cleanPayload({
        type: tipo,
        cpf: form.cpf,
        fullName: form.legalName.trim(),
        cnpj: form.cnpj,
        razaoSocial: form.razaoSocial.trim(),
        nomeFantasia: form.nomeFantasia.trim(),
        inscricaoEstadual: form.inscricaoEstadual,
        inscricaoMunicipal: form.inscricaoMunicipal,
        responsavelCpf: form.responsavelCpf,
        responsavelNome: form.responsavelNome.trim(),
        cep: form.cep,
        street: form.rua.trim(),
        number: form.numero.trim(),
        complement: form.complemento,
        neighborhood: form.bairro.trim(),
        city: form.cidade.trim(),
        state: form.uf.trim().toUpperCase(),
      });
      await updateFiscal(payload);
      showToast('Dados fiscais salvos', 'success');
      setSaveStatus('success');
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
      saveTimer.current = setTimeout(() => setSaveStatus('idle'), 3000);
      mutate();
    } catch (e) {
      setError(getErrorMessage(e) || 'Erro ao salvar. Tente novamente.');
      showToast(getErrorMessage(e) || 'Erro ao salvar dados fiscais', 'error');
      setSaveStatus('error');
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
      saveTimer.current = setTimeout(() => setSaveStatus('idle'), 4000);
    }
    setSaving(false);
  };
  const btnStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '10px 0',
    background: active ? 'var(--app-accent-light)' : 'transparent',
    border: active ? `1px solid ${EMBER}` : '1px solid var(--app-border-primary)',
    borderRadius: 6,
    color: active ? EMBER : 'var(--app-text-secondary)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: SORA,
    transition: 'all 150ms ease',
  });
  return (
    <SectionCard
      title={kloelT(`Dados fiscais`)}
      subtitle={kloelT(`Informacoes para emissao de notas e compliance`)}
    >
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button
          type="button"
          onClick={() => setTipo('PF')}
          aria-pressed={tipo === 'PF'}
          style={btnStyle(tipo === 'PF')}
        >
          {kloelT(`Pessoa Fisica (CPF)`)}
        </button>
        <button
          type="button"
          onClick={() => setTipo('PJ')}
          aria-pressed={tipo === 'PJ'}
          style={btnStyle(tipo === 'PJ')}
        >
          {kloelT(`Pessoa Juridica (CNPJ)`)}
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
        {tipo === 'PF' ? (
          <>
            <Field
              label="CPF"
              placeholder="000.000.000-00"
              value={form.cpf}
              onChange={(v) => set('cpf', v)}
              mono
            />
            <Field
              label={kloelT(`Nome legal`)}
              placeholder={kloelT(`Nome conforme documento`)}
              value={form.legalName}
              onChange={(v) => set('legalName', v)}
            />
            <div
              style={{
                background: 'rgba(245,158,11,.04)',
                border: '1px solid rgba(245,158,11,.15)',
                borderRadius: 6,
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
              }}
            >
              <span style={{ color: colors.semantic.warning, marginTop: 2, flexShrink: 0 }}>
                {Icons.alert(16)}
              </span>
              <div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--app-text-primary)',
                    display: 'block',
                    fontFamily: SORA,
                  }}
                >
                  {kloelT(`Limite de saque para CPF`)}
                </span>
                <span
                  style={{ fontSize: 11, color: 'var(--app-text-secondary)', fontFamily: SORA }}
                >
                  {kloelT(`Como pessoa fisica, o limite de saque mensal e de R$ 2.259,20. Para remover esse
                  limite, cadastre um CNPJ.`)}
                </span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 14 }}>
              <Field
                label="CNPJ"
                placeholder={kloelT(`00.000.000/0000-00`)}
                value={form.cnpj}
                onChange={(v) => {
                  set('cnpj', v);
                  const clean = v.replace(D_RE, '');
                  if (clean.length === 14) {
                    lookupCnpj(v);
                  }
                }}
                onBlur={() => lookupCnpj(form.cnpj)}
                mono
                half
                suffix={cnpjLoading ? <Spinner size={14} /> : undefined}
              />
              <Field
                label={kloelT(`Razao social`)}
                placeholder={kloelT(`Razao social da empresa`)}
                value={form.razaoSocial}
                onChange={(v) => set('razaoSocial', v)}
                half
              />
            </div>
            <div style={{ display: 'flex', gap: 14 }}>
              <Field
                label={kloelT(`Nome fantasia`)}
                placeholder={kloelT(`Nome fantasia`)}
                value={form.nomeFantasia}
                onChange={(v) => set('nomeFantasia', v)}
                half
              />
              <Field
                label={kloelT(`Inscricao estadual`)}
                placeholder={kloelT(`Opcional`)}
                value={form.inscricaoEstadual}
                onChange={(v) => set('inscricaoEstadual', v)}
                half
                required={false}
              />
            </div>
            <Field
              label={kloelT(`Inscricao municipal`)}
              placeholder={kloelT(`Opcional`)}
              value={form.inscricaoMunicipal}
              onChange={(v) => set('inscricaoMunicipal', v)}
              required={false}
            />
            <div style={{ display: 'flex', gap: 14 }}>
              <Field
                label={kloelT(`CPF do responsavel`)}
                placeholder="000.000.000-00"
                value={form.responsavelCpf}
                onChange={(v) => set('responsavelCpf', v)}
                mono
                half
              />
              <Field
                label={kloelT(`Nome do responsavel`)}
                placeholder={kloelT(`Nome completo`)}
                value={form.responsavelNome}
                onChange={(v) => set('responsavelNome', v)}
                half
              />
            </div>
          </>
        )}
      </div>
      <EnderecoFiscalFields form={form} set={set} cepLoading={cepLoading} lookupCep={lookupCep} />
      <SaveActions error={error} saveStatus={saveStatus} saving={saving} onSave={handleSave} />
    </SectionCard>
  );
}
