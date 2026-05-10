'use client';
import { kloelT } from '@/lib/i18n/t';
import { colors, typography } from '@/lib/design-tokens';
import { Plus } from 'lucide-react';
import React, { useId } from 'react';
import { PACKAGE_TYPES, CARRIERS, REGIONS, PRAZO_OPTIONS, OBS_OPTIONS, SHIP_FROM } from './PlanShippingTab.constants';

const cosmosLabelStyle: React.CSSProperties = {
  fontFamily: typography.fontFamily.display,
  fontSize: '11px',
  fontWeight: 600,
  color: colors.text.dust,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
};

const cardStyle: React.CSSProperties = {
  background: colors.background.space,
  border: `1px solid ${colors.border.space}`,
  borderRadius: '6px',
};

const inputStyle: React.CSSProperties = {
  background: colors.background.nebula,
  border: `1px solid ${colors.border.space}`,
  color: colors.text.starlight,
  borderRadius: '6px',
};

const selectClass = 'w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none';
const inputClass = selectClass;

const labelStyle = cosmosLabelStyle;

const sectionTitle = (t: string) => (
  <h3
    className="mb-4 text-sm font-semibold uppercase"
    style={{
      fontFamily: typography.fontFamily.display,
      color: colors.text.starlight,
      letterSpacing: '0.02em',
    }}
  >
    {t}
  </h3>
);

