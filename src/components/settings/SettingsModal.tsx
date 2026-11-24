import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Download,
  Layers,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { useZelvo } from '../../store/ZelvoContext';
import { compressImageFile } from '../../utils/calculations';
import { Modal, PrimaryButton } from '../common/UIPrimitives';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const BRAND_PRESETS = ['#10B981', '#0284C7', '#0F766E', '#1E293B', '#D97706', '#7C3AED'];

export const SettingsModal: React.FC<SettingsModalProps> = ({ open, onClose }) => {
  const {
    db,
    organization,
    activeVertical,
    updateOrganization,
    switchVertical,
    resetDemoData,
    showToast,
  } = useZelvo();

  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  const [name, setName] = useState(organization.name);
  const [slug, setSlug] = useState(organization.slug);
  const [nif, setNif] = useState(organization.nif ?? '');
  const [phone, setPhone] = useState(organization.phone ?? '');
  const [email, setEmail] = useState(organization.email ?? '');
  const [primaryColor, setPrimaryColor] = useState(organization.primary_color);
  const [logoUrl, setLogoUrl] = useState<string | null>(organization.logo_url);
  const [selectedVerticalId, setSelectedVerticalId] = useState(organization.vertical_id);
  const [loadVerticalServices, setLoadVerticalServices] = useState(true);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(organization.name);
    setSlug(organization.slug);
    setNif(organization.nif ?? '');
    setPhone(organization.phone ?? '');
    setEmail(organization.email ?? '');
    setPrimaryColor(organization.primary_color);
    setLogoUrl(organization.logo_url);
    setSelectedVerticalId(organization.vertical_id);
  }, [open, organization]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, 480, 250 * 1024);
      setLogoUrl(compressed.dataUrl);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Não foi possível carregar o logótipo.',
        'danger'
      );
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSlug =
      slug
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-|-$/g, '') || 'minha-empresa';

    updateOrganization({
      name: name.trim() || organization.name,
      slug: cleanSlug,
      nif: nif.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      primary_color: primaryColor,
      logo_url: logoUrl,
    });

    if (selectedVerticalId !== organization.vertical_id) {
      switchVertical(selectedVerticalId, loadVerticalServices);
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Definições da Empresa & Vertical"
      subtitle="Branding Light White-Label para PDFs e Portal do Cliente"
      size="lg"
    >
      <form onSubmit={handleSave} className="space-y-5">
        {/* Multi-Niche Vertical Switcher */}
        <section className="space-y-2.5 p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#059669]" />
            <div>
              <h3 className="text-[15px] font-bold text-[#0F172A]">
                Vertical de Negócio (Multi-Nicho)
              </h3>
              <p className="text-[13px] text-[#475569]">
                Altera automaticamente os campos dinâmicos de ServiceAsset e checklists padrão.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            {db.vertical_templates.map((vt) => {
              const active = selectedVerticalId === vt.id;
              return (
                <button
                  key={vt.id}
                  type="button"
                  onClick={() => setSelectedVerticalId(vt.id)}
                  className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#DCFCE7] border-[#10B981] text-[#0F172A]'
                      : 'bg-white border-[#CBD5E1] text-[#0F172A] hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[15px]">{vt.name}</span>
                    {active && <Check className="w-4 h-4 text-[#15803D]" />}
                  </div>
                  <p className="text-[12px] text-[#475569] mt-1">
                    Atributos:{' '}
                    {vt.asset_schema.map((f) => f.label).slice(0, 3).join(', ')}
                  </p>
                </button>
              );
            })}
          </div>

          {selectedVerticalId !== activeVertical.id && (
            <label className="flex items-center gap-2.5 pt-1 text-[14px] text-[#0F172A] cursor-pointer">
              <input
                type="checkbox"
                checked={loadVerticalServices}
                onChange={(e) => setLoadVerticalServices(e.target.checked)}
                className="w-4 h-4 accent-[#10B981]"
              />
              <span>Adicionar também os serviços padrão desta vertical ao Catálogo</span>
            </label>
          )}
        </section>

        {/* Company Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
              Nome Comercial *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px]"
            />
          </div>
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
              Slug do Portal Público (/p/[slug])
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[15px] font-mono"
            />
          </div>
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
              NIF
            </label>
            <input
              type="text"
              value={nif}
              onChange={(e) => setNif(e.target.value)}
              className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px] tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
              Telefone / WhatsApp
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px] tabular-nums"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
              Email Comercial
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px]"
            />
          </div>
        </div>

        {/* Brand Color & Logo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-2">
              Cor Primária (PDFs e Portal Cliente)
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {BRAND_PRESETS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setPrimaryColor(hex)}
                  aria-label={`Selecionar cor ${hex}`}
                  className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center cursor-pointer ${
                    primaryColor.toLowerCase() === hex.toLowerCase()
                      ? 'border-[#0F172A] scale-105'
                      : 'border-transparent'
                  }`}
                  style={{ backgroundColor: hex }}
                >
                  {primaryColor.toLowerCase() === hex.toLowerCase() && (
                    <Check className="w-4 h-4 text-white" />
                  )}
                </button>
              ))}
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                aria-label="Escolher cor personalizada"
                className="w-10 h-10 rounded-xl border border-[#CBD5E1] cursor-pointer p-0.5 bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-2">
              Logótipo da Empresa (PNG/JPG)
            </label>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void handleLogoUpload(e)}
            />
            {logoUrl ? (
              <div className="flex items-center gap-3 p-2.5 rounded-xl border border-[#CBD5E1] bg-white">
                <img
                  src={logoUrl}
                  alt="Logótipo da empresa"
                  className="h-11 max-w-[120px] object-contain"
                />
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => setLogoUrl(null)}
                  className="min-h-[40px] px-2.5 rounded-lg text-[#B91C1C] hover:bg-red-50 flex items-center gap-1 text-[13px] font-semibold cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Remover</span>
                </button>
              </div>
            ) : (
              <PrimaryButton
                type="button"
                variant="secondary"
                fullWidth
                onClick={() => logoInputRef.current?.click()}
                icon={<Upload className="w-4 h-4" />}
              >
                Carregar Logótipo
              </PrimaryButton>
            )}
          </div>
        </div>

        {/* PWA Install & Demo Reset */}
        <div className="pt-3 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2.5">
          {!isInstalled && (isInstallable || isIOS) ? (
            <button
              type="button"
              onClick={() => {
                if (isInstallable) {
                  void install();
                } else {
                  setShowIOSGuide((v) => !v);
                }
              }}
              className="inline-flex items-center gap-2 min-h-[44px] px-3.5 rounded-lg border border-[#10B981] bg-[#DCFCE7] text-[#15803D] text-[14px] font-semibold cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Instalar App (PWA)</span>
            </button>
          ) : (
            <span className="text-[13px] text-[#475569]">
              {isInstalled ? 'App instalada no dispositivo (PWA)' : 'Pronto para funcionamento offline'}
            </span>
          )}

          <button
            type="button"
            onClick={() => {
              resetDemoData();
              onClose();
            }}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-lg border border-[#CBD5E1] text-[14px] font-semibold text-[#475569] hover:text-[#0F172A] hover:bg-slate-50 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Repor Dados Demo (Braga)</span>
          </button>
        </div>

        {showIOSGuide && (
          <div className="p-3.5 rounded-xl bg-[#E0F2FE] text-[#0369A1] text-[14px]">
            No Safari (iPhone/iPad): toque no botão <strong>Partilhar</strong> e selecione{' '}
            <strong>Adicionar ao ecrã principal</strong>.
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <PrimaryButton type="button" variant="secondary" fullWidth onClick={onClose}>
            Cancelar
          </PrimaryButton>
          <PrimaryButton type="submit" fullWidth>
            Guardar Definições
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
};
