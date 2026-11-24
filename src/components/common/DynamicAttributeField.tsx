import React from 'react';
import type { AssetFieldDefinition, CustomAttributeValue } from '../../types/database';

interface DynamicAttributeFieldProps {
  field: AssetFieldDefinition;
  value: CustomAttributeValue | undefined;
  onChange: (value: CustomAttributeValue) => void;
}

export const DynamicAttributeField: React.FC<DynamicAttributeFieldProps> = ({
  field,
  value,
  onChange,
}) => {
  const inputId = `dyn-attr-${field.key}`;

  if (field.type === 'boolean') {
    const checked = Boolean(value);
    return (
      <div className="flex items-center justify-between gap-3 min-h-[52px] px-3.5 py-2 rounded-xl border border-[#CBD5E1] bg-white">
        <label htmlFor={inputId} className="text-[15px] font-medium text-[#0F172A] cursor-pointer">
          {field.label}
        </label>
        <button
          id={inputId}
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors cursor-pointer shrink-0 ${
            checked ? 'bg-[#10B981]' : 'bg-slate-300'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              checked ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    );
  }

  if (field.type === 'select') {
    return (
      <div>
        <label htmlFor={inputId} className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
          {field.label}
          {field.required && <span className="text-[#B91C1C] ml-1">*</span>}
        </label>
        <select
          id={inputId}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || null)}
          className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] bg-white text-[16px] text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#10B981] focus:border-[#10B981]"
        >
          <option value="">Selecionar opção…</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === 'number') {
    return (
      <div>
        <label htmlFor={inputId} className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
          {field.label}
          {field.required && <span className="text-[#B91C1C] ml-1">*</span>}
        </label>
        <div className="relative">
          <input
            id={inputId}
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={value !== null && value !== undefined ? String(value) : ''}
            placeholder={field.placeholder}
            onChange={(e) => {
              const raw = e.target.value;
              onChange(raw === '' ? null : Number(raw));
            }}
            className={`w-full min-h-12 px-3.5 ${
              field.unit ? 'pr-14' : ''
            } rounded-[10px] border border-[#CBD5E1] bg-white text-[16px] text-[#0F172A] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#10B981] focus:border-[#10B981]`}
          />
          {field.unit && (
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-[#475569] pointer-events-none">
              {field.unit}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={inputId} className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
        {field.label}
        {field.required && <span className="text-[#B91C1C] ml-1">*</span>}
      </label>
      <input
        id={inputId}
        type="text"
        value={typeof value === 'string' ? value : ''}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] bg-white text-[16px] text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#10B981] focus:border-[#10B981]"
      />
    </div>
  );
};

export function formatDynamicAttributeSummary(
  schema: AssetFieldDefinition[],
  attributes: Record<string, CustomAttributeValue>
): Array<{ label: string; display: string }> {
  const result: Array<{ label: string; display: string }> = [];
  for (const field of schema) {
    const val = attributes[field.key];
    if (val === undefined || val === null || val === '') continue;
    if (field.type === 'boolean') {
      result.push({ label: field.label, display: val ? 'Sim' : 'Não' });
    } else if (field.type === 'number' && field.unit) {
      result.push({ label: field.label, display: `${val} ${field.unit}` });
    } else {
      result.push({ label: field.label, display: String(val) });
    }
  }
  return result;
}
