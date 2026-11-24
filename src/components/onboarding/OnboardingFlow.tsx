import React, { useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  CloudSun,
  Database,
  Droplets,
  Lock,
  Mail,
  Sparkles,
  Trash2,
  Trees,
  Upload,
  Wind,
  X,
} from 'lucide-react';
import { VERTICAL_TEMPLATES } from '../../data/seedData';
import { useZelvo } from '../../store/ZelvoContext';
import { compressImageFile } from '../../utils/calculations';
import { PrimaryButton } from '../common/UIPrimitives';
import { ZelvoLogo } from '../common/ZelvoLogo';

interface OnboardingFlowProps {
  onExit: () => void;
}

const BRAND_COLORS = ['#10B981', '#14B8A6', '#0284C7', '#1E293B', '#D97706', '#7C3AED'];

function getVerticalIcon(slug: string): React.ReactNode {
  switch (slug) {
    case 'jardinagem':
      return <Trees className="w-6 h-6" />;
    case 'piscinas':
      return <Droplets className="w-6 h-6" />;
    case 'limpezas':
      return <Sparkles className="w-6 h-6" />;
    case 'avac':
      return <Wind className="w-6 h-6" />;
    default:
      return <Building2 className="w-6 h-6" />;
  }
}

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ onExit }) => {
  const { organization, completeOnboarding, showToast } = useZelvo();

  // Stage: 'login' -> 1 -> 2 -> 3
  const [stage, setStage] = useState<'login' | 1 | 2 | 3>('login');

  // Login form state
  const [loginEmail, setLoginEmail] = useState(organization.email ?? 'tiago@verdeminho.pt');
  const [loginPassword, setLoginPassword] = useState('••••••••');
  const [adminName, setAdminName] = useState('Tiago Ferreira');

  // Step 1: Vertical
  const [selectedVerticalId, setSelectedVerticalId] = useState<string>(
    organization.vertical_id || VERTICAL_TEMPLATES[0].id
  );

  // Step 2: Company identity
  const [companyName, setCompanyName] = useState<string>(organization.name);
  const [nif, setNif] = useState<string>(organization.nif ?? '516482930');
  const [primaryColor, setPrimaryColor] = useState<string>(organization.primary_color || '#10B981');
  const [logoUrl, setLogoUrl] = useState<string | null>(organization.logo_url);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const selectedVertical =
    VERTICAL_TEMPLATES.find((v) => v.id === selectedVerticalId) ?? VERTICAL_TEMPLATES[0];

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStage(1);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const compressed = await compressImageFile(file);
      setLogoUrl(compressed.dataUrl);
      showToast('Logótipo carregado com sucesso.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao carregar logótipo.', 'danger');
    }
  };

  const handleFinish = (mode: 'demo' | 'blank') => {
    completeOnboarding({
      verticalId: selectedVertical.id,
      companyName: companyName.trim() || organization.name,
      nif: nif.trim() || null,
      primaryColor,
      logoUrl,
      adminName,
      adminEmail: loginEmail,
      mode,
    });
    onExit();
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col">
      {/* Top Slate Bar */}
      <header className="bg-[#1E293B] text-white border-b border-slate-700/80 px-4 h-[58px] flex items-center justify-between gap-3">
        <ZelvoLogo variant="dark" size="sm" />
        <button
          type="button"
          onClick={onExit}
          className="min-h-11 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 text-[13px] font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
          <span>Sair do Teste</span>
        </button>
      </header>

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-6 sm:py-10 flex flex-col justify-center">
        {/* SCREEN 0: LOGIN */}
        {stage === 'login' && (
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 sm:p-8 shadow-xs space-y-6">
            <div className="text-center space-y-2">
              <div className="flex justify-center">
                <ZelvoLogo variant="light" size="md" />
              </div>
              <h1 className="text-[22px] font-bold text-[#0F172A] pt-1">
                Bem-vindo ao Zelvo
              </h1>
              <p className="text-[15px] text-[#475569]">
                Gestão de serviços no terreno preparada para trabalhar com ou sem rede.
              </p>
            </div>

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
                  O seu nome
                </label>
                <input
                  type="text"
                  required
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="Ex.: Tiago Ferreira"
                  className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px]"
                />
              </div>

              <div>
                <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
                  Email profissional
                </label>
                <div className="relative">
                  <Mail className="w-5 h-5 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="w-full min-h-12 pl-11 pr-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
                  Palavra-passe
                </label>
                <div className="relative">
                  <Lock className="w-5 h-5 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full min-h-12 pl-11 pr-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px]"
                  />
                </div>
              </div>

              <div className="pt-2">
                <PrimaryButton
                  type="submit"
                  fullWidth
                  icon={<ArrowRight className="w-5 h-5" />}
                >
                  Entrar e Configurar Empresa
                </PrimaryButton>
              </div>
            </form>

            <p className="text-center text-[13px] text-[#64748B]">
              Modo de demonstração local · Os dados ficam guardados no dispositivo (Offline-First).
            </p>
          </div>
        )}

        {/* ONBOARDING STEPS 1..3 */}
        {stage !== 'login' && (
          <div className="space-y-5">
            {/* Step Progress Indicator */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[13px] font-semibold text-[#475569]">
                <span className="text-[#059669] tabular-nums">Passo {stage} de 3</span>
                <span>
                  {stage === 1
                    ? 'Ramo de Atividade'
                    : stage === 2
                      ? 'Identidade da Empresa'
                      : 'Conclusão'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map((stepNum) => (
                  <div
                    key={stepNum}
                    className={`h-2 rounded-full transition-colors ${
                      stepNum <= stage ? 'bg-[#10B981]' : 'bg-slate-200'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* STEP 1: RAMO DE ATIVIDADE */}
            {stage === 1 && (
              <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 sm:p-6 space-y-5">
                <div>
                  <h1 className="text-[22px] font-bold text-[#0F172A]">
                    Qual é o seu ramo de atividade?
                  </h1>
                  <p className="text-[15px] text-[#475569] mt-1">
                    O Zelvo adapta automaticamente o catálogo de serviços, fichas técnicas dos
                    locais e listas de verificação.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {VERTICAL_TEMPLATES.map((vt) => {
                    const isSelected = selectedVerticalId === vt.id;
                    return (
                      <button
                        key={vt.id}
                        type="button"
                        onClick={() => setSelectedVerticalId(vt.id)}
                        className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer space-y-2.5 ${
                          isSelected
                            ? 'bg-[#ECFDF5] border-[#10B981]'
                            : 'bg-white border-[#E2E8F0] hover:border-[#94A3B8]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div
                            className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                              isSelected
                                ? 'bg-[#10B981] text-white'
                                : 'bg-slate-100 text-[#1E293B]'
                            }`}
                          >
                            {getVerticalIcon(vt.slug)}
                          </div>
                          {isSelected && (
                            <span className="w-6 h-6 rounded-full bg-[#10B981] text-white flex items-center justify-center">
                              <Check className="w-4 h-4" />
                            </span>
                          )}
                        </div>

                        <div>
                          <h2 className="text-[16px] font-bold text-[#0F172A]">{vt.name}</h2>
                          <p className="text-[13px] text-[#475569] mt-0.5 tabular-nums">
                            {vt.default_services.length} serviços base ·{' '}
                            {vt.default_checklists.length} passos de verificação
                          </p>
                        </div>

                        <p className="text-[12px] text-[#64748B]">
                          Campos: {vt.asset_schema.map((f) => f.label).slice(0, 3).join(', ')}
                        </p>

                        {vt.feature_flags.weather_alerts && (
                          <p className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#0369A1]">
                            <CloudSun className="w-3.5 h-3.5" />
                            <span>Inclui alertas meteorológicos</span>
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="flex gap-3 pt-2">
                  <PrimaryButton
                    type="button"
                    variant="secondary"
                    onClick={() => setStage('login')}
                    icon={<ArrowLeft className="w-5 h-5" />}
                  >
                    Voltar
                  </PrimaryButton>
                  <PrimaryButton
                    type="button"
                    fullWidth
                    onClick={() => setStage(2)}
                    icon={<ArrowRight className="w-5 h-5" />}
                  >
                    Continuar
                  </PrimaryButton>
                </div>
              </div>
            )}

            {/* STEP 2: IDENTIDADE DA EMPRESA */}
            {stage === 2 && (
              <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 sm:p-6 space-y-5">
                <div>
                  <h1 className="text-[22px] font-bold text-[#0F172A]">
                    Identidade da sua empresa
                  </h1>
                  <p className="text-[15px] text-[#475569] mt-1">
                    Estes dados aparecem nos seus orçamentos em PDF, faturas-recibo e no Portal do
                    Cliente.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
                      Nome Comercial *
                    </label>
                    <input
                      type="text"
                      required
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Ex.: VerdeMinho Paisagismo"
                      className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
                      NIF da Empresa
                    </label>
                    <input
                      type="text"
                      value={nif}
                      onChange={(e) => setNif(e.target.value)}
                      placeholder="516482930"
                      className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px] tabular-nums"
                    />
                  </div>
                </div>

                {/* Brand Color Picker */}
                <div className="space-y-2">
                  <label className="block text-[14px] font-semibold text-[#0F172A]">
                    Cor Primária da Marca
                  </label>
                  <div className="flex flex-wrap items-center gap-2.5">
                    {BRAND_COLORS.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => setPrimaryColor(hex)}
                        aria-label={`Selecionar cor ${hex}`}
                        className={`w-11 h-11 rounded-xl border-2 flex items-center justify-center cursor-pointer transition-transform ${
                          primaryColor === hex
                            ? 'border-[#0F172A] scale-105'
                            : 'border-transparent'
                        }`}
                        style={{ backgroundColor: hex }}
                      >
                        {primaryColor === hex && <Check className="w-5 h-5 text-white" />}
                      </button>
                    ))}
                    <label className="min-h-11 px-3 rounded-xl border border-[#CBD5E1] bg-slate-50 inline-flex items-center gap-2 text-[13px] font-semibold text-[#0F172A] cursor-pointer">
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                      />
                      <span className="tabular-nums uppercase">{primaryColor}</span>
                    </label>
                  </div>
                </div>

                {/* Logo Upload & Preview */}
                <div className="space-y-2">
                  <label className="block text-[14px] font-semibold text-[#0F172A]">
                    Logótipo da Empresa (opcional)
                  </label>
                  <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                      {logoUrl ? (
                        <img
                          src={logoUrl}
                          alt="Pré-visualização do logótipo"
                          className="h-14 max-w-[140px] object-contain rounded-lg bg-white p-1.5 border border-[#E2E8F0]"
                        />
                      ) : (
                        <div
                          className="w-14 h-14 rounded-xl text-white text-[22px] font-bold flex items-center justify-center shrink-0"
                          style={{ backgroundColor: primaryColor }}
                        >
                          {(companyName.trim() || 'Z').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-[15px] font-bold text-[#0F172A] truncate">
                          {companyName.trim() || 'A Minha Empresa'}
                        </p>
                        <p className="text-[13px] text-[#475569]">
                          Pré-visualização no cabeçalho dos documentos
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => void handleLogoUpload(e)}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="min-h-12 px-3.5 rounded-xl bg-white border border-[#CBD5E1] hover:bg-slate-50 text-[14px] font-semibold text-[#0F172A] inline-flex items-center gap-2 cursor-pointer"
                      >
                        <Upload className="w-4 h-4" />
                        <span>Carregar Imagem</span>
                      </button>
                      {logoUrl && (
                        <button
                          type="button"
                          onClick={() => setLogoUrl(null)}
                          aria-label="Remover logótipo"
                          className="min-h-12 min-w-12 rounded-xl border border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C] flex items-center justify-center cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <PrimaryButton
                    type="button"
                    variant="secondary"
                    onClick={() => setStage(1)}
                    icon={<ArrowLeft className="w-5 h-5" />}
                  >
                    Voltar
                  </PrimaryButton>
                  <PrimaryButton
                    type="button"
                    fullWidth
                    onClick={() => setStage(3)}
                    disabled={companyName.trim().length < 2}
                    icon={<ArrowRight className="w-5 h-5" />}
                  >
                    Rever e Concluir
                  </PrimaryButton>
                </div>
              </div>
            )}

            {/* STEP 3: CONCLUSÃO */}
            {stage === 3 && (
              <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 sm:p-6 space-y-5">
                <div className="text-center space-y-2">
                  <div className="w-14 h-14 rounded-2xl bg-[#DCFCE7] text-[#15803D] flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h1 className="text-[22px] font-bold text-[#0F172A]">
                    Tudo pronto para começar!
                  </h1>
                  <p className="text-[15px] text-[#475569]">
                    Escolha se prefere explorar o Zelvo já preenchido com dados de demonstração ou
                    arrancar com um espaço limpo.
                  </p>
                </div>

                {/* Configuration Summary Card */}
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 space-y-3">
                  <div className="flex items-center gap-3.5">
                    {logoUrl ? (
                      <img
                        src={logoUrl}
                        alt={companyName}
                        className="h-12 max-w-[120px] object-contain rounded-lg bg-white p-1 border border-[#E2E8F0]"
                      />
                    ) : (
                      <div
                        className="w-12 h-12 rounded-xl text-white text-[18px] font-bold flex items-center justify-center shrink-0"
                        style={{ backgroundColor: primaryColor }}
                      >
                        {(companyName.trim() || 'Z').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-[16px] font-bold text-[#0F172A] truncate">
                        {companyName.trim() || 'A Minha Empresa'}
                      </p>
                      <p className="text-[13px] text-[#475569] tabular-nums">
                        {selectedVertical.name}
                        {nif.trim() ? ` · NIF ${nif.trim()}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-[#E2E8F0] grid grid-cols-2 gap-2 text-[13px] text-[#475569]">
                    <span>
                      Catálogo base:{' '}
                      <strong className="text-[#0F172A] tabular-nums">
                        {selectedVertical.default_services.length} serviços
                      </strong>
                    </span>
                    <span>
                      Verificações:{' '}
                      <strong className="text-[#0F172A] tabular-nums">
                        {selectedVertical.default_checklists.length} itens
                      </strong>
                    </span>
                  </div>
                </div>

                <div className="space-y-2.5 pt-1">
                  <PrimaryButton
                    type="button"
                    fullWidth
                    onClick={() => handleFinish('demo')}
                    icon={<Database className="w-5 h-5" />}
                  >
                    Carregar Dados Demo
                  </PrimaryButton>

                  <PrimaryButton
                    type="button"
                    variant="secondary"
                    fullWidth
                    onClick={() => handleFinish('blank')}
                    icon={<Sparkles className="w-5 h-5" />}
                  >
                    Começar do Zero
                  </PrimaryButton>

                  <button
                    type="button"
                    onClick={() => setStage(2)}
                    className="w-full min-h-11 text-[14px] font-semibold text-[#475569] hover:text-[#0F172A] cursor-pointer"
                  >
                    ← Voltar e ajustar dados da empresa
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