const CosmosRadioGroup = ({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: { value: string; label: string }[];
}) => {
  const groupId = useId();
  return (
    <fieldset>
      <legend className="mb-2 block" style={cosmosLabelStyle}>
        {label}
      </legend>
      <div className="space-y-2">
        {options.map((opt) => (
          <label
            key={opt.value}
            htmlFor={`${groupId}-${opt.value}`}
            className="flex cursor-pointer items-start gap-2.5"
          >
            <input
              id={`${groupId}-${opt.value}`}
              type="radio"
              name={`${groupId}-group`}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              style={{ accentColor: colors.accent.webb }}
              className="mt-0.5"
            />
            <span className="text-sm font-medium" style={{ color: colors.text.starlight }}>
              {opt.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
};

interface SectionProps {
  fid: string;
  packageType: string;
  setPackageType: (v: string) => void;
  width: string;
  setWidth: (v: string) => void;
  height: string;
  setHeight: (v: string) => void;
  length: string;
  setLength: (v: string) => void;
  weight: string;
  setWeight: (v: string) => void;
  whoShips: string;
  setWhoShips: (v: string) => void;
  shipFrom: string;
  setShipFrom: (v: string) => void;
  dispatchTime: string;
  setDispatchTime: (v: string) => void;
  selectedCarriers: string[];
  setSelectedCarriers: React.Dispatch<React.SetStateAction<string[]>>;
  freightType: string;
  setFreightType: (v: string) => void;
  fixedFreight: string;
  setFixedFreight: (v: string) => void;
  hasTracking: string;
  setHasTracking: (v: string) => void;
  regionPrazos: Record<string, { prazo: string; obs: string }>;
  setRegionPrazos: React.Dispatch<React.SetStateAction<Record<string, { prazo: string; obs: string }>>>;
}

export function PlanShippingSections(p: SectionProps) {
  return (
    <>
      {/* Packaging */}
      <div className="rounded-xl p-5" style={cardStyle}>
        {sectionTitle('Embalagem do produto')}
        <div className="grid gap-4 md:grid-cols-5">
          <div className="md:col-span-2">
            <label style={labelStyle} htmlFor={`${p.fid}-pkg-type`}>
              {kloelT(`Tipo de embalagem *`)}
            </label>
            <select
              value={p.packageType}
              onChange={(e) => p.setPackageType(e.target.value)}
              className={`${selectClass} mt-1.5`}
              style={inputStyle}
              id={`${p.fid}-pkg-type`}
            >
              <option value="">{kloelT(`Selecione`)}</option>
              {PACKAGE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle} htmlFor={`${p.fid}-width`}>
              {kloelT(`Largura (cm)`)}
            </label>
            <input
              aria-label="Largura em cm"
              type="number"
              value={p.width}
              onChange={(e) => p.setWidth(e.target.value)}
              className={`${inputClass} mt-1.5`}
              style={inputStyle}
              id={`${p.fid}-width`}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor={`${p.fid}-height`}>
              {kloelT(`Altura (cm)`)}
            </label>
            <input
              aria-label="Altura em cm"
              type="number"
              value={p.height}
              onChange={(e) => p.setHeight(e.target.value)}
              className={`${inputClass} mt-1.5`}
              style={inputStyle}
              id={`${p.fid}-height`}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor={`${p.fid}-length`}>
              {kloelT(`Comprimento (cm)`)}
            </label>
            <input
              aria-label="Comprimento em cm"
              type="number"
              value={p.length}
              onChange={(e) => p.setLength(e.target.value)}
              className={`${inputClass} mt-1.5`}
              style={inputStyle}
              id={`${p.fid}-length`}
            />
          </div>
        </div>
        <div className="mt-3 flex items-end gap-4">
          <div className="w-40">
            <label style={labelStyle} htmlFor={`${p.fid}-weight`}>
              {kloelT(`Peso (kg) *`)}
            </label>
            <input
              aria-label="Peso em kg"
              type="number"
              step="0.1"
              value={p.weight}
              onChange={(e) => p.setWeight(e.target.value)}
              className={`${inputClass} mt-1.5`}
              style={inputStyle}
              id={`${p.fid}-weight`}
            />
          </div>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full text-white transition-all"
            style={{ backgroundColor: colors.accent.webb }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Logistics */}
      <div className="rounded-xl p-5" style={cardStyle}>
        {sectionTitle('Logística de envio')}
        <div className="grid gap-8 md:grid-cols-2">
          <div className="space-y-4">
            <CosmosRadioGroup
              value={p.whoShips}
              onChange={p.setWhoShips}
              label={kloelT(`Quem realiza o envio? *`)}
              options={[
                { value: 'self', label: 'Eu mesmo' },
                { value: 'supplier', label: 'Meu fornecedor' },
                { value: 'fulfillment', label: 'Fulfillment' },
                { value: 'dropshipping', label: 'Dropshipping' },
              ]}
            />
            <CosmosRadioGroup
              value={p.shipFrom}
              onChange={p.setShipFrom}
              label={kloelT(`De onde sai o envio? *`)}
              options={SHIP_FROM.map((s) => ({ value: s.v, label: s.l }))}
            />
            <div>
              <label style={labelStyle} htmlFor={`${p.fid}-dispatch`}>
                {kloelT(`Prazo de despacho *`)}
              </label>
              <select
                value={p.dispatchTime}
                onChange={(e) => p.setDispatchTime(e.target.value)}
                className={`${selectClass} mt-1.5`}
                style={inputStyle}
                id={`${p.fid}-dispatch`}
              >
                <option value="1">{kloelT(`24 horas`)}</option>
                <option value="3">{kloelT(`1-3 dias úteis`)}</option>
                <option value="5">{kloelT(`3-5 dias úteis`)}</option>
                <option value="7">{kloelT(`5-7 dias úteis`)}</option>
                <option value="10">{kloelT(`7-10 dias úteis`)}</option>
                <option value="15">{kloelT(`10-15 dias úteis`)}</option>
              </select>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <span style={labelStyle}>{kloelT(`Transportadoras *`)}</span>
              <div className="space-y-1.5 mt-1.5">
                {CARRIERS.map((c) => (
                  <label
                    key={c}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                    style={{ color: colors.text.starlight }}
                  >
                    <input
                      type="checkbox"
                      checked={p.selectedCarriers.includes(c)}
                      onChange={(e) =>
                        p.setSelectedCarriers(
                          e.target.checked
                            ? [...p.selectedCarriers, c]
                            : p.selectedCarriers.filter((x) => x !== c),
                        )
                      }
                      style={{ accentColor: colors.accent.webb }}
                    />
                    {c}
                  </label>
                ))}
              </div>
            </div>
            <CosmosRadioGroup
              value={p.freightType}
              onChange={p.setFreightType}
              label={kloelT(`Frete para o comprador *`)}
              options={[
                { value: 'free', label: 'Grátis' },
                { value: 'calculated', label: 'Calculado pelo CEP' },
                { value: 'fixed', label: 'Fixo' },
                { value: 'variable', label: 'Variável por região' },
              ]}
            />
            {p.freightType === 'fixed' && (
              <div>
                <label style={labelStyle} htmlFor={`${p.fid}-fixed-val`}>
                  {kloelT(`Valor fixo (R$)`)}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={p.fixedFreight}
                  onChange={(e) => p.setFixedFreight(e.target.value)}
                  className={`${inputClass} mt-1.5`}
                  style={inputStyle}
                  id={`${p.fid}-fixed-val`}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Region Deadlines */}
      <div className="rounded-xl p-5" style={cardStyle}>
        {sectionTitle('Prazos de entrega por região')}
        <div
          className="overflow-x-auto rounded-lg"
          style={{ border: `1px solid ${colors.border.space}` }}
        >
          <table className="w-full text-sm">
            <thead
              style={{
                background: colors.background.nebula,
                borderBottom: `1px solid ${colors.border.space}`,
              }}
            >
              <tr>
                <th className="px-4 py-3 text-left" style={labelStyle}>
                  {kloelT(`Região`)}
                </th>
                <th className="px-4 py-3 text-left" style={labelStyle}>
                  {kloelT(`Prazo estimado`)}
                </th>
                <th className="px-4 py-3 text-left" style={labelStyle}>
                  {kloelT(`Observação`)}
                </th>
              </tr>
            </thead>
            <tbody>
              {REGIONS.map((r, i) => (
                <tr
                  key={r}
                  style={{
                    background: i % 2 === 0 ? colors.background.space : colors.background.void,
                    borderBottom: `1px solid ${colors.border.void}`,
                  }}
                >
                  <td className="px-4 py-3 font-medium" style={{ color: colors.text.starlight }}>
                    {r}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={p.regionPrazos[r]?.prazo}
                      onChange={(e) =>
                        p.setRegionPrazos({
                          ...p.regionPrazos,
                          [r]: { ...p.regionPrazos[r], prazo: e.target.value },
                        })
                      }
                      className="rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                      style={inputStyle}
                    >
                      {PRAZO_OPTIONS.map((po) => (
                        <option key={po} value={po}>
                          {po}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={p.regionPrazos[r]?.obs}
                      onChange={(e) =>
                        p.setRegionPrazos({
                          ...p.regionPrazos,
                          [r]: { ...p.regionPrazos[r], obs: e.target.value },
                        })
                      }
                      className="rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                      style={inputStyle}
                    >
                      {OBS_OPTIONS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tracking */}
      <div className="rounded-xl p-5" style={cardStyle}>
        <CosmosRadioGroup
          value={p.hasTracking}
          onChange={p.setHasTracking}
          label={kloelT(`O produto possui código de rastreamento?`)}
          options={[
            { value: 'all', label: 'Sim, todos os envios' },
            { value: 'sedex', label: 'Sim, apenas SEDEX' },
            { value: 'no', label: 'Não' },
          ]}
        />
      </div>
    </>
  );
}
